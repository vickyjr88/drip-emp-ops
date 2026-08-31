import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignQueryDto } from './dto/campaign-query.dto';
import { containsAny, paginate, searchOr } from '../common/pagination.util';

/**
 * Admin-created tracking links for paid marketing -- the shop's own version
 * of a reseller's referral link, minus commission. A click is recorded the
 * moment someone lands on ?camp=<code>; an order is attributed the same way
 * a reseller referral is, via a cookie read back at checkout.
 */
@Injectable()
export class CampaignService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCampaignDto, createdBy?: string) {
    const existing = await this.prisma.marketingCampaign.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Campaign code "${dto.code}" is already in use.`);
    }
    return this.prisma.marketingCampaign.create({
      data: {
        code: dto.code,
        name: dto.name.trim(),
        isActive: dto.isActive ?? true,
        createdBy,
      },
    });
  }

  async findAll(query: CampaignQueryDto) {
    const { skip, take, search, isActive } = query;
    const where: Prisma.MarketingCampaignWhereInput = {
      ...(isActive !== undefined ? { isActive } : {}),
      ...searchOr(search, (term) => containsAny(['name', 'code'], term)),
    };

    const page = await paginate(
      (args) => this.prisma.marketingCampaign.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...args }),
      () => this.prisma.marketingCampaign.count({ where }),
      skip,
      take,
    );

    // Clicks and orders in one batched pass per page rather than a query per
    // row -- the same shape as ResellerPayoutService.stats(), just grouped
    // by campaign instead of aggregated shop-wide.
    const campaignIds = page.items.map((c) => c.id);
    const [clickCounts, orderCounts] = await Promise.all([
      this.prisma.campaignClick.groupBy({ by: ['campaignId'], where: { campaignId: { in: campaignIds } }, _count: true }),
      this.prisma.order.groupBy({
        by: ['attributedCampaignId'],
        where: { attributedCampaignId: { in: campaignIds } },
        _count: true,
      }),
    ]);
    const clicksById = new Map(clickCounts.map((row) => [row.campaignId, row._count]));
    const ordersById = new Map(orderCounts.map((row) => [row.attributedCampaignId as string, row._count]));

    return {
      ...page,
      items: page.items.map((campaign) => {
        const clicks = clicksById.get(campaign.id) ?? 0;
        const orders = ordersById.get(campaign.id) ?? 0;
        return {
          ...campaign,
          clicks,
          orders,
          conversionRate: clicks > 0 ? orders / clicks : null,
        };
      }),
    };
  }

  async findOne(id: string) {
    const campaign = await this.prisma.marketingCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);
    return campaign;
  }

  /** The performance detail behind one campaign: its referred orders, newest first. */
  async performance(id: string) {
    const campaign = await this.findOne(id);
    const [totalClicks, orders] = await Promise.all([
      this.prisma.campaignClick.count({ where: { campaignId: id } }),
      this.prisma.order.findMany({
        where: { attributedCampaignId: id },
        select: {
          id: true, orderNumber: true, placedAt: true, status: true, total: true,
          customerName: true,
        },
        orderBy: { placedAt: 'desc' },
        take: 200,
      }),
    ]);

    const confirmedOrders = orders.filter((order) => order.status !== 'CANCELLED' && order.status !== 'REFUNDED' && order.status !== 'PENDING');
    const revenue = confirmedOrders.reduce((sum, order) => sum + Number(order.total), 0);

    return {
      campaign,
      summary: {
        totalClicks,
        referredOrders: orders.length,
        confirmedOrders: confirmedOrders.length,
        revenue,
        conversionRate: totalClicks > 0 ? orders.length / totalClicks : null,
      },
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        placedAt: order.placedAt.toISOString(),
        status: order.status,
        total: Number(order.total),
        customerName: order.customerName,
      })),
    };
  }

  async update(id: string, dto: UpdateCampaignDto) {
    await this.findOne(id);
    return this.prisma.marketingCampaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * No hard delete: an order or click history pointing at a campaign that
   * no longer exists would lose its own explanation. Retiring is what
   * `isActive: false` (via update) is for; this only exists to block a
   * caller from trying to remove one that has already recorded activity.
   */
  async remove(id: string) {
    const campaign = await this.findOne(id);
    const clicks = await this.prisma.campaignClick.count({ where: { campaignId: id } });
    if (clicks > 0) {
      throw new BadRequestException('This campaign has recorded clicks. Deactivate it instead of deleting it.');
    }
    return this.prisma.marketingCampaign.delete({ where: { id: campaign.id } });
  }

  /** A landing on a campaign's shared link. Silent no-op on an unknown or inactive code -- a stale/mistyped code must never break the page for the visitor. */
  async recordClick(code: string) {
    const campaign = await this.prisma.marketingCampaign.findUnique({ where: { code }, select: { id: true, isActive: true } });
    if (campaign?.isActive) {
      await this.prisma.campaignClick.create({ data: { campaignId: campaign.id } });
    }
    return { recorded: true };
  }

  /** Resolves a code to an id for checkout to stamp onto the order -- never surfaced to the client, same tolerance as reseller-code resolution. */
  async resolveActiveCampaignId(code: string): Promise<string | null> {
    const campaign = await this.prisma.marketingCampaign.findUnique({ where: { code }, select: { id: true, isActive: true } });
    return campaign?.isActive ? campaign.id : null;
  }
}
