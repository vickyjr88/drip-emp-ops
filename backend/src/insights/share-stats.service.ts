import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ShareStats = {
  from: Date;
  to: Date;
  /** Every tap on a share button in the period. */
  total: number;
  /** How many different people shared. */
  sharers: number;
  /** Shares that carried an affiliate's referral code, and the rest (a customer sending a plain link). */
  withCode: number;
  withoutCode: number;
  byChannel: Array<{ channel: string; count: number }>;
  topProducts: Array<{ slug: string; name: string; count: number }>;
  topSharers: Array<{ customerId: string; name: string; affiliate: boolean; count: number }>;
};

/**
 * What people shared from the Share page: how often, where to, which products and who. It counts taps on a share button (the share screen was opened, the
 * link copied or the picture handed over), because WhatsApp and the networks tell a website nothing about what happened next. What a share brought in is
 * already counted per affiliate (link clicks, orders, WhatsApp leads); this is the activity at the front of that.
 */
@Injectable()
export class ShareStatsService {
  constructor(private prisma: PrismaService) {}

  async summary(from: Date, to: Date): Promise<ShareStats> {
    const where = { createdAt: { gte: from, lte: to } };
    const [total, byCode, byChannel, byProduct, bySharer] = await Promise.all([
      this.prisma.shareEvent.count({ where }),
      this.prisma.shareEvent.groupBy({ by: ['withCode'], where, _count: { _all: true } }),
      this.prisma.shareEvent.groupBy({ by: ['channel'], where, _count: { _all: true } }),
      this.prisma.shareEvent.groupBy({ by: ['productSlug'], where: { ...where, productSlug: { not: null } }, _count: { _all: true }, orderBy: { _count: { productSlug: 'desc' } }, take: 10 }),
      this.prisma.shareEvent.groupBy({ by: ['customerId'], where, _count: { _all: true }, orderBy: { _count: { customerId: 'desc' } } }),
    ]);

    const slugs = byProduct.map((r) => r.productSlug).filter((s): s is string => Boolean(s));
    const products = slugs.length ? await this.prisma.product.findMany({ where: { slug: { in: slugs } }, select: { slug: true, name: true } }) : [];
    const top = bySharer.slice(0, 10);
    const people = top.length
      ? await this.prisma.customer.findMany({ where: { id: { in: top.map((r) => r.customerId) } }, select: { id: true, firstName: true, lastName: true, priceTier: true, businessName: true } })
      : [];

    return {
      from, to, total,
      sharers: bySharer.length,
      withCode: byCode.find((r) => r.withCode)?._count._all ?? 0,
      withoutCode: byCode.find((r) => !r.withCode)?._count._all ?? 0,
      byChannel: byChannel.map((r) => ({ channel: r.channel, count: r._count._all })).sort((a, b) => b.count - a.count),
      topProducts: byProduct.map((r) => ({ slug: r.productSlug as string, name: products.find((p) => p.slug === r.productSlug)?.name ?? (r.productSlug as string), count: r._count._all })),
      topSharers: top.map((r) => {
        const person = people.find((p) => p.id === r.customerId);
        return {
          customerId: r.customerId,
          name: person ? (person.businessName || `${person.firstName} ${person.lastName}`.trim()) : 'Deleted customer',
          affiliate: Boolean(person && person.priceTier !== 'RETAIL'),
          count: r._count._all,
        };
      }),
    };
  }
}
