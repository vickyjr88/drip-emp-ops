import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CartLeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination.util';
import { withFirstLineImage } from '../common/cart-lead-image.util';
import { normalizePhoneNumber } from '../common/phone.util';
import { OwnerNotificationService } from '../email-log/owner-notification.service';
import { CampaignService } from '../campaign/campaign.service';
import { RecordCartLeadDto, RecordWhatsAppClickDto } from './dto/cart-lead.dto';
import { CartLeadQueryDto } from './dto/cart-lead-query.dto';
import { CartReminderQueueService } from './cart-reminder-queue.service';

@Injectable()
export class CartLeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownerNotification: OwnerNotificationService,
    private readonly reminderQueue: CartReminderQueueService,
    private readonly campaign: CampaignService,
  ) {}

  /**
   * Resolves the same de_attr cookie contents checkout does, for whichever
   * of the two is present. No self-referral guard here -- unlike checkout,
   * there is no "customer placing this order" to compare against yet, since
   * a WhatsApp click or lead happens before any identity is established.
   */
  private async resolveAttribution(referralCode?: string, campaignCode?: string) {
    let referredByCustomerId: string | null = null;
    if (referralCode) {
      const referrer = await this.prisma.customer.findUnique({ where: { referralCode }, select: { id: true } });
      referredByCustomerId = referrer?.id ?? null;
    }
    let attributedCampaignId: string | null = null;
    if (campaignCode) {
      attributedCampaignId = await this.campaign.resolveActiveCampaignId(campaignCode);
    }
    return { referredByCustomerId, attributedCampaignId };
  }

  /**
   * A cart with nobody to reach is not a lead, only browsing -- the caller
   * (both the WhatsApp click and the abandoned-cart sync) is expected to have
   * checked this already, but it is enforced again here since this is the
   * public boundary and the request body cannot be trusted.
   */
  async record(dto: RecordCartLeadDto) {
    // A name alone is not a way to reach anyone -- and was the actual
    // spam gap: an unauthenticated bot could POST any name string with no
    // phone or email and still get a row created (and, on the abandoned-cart
    // path, an owner-notification email and a scheduled reminder). Phone and
    // email are already format-validated on the DTO (IsValidPhoneNumber,
    // IsEmail), so requiring one of *those* specifically, not just any
    // non-empty field, is what actually closes it.
    if (!dto.customerPhone?.trim() && !dto.customerEmail?.trim()) {
      throw new BadRequestException('A cart lead needs a valid phone number or email to be worth recording.');
    }
    // Stored in one canonical shape (E.164) regardless of how it was typed
    // -- 0722..., 254722... and +254722... would otherwise all be treated
    // as different customers by anything matching on customerPhone later
    // (the dedup lookup below, staff search, a future Customer match).
    // Safe to assume it parses: the DTO's IsValidPhoneNumber already
    // rejected anything that wouldn't.
    const customerPhone = dto.customerPhone ? normalizePhoneNumber(dto.customerPhone) : undefined;

    const subtotal = dto.lines.reduce((sum, line) => sum + line.priceKes * line.quantity, 0);
    const shipping = dto.shipping ?? 0;

    const customer = dto.customerEmail
      ? await this.prisma.customer.findUnique({ where: { email: dto.customerEmail } })
      : null;
    const { referredByCustomerId, attributedCampaignId } = await this.resolveAttribution(dto.referralCode, dto.campaignCode);

    return this.prisma.cartLead.create({
      data: {
        source: dto.source,
        customerId: customer?.id,
        customerName: dto.customerName,
        customerPhone,
        customerEmail: dto.customerEmail,
        shippingAddress: dto.shippingAddress,
        lines: dto.lines as unknown as Prisma.InputJsonValue,
        subtotal: new Prisma.Decimal(subtotal),
        shipping: new Prisma.Decimal(shipping),
        total: new Prisma.Decimal(subtotal + shipping),
        message: dto.message,
        referredByCustomerId,
        attributedCampaignId,
      },
    });
  }

  /**
   * A tap on any WhatsApp link, with or without a name/phone/email attached
   * -- unlike record() above, this never requires contact info, since most
   * taps (the floating button, "ask about sizes") never carry any. Silent
   * no-op on an unattributed, organic tap is not right here: every click is
   * recorded regardless, with campaignId/resellerId simply null, so the
   * shop-wide WhatsApp click total stays accurate and not just the
   * attributed slice of it.
   */
  async recordWhatsAppClick(dto: RecordWhatsAppClickDto) {
    const { referredByCustomerId, attributedCampaignId } = await this.resolveAttribution(dto.referralCode, dto.campaignCode);
    await this.prisma.whatsAppClick.create({
      data: { source: dto.source, resellerId: referredByCustomerId, campaignId: attributedCampaignId },
    });
    return { recorded: true };
  }

  async findAll(query: CartLeadQueryDto) {
    const { skip, take, search, source, status, outstanding } = query;
    // `status` is an exact match on one status (the history page's own
    // dropdown); `outstanding` picks a pair of statuses at once (the live
    // worklist's "still open" vs. the history page's "already resolved").
    // A caller is only ever expected to send one, but `status` wins if both
    // somehow arrive, since it is the more specific request.
    const statusFilter: Prisma.CartLeadWhereInput['status'] = status
      ? status
      : outstanding === true
        ? { in: ['NEW', 'CONTACTED'] }
        : outstanding === false
          ? { in: ['EXPIRED', 'CONVERTED'] }
          : undefined;
    const where: Prisma.CartLeadWhereInput = {
      ...(source ? { source } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { customerName: { contains: search.trim(), mode: 'insensitive' } },
              { customerPhone: { contains: search.trim(), mode: 'insensitive' } },
              { customerEmail: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const page = await paginate(
      (args) =>
        this.prisma.cartLead.findMany({
          ...args,
          where,
          orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }],
          include: {
            customer: { select: { id: true, firstName: true, lastName: true } },
            // A converted lead's own trail to what it became -- the history
            // view links straight to the order instead of just saying "converted".
            order: { select: { id: true, orderNumber: true } },
          },
        }),
      () => this.prisma.cartLead.count({ where }),
      skip,
      take,
    );

    return { ...page, items: await withFirstLineImage(this.prisma, page.items) };
  }

  async setStatus(id: string, status: CartLeadStatus) {
    const lead = await this.prisma.cartLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Cart lead ${id} not found`);
    return this.prisma.cartLead.update({ where: { id }, data: { status } });
  }

  /**
   * Links the lead to the order staff created from it, so it drops off the
   * outstanding list without losing the trail that produced the sale.
   *
   * Also copies whichever campaign/reseller attribution the lead captured
   * onto the order itself -- only when the order doesn't already carry its
   * own (an order created directly with a referral/campaign code wins;
   * this only fills a gap, never overwrites). Without this, a WhatsApp sale
   * would be permanently invisible to campaign and reseller stats, since
   * staff create these orders manually with no checkout flow to resolve a
   * code through.
   */
  async markConverted(id: string, orderId: string) {
    const lead = await this.prisma.cartLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Cart lead ${id} not found`);
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    if (!order.referredByCustomerId && !order.attributedCampaignId
      && (lead.referredByCustomerId || lead.attributedCampaignId)) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          referredByCustomerId: lead.referredByCustomerId,
          attributedCampaignId: lead.attributedCampaignId,
        },
      });
    }

    return this.prisma.cartLead.update({
      where: { id },
      data: { status: CartLeadStatus.CONVERTED, orderId },
    });
  }

  /**
   * An abandoned-cart sync from the same shopper replaces the earlier
   * snapshot rather than piling up duplicate rows -- it is one ongoing cart,
   * not a new lead each time an item is added.
   */
  async upsertAbandoned(dto: RecordCartLeadDto) {
    // A name alone is not a way to reach anyone -- and was the actual
    // spam gap: an unauthenticated bot could POST any name string with no
    // phone or email and still get a row created (and, on the abandoned-cart
    // path, an owner-notification email and a scheduled reminder). Phone and
    // email are already format-validated on the DTO (IsValidPhoneNumber,
    // IsEmail), so requiring one of *those* specifically, not just any
    // non-empty field, is what actually closes it.
    if (!dto.customerPhone?.trim() && !dto.customerEmail?.trim()) {
      throw new BadRequestException('A cart lead needs a valid phone number or email to be worth recording.');
    }
    // Same canonical-shape reasoning as record() above -- without this, the
    // same shopper syncing from two slightly different phone formats would
    // be treated as two different leads instead of one ongoing cart.
    const customerPhone = dto.customerPhone ? normalizePhoneNumber(dto.customerPhone) : undefined;

    // Email or phone is guaranteed present by the check above, so this
    // always has a real value to match on -- no customerName fallback
    // needed (name alone is no longer accepted as identifying a lead).
    const existing = await this.prisma.cartLead.findFirst({
      where: {
        source: 'ABANDONED_CART',
        status: 'NEW',
        ...(dto.customerEmail ? { customerEmail: dto.customerEmail } : { customerPhone }),
      },
    });

    const subtotal = dto.lines.reduce((sum, line) => sum + line.priceKes * line.quantity, 0);
    const shipping = dto.shipping ?? 0;
    const data = {
      customerName: dto.customerName,
      customerPhone,
      customerEmail: dto.customerEmail,
      shippingAddress: dto.shippingAddress,
      lines: dto.lines as unknown as Prisma.InputJsonValue,
      subtotal: new Prisma.Decimal(subtotal),
      shipping: new Prisma.Decimal(shipping),
      total: new Prisma.Decimal(subtotal + shipping),
      lastActivityAt: new Date(),
    };

    if (existing) {
      return this.prisma.cartLead.update({ where: { id: existing.id }, data });
    }

    const created = await this.prisma.cartLead.create({ data: { ...data, source: 'ABANDONED_CART' } });
    // Only on the first sync for this cart -- later syncs are the same
    // shopper still typing, not a new abandonment to report each time.
    void this.ownerNotification.notifyAbandonedCart({
      customerName: created.customerName,
      customerPhone: created.customerPhone,
      customerEmail: created.customerEmail,
      lines: dto.lines,
      total: Number(created.total),
    });
    // Fire-and-forget like the owner notification above: this endpoint is
    // public and polled periodically, so it must never be slowed or fail
    // because Redis is briefly unreachable.
    void this.reminderQueue.scheduleReminder(created.id);
    return created;
  }

  /**
   * How many leads are sitting outstanding, and how many of all the leads
   * ever recorded actually turned into an order -- the number that answers
   * "is chasing these worth the time", which the raw list does not.
   */
  async stats() {
    const [bySource, byStatus, outstandingValue, converted, total] = await Promise.all([
      this.prisma.cartLead.groupBy({ by: ['source'], _count: true }),
      this.prisma.cartLead.groupBy({ by: ['status'], _count: true }),
      this.prisma.cartLead.aggregate({
        where: { status: { in: ['NEW', 'CONTACTED'] } },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.cartLead.count({ where: { status: 'CONVERTED' } }),
      this.prisma.cartLead.count(),
    ]);

    return {
      total,
      bySource: bySource.map((row) => ({ source: row.source, count: row._count })),
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count })),
      outstanding: { count: outstandingValue._count, value: Number(outstandingValue._sum.total ?? 0) },
      converted,
      // Against every lead ever recorded, including ones still open or that
      // expired without converting -- so this reads as "how many of all the
      // leads we've had actually became a sale", not a rate inflated by
      // excluding the ones that didn't.
      conversionRate: total ? Math.round((converted / total) * 1000) / 10 : null,
    };
  }
}
