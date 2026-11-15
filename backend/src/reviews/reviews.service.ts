import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OrderStatus, ReviewStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { greetingName } from '../common/follow-up';
import { normalizePhoneNumber } from '../common/phone.util';
import { storefrontOrigin } from '../common/storefront-origin';
import {
  cleanContact, cleanReview, displayNameOf, distribution, enoughToShow, orderNumberOfToken, reviewThresholds, reviewToken, reviewerKeyOf, summarise,
} from './reviews.rules';

/** What the storefront may know about a review: a name and initial, the stars, the words, whether it was a verified purchase, and the shop's reply. */
export type PublicReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  displayName: string;
  verified: boolean;
  createdAt: Date;
  reply: string | null;
  repliedAt: Date | null;
};

/**
 * A product's reviews as the storefront sees them. **Below the threshold nothing about the reviews is revealed**: no list, no average, no spread
 * of stars; only how many there are and how many it takes, which is what lets the page invite the next one without showing a thin picture.
 */
export type ProductReviewsView = {
  visible: boolean;
  count: number;
  average: number | null;
  distribution: number[] | null;
  minToShow: number;
  items: PublicReview[];
};

/** An order is ready to be reviewed once it is paid: from then on the customer has bought it. */
const REVIEWABLE: OrderStatus[] = ['PAID', 'PACKED', 'SHIPPED', 'DELIVERED'];

const PUBLIC_SELECT = { id: true, rating: true, title: true, body: true, displayName: true, verifiedPurchase: true, createdAt: true, reply: true, repliedAt: true } as const;
/** What staff see of a review: everything but the hash that keeps one person to one review. */
const forStaff = <T extends { reviewerKey: string }>({ reviewerKey: _hash, ...rest }: T) => rest;
const asPublic = (r: { id: string; rating: number; title: string | null; body: string; displayName: string; verifiedPurchase: boolean; createdAt: Date; reply: string | null; repliedAt: Date | null }): PublicReview => ({
  id: r.id, rating: r.rating, title: r.title, body: r.body, displayName: r.displayName, verified: r.verifiedPurchase, createdAt: r.createdAt, reply: r.reply, repliedAt: r.repliedAt,
});

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- what the storefront sees ----------------------------------------------------------------------------------------------

  /** A product's reviews, shown only when it has enough approved ones. `offset` and `limit` page through them, newest first. */
  async forProduct(productId: string, page: { offset?: number; limit?: number } = {}): Promise<ProductReviewsView> {
    const minToShow = reviewThresholds().product;
    const grouped = await this.prisma.productReview.groupBy({ by: ['rating'], where: { productId, status: 'APPROVED' }, _count: { _all: true } });
    const ratings = grouped.flatMap((g) => Array(g._count._all).fill(g.rating) as number[]);
    const { count, average } = summarise(ratings);
    if (!enoughToShow(count, minToShow)) return { visible: false, count, average: null, distribution: null, minToShow, items: [] };

    const items = await this.prisma.productReview.findMany({
      where: { productId, status: 'APPROVED' },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: Math.max(0, page.offset ?? 0),
      take: Math.min(50, Math.max(1, page.limit ?? 10)),
      select: PUBLIC_SELECT,
    });
    return { visible: true, count, average, distribution: distribution(ratings), minToShow, items: items.map(asPublic) };
  }

  /** The same, by the product's address. */
  async forSlug(slug: string, page: { offset?: number; limit?: number } = {}) {
    const product = await this.prisma.product.findFirst({ where: { slug, isActive: true }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
    return this.forProduct(product.id, page);
  }

  /** The whole shop's rating, shown only when there are enough approved reviews in all. */
  async siteSummary(): Promise<{ visible: boolean; count: number; average: number | null; minToShow: number }> {
    const minToShow = reviewThresholds().site;
    const grouped = await this.prisma.productReview.groupBy({ by: ['rating'], where: { status: 'APPROVED' }, _count: { _all: true } });
    const { count, average } = summarise(grouped.flatMap((g) => Array(g._count._all).fill(g.rating) as number[]));
    return enoughToShow(count, minToShow) ? { visible: true, count, average, minToShow } : { visible: false, count, average: null, minToShow };
  }

  /**
   * A review left on a product page. Anyone may write one; it is held until staff approve it, and is never marked as a verified purchase (that
   * needs the link for an order). A phone number or email is asked for so a review can be checked and one person leaves one: it is never shown.
   * A filled-in hidden field is a robot: it is thanked and dropped.
   */
  async submit(slug: string, body: Record<string, unknown>) {
    const product = await this.prisma.product.findFirst({ where: { slug, isActive: true }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
    if (typeof body.website === 'string' && body.website.trim()) return { received: true };

    const review = cleanReview(body);
    const contact = cleanContact(body);
    const name = typeof body.name === 'string' ? body.name : '';
    if (displayNameOf(name) === 'A customer') throw new BadRequestException('Please add your first name.');

    try {
      await this.prisma.productReview.create({
        data: {
          productId: product.id, ...review,
          displayName: displayNameOf(name),
          reviewerKey: reviewerKeyOf({ phone: contact.phone, email: contact.email }),
          reviewerContact: contact.phone ?? contact.email,
          source: 'product-page',
        },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') throw new BadRequestException('You have already reviewed this pair. Thank you!');
      throw error;
    }
    return { received: true };
  }

  // --- the link for an order --------------------------------------------------------------------------------------------------

  private async reviewableOrder(token: string) {
    const orderNumber = orderNumberOfToken(token);
    const order = orderNumber
      ? await this.prisma.order.findFirst({
          where: { orderNumber },
          include: { lines: { include: { variant: { select: { product: { select: { id: true, name: true, slug: true, imageUrls: true, isActive: true } } } } } } },
        })
      : null;
    if (!order) throw new NotFoundException('This review link is not valid.');
    if (!REVIEWABLE.includes(order.status)) throw new BadRequestException('This order is not ready to review yet. Please come back once you have received it.');
    const products = new Map<string, { id: string; name: string; slug: string; imageUrl: string | null }>();
    for (const line of order.lines) {
      const p = line.variant.product;
      if (p.isActive && !products.has(p.id)) products.set(p.id, { id: p.id, name: p.name, slug: p.slug, imageUrl: Array.isArray(p.imageUrls) ? ((p.imageUrls as string[])[0] ?? null) : null });
    }
    const key = reviewerKeyOf({ customerId: order.customerId, phone: order.customerPhone, email: order.customerEmail });
    return { order, products, key };
  }

  /** What an order's review link shows: the pairs in the order, and which of them this customer has already reviewed. */
  async orderForToken(token: string) {
    const { order, products, key } = await this.reviewableOrder(token);
    const done = await this.prisma.productReview.findMany({ where: { reviewerKey: key, productId: { in: [...products.keys()] } }, select: { productId: true } });
    const reviewed = new Set(done.map((d) => d.productId));
    return {
      orderNumber: order.orderNumber,
      firstName: greetingName(order.customerName),
      items: [...products.values()].map((p) => ({ slug: p.slug, name: p.name, imageUrl: p.imageUrl, reviewed: reviewed.has(p.id) })),
    };
  }

  /** Reviews left through an order's link: marked as verified purchases, and held for approval like any other. */
  async submitForOrder(token: string, items: unknown) {
    if (!Array.isArray(items) || items.length === 0 || items.length > 20) throw new BadRequestException('Choose a rating for at least one pair.');
    const { order, products, key } = await this.reviewableOrder(token);
    const bySlug = new Map([...products.values()].map((p) => [p.slug, p]));
    const prepared = items.map((item: any) => {
      const product = bySlug.get(String(item?.productSlug ?? ''));
      if (!product) throw new BadRequestException('One of those pairs is not in this order.');
      return { product, review: cleanReview(item) };
    });

    let created = 0;
    let alreadyReviewed = 0;
    for (const { product, review } of prepared) {
      try {
        await this.prisma.productReview.create({
          data: {
            productId: product.id, ...review,
            displayName: displayNameOf(order.customerName),
            reviewerKey: key,
            reviewerContact: order.customerPhone ?? order.customerEmail,
            verifiedPurchase: true,
            source: 'order-link',
            orderId: order.id,
          },
        });
        created += 1;
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2002') throw error;
        alreadyReviewed += 1;
      }
    }
    return { created, alreadyReviewed };
  }

  // --- staff ------------------------------------------------------------------------------------------------------------------

  async list(query: { status?: ReviewStatus; productId?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.ProductReviewWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.productId ? { productId: query.productId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
        include: { product: { select: { id: true, name: true, slug: true } }, order: { select: { orderNumber: true } } },
      }),
      this.prisma.productReview.count({ where }),
    ]);
    return { items: rows.map(forStaff), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** What is waiting, and where the storefront stands against the thresholds. */
  async counts() {
    const [byStatus, site] = await Promise.all([this.prisma.productReview.groupBy({ by: ['status'], _count: { _all: true } }), this.siteSummary()]);
    const n = (s: ReviewStatus) => byStatus.find((g) => g.status === s)?._count._all ?? 0;
    const thresholds = reviewThresholds();
    return { pending: n('PENDING'), approved: n('APPROVED'), rejected: n('REJECTED'), minPerProduct: thresholds.product, minForSite: thresholds.site, siteVisible: site.visible };
  }

  /** How many approved reviews a product has and whether that is enough for its reviews to show: what staff want to know after approving one. */
  private async visibility(productId: string) {
    const approved = await this.prisma.productReview.count({ where: { productId, status: 'APPROVED' } });
    const minToShow = reviewThresholds().product;
    return { approved, minToShow, visible: enoughToShow(approved, minToShow) };
  }

  /** Approves, rejects or reopens a review, and/or writes the shop's public reply. Nothing is shown until a person approves it. */
  async moderate(id: string, change: { status?: ReviewStatus; reply?: string | null; rejectionReason?: string | null }, actor: string) {
    const existing = await this.prisma.productReview.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Review not found');
    const data: Prisma.ProductReviewUpdateInput = {};
    if (change.status && change.status !== existing.status) {
      data.status = change.status;
      data.moderatedBy = actor;
      data.moderatedAt = new Date();
      data.rejectionReason = change.status === 'REJECTED' ? (change.rejectionReason?.trim().slice(0, 200) || null) : null;
    }
    if (change.reply !== undefined) {
      const reply = (change.reply ?? '').trim();
      if (reply.length > 500) throw new BadRequestException('Keep the reply under 500 characters.');
      data.reply = reply || null;
      data.repliedAt = reply ? new Date() : null;
    }
    const review = Object.keys(data).length ? await this.prisma.productReview.update({ where: { id }, data }) : existing;
    return { review: forStaff(review), product: await this.visibility(review.productId) };
  }

  async remove(id: string) {
    const existing = await this.prisma.productReview.findUnique({ where: { id }, select: { productId: true } });
    if (!existing) throw new NotFoundException('Review not found');
    await this.prisma.productReview.delete({ where: { id } });
    return { removed: true, product: await this.visibility(existing.productId) };
  }

  /**
   * A review a customer sent the shop some other way (a message, a Google review), typed in by staff. It is approved at once and marked as staff
   * entered, never as a verified purchase. Only words a customer really wrote belong here.
   */
  async addManual(input: { productId: string; rating: unknown; title?: unknown; body: unknown; name: unknown }, actor: string) {
    const product = await this.prisma.product.findUnique({ where: { id: input.productId }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
    const review = cleanReview(input);
    const name = typeof input.name === 'string' ? input.name : '';
    if (displayNameOf(name) === 'A customer') throw new BadRequestException('Add the customer\'s first name.');
    const created = await this.prisma.productReview.create({
      data: {
        productId: product.id, ...review, displayName: displayNameOf(name), reviewerKey: `m:${randomUUID()}`,
        status: 'APPROVED', source: 'staff', moderatedBy: actor, moderatedAt: new Date(),
      },
    });
    return { review: forStaff(created), product: await this.visibility(product.id) };
  }

  /**
   * Recent paid orders whose customers could be asked for a review, each with the link and a WhatsApp message ready to send. The shop's customers
   * are reached on WhatsApp, so this is where the reviews come from: staff send the link to the people who have received their pairs.
   */
  async requests(originHeader?: string) {
    const origin = storefrontOrigin(originHeader);
    const since = new Date(Date.now() - 60 * 86_400_000);
    const orders = await this.prisma.order.findMany({
      where: { status: { in: REVIEWABLE }, placedAt: { gte: since }, customerPhone: { not: null } },
      orderBy: { placedAt: 'desc' },
      take: 50,
      include: { lines: { include: { variant: { select: { product: { select: { id: true, name: true } } } } } }, reviews: { select: { productId: true } } },
    });
    return orders.map((order) => {
      const products = new Map<string, string>();
      for (const line of order.lines) products.set(line.variant.product.id, line.variant.product.name);
      const reviewed = new Set(order.reviews.map((r) => r.productId));
      const allReviewed = [...products.keys()].every((id) => reviewed.has(id));
      const link = `${origin}/review/${reviewToken(order.orderNumber)}`;
      const names = [...products.values()];
      const phone = normalizePhoneNumber(order.customerPhone ?? '')?.replace(/\D/g, '') ?? null;
      const message = `Hi ${greetingName(order.customerName)}, thank you for shopping at Drip Emporium! How are your ${names.length === 1 ? names[0] : 'new pairs'}? A short review helps other shoppers choose, and takes a minute: ${link}`;
      return {
        orderNumber: order.orderNumber, status: order.status, placedAt: order.placedAt, customerName: order.customerName, phone,
        products: names, allReviewed, reviewsLeft: reviewed.size, link, whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null,
      };
    });
  }
}
