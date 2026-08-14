import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PriceTier, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { SalesPostingService } from '../sales-posting/sales-posting.service';
import { CreateOrderDto, RecordOrderPaymentDto } from './dto/create-order.dto';

const INCLUDE = {
  store: { select: { id: true, code: true, name: true } },
  customer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  lines: {
    include: {
      variant: {
        select: { id: true, sku: true, name: true, product: { select: { id: true, name: true, brand: true } } },
      },
    },
  },
  payments: { orderBy: { receivedAt: 'asc' } },
} satisfies Prisma.OrderInclude;

/**
 * Which statuses may follow which.
 *
 * Written down rather than left to the caller because the sequence is the
 * business rule: goods cannot ship before they are packed, and a delivered
 * order is refunded rather than cancelled.
 */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['PACKED', 'REFUNDED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** What a given tier pays, falling back up the tiers when a price is unset. */
function priceForTier(
  variant: { priceKes: Prisma.Decimal; resellerPriceKes: Prisma.Decimal | null; wholesalePriceKes: Prisma.Decimal | null },
  tier: PriceTier,
): number {
  if (tier === 'WHOLESALE') {
    return Number(variant.wholesalePriceKes ?? variant.resellerPriceKes ?? variant.priceKes);
  }
  if (tier === 'RESELLER') {
    return Number(variant.resellerPriceKes ?? variant.priceKes);
  }
  return Number(variant.priceKes);
}

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly posting: SalesPostingService,
  ) {}

  private async nextOrderNumber(tx: Prisma.TransactionClient) {
    const year = new Date().getFullYear();
    const count = await tx.order.count({ where: { orderNumber: { startsWith: `DE-${year}-` } } });
    return `DE-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  /**
   * Places an order and takes the stock with it.
   *
   * Both happen in one transaction: an order that reserved nothing would let
   * the same pair of shoes be sold twice, and stock removed without an order
   * behind it is unexplainable later.
   */
  async create(dto: CreateOrderDto, actor = 'system') {
    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({ where: { id: dto.storeId } });
      if (!store) throw new NotFoundException(`Store ${dto.storeId} not found`);

      const variantIds = dto.lines.map((line) => line.variantId);
      const variants = await tx.productVariant.findMany({ where: { id: { in: variantIds } } });
      const byId = new Map(variants.map((variant) => [variant.id, variant]));

      const missing = variantIds.filter((id) => !byId.has(id));
      if (missing.length) throw new NotFoundException(`Unknown variant(s): ${missing.join(', ')}`);

      const tier = dto.priceTier ?? PriceTier.RETAIL;

      const lines = dto.lines.map((line) => {
        const variant = byId.get(line.variantId)!;
        // The marked price for this tier, kept beside what was actually
        // charged: a walk-in can be talked up or down, and "sold at 3,200"
        // means little without knowing it was marked at 3,499.
        const listPrice = priceForTier(variant, tier);
        // Price is copied now: repricing the variant later must not rewrite
        // what this order says was charged.
        const unitPrice = line.unitPrice ?? listPrice;
        const discount = line.discount ?? 0;
        const lineTotal = unitPrice * line.quantity - discount;
        if (lineTotal < 0) {
          throw new BadRequestException(`Discount on ${variant.sku} is more than the line is worth.`);
        }
        return {
          variantId: variant.id,
          description: `${variant.name} (${variant.sku})`,
          quantity: line.quantity,
          unitPrice: new Prisma.Decimal(unitPrice),
          listPrice: new Prisma.Decimal(listPrice),
          discount: new Prisma.Decimal(discount),
          lineTotal: new Prisma.Decimal(lineTotal),
        };
      });

      const subtotal = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
      const discount = dto.discount ?? 0;
      // A walk-in carries their shoes out of the shop, so shipping on an
      // in-store sale is always a mistake rather than a choice.
      const walkIn = (dto.channel || 'IN_STORE') === 'IN_STORE';
      if (walkIn && dto.shipping) {
        throw new BadRequestException('There is no shipping on an in-store sale.');
      }
      const shipping = walkIn ? 0 : dto.shipping ?? 0;
      const total = subtotal - discount + shipping;
      if (total < 0) throw new BadRequestException('The order discount is more than the order is worth.');

      const order = await tx.order.create({
        data: {
          orderNumber: await this.nextOrderNumber(tx),
          storeId: dto.storeId,
          customerId: dto.customerId,
          channel: dto.channel || 'IN_STORE',
          priceTier: tier,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerEmail: dto.customerEmail,
          shippingAddress: dto.shippingAddress,
          notes: dto.notes,
          subtotal: new Prisma.Decimal(subtotal),
          discount: new Prisma.Decimal(discount),
          shipping: new Prisma.Decimal(shipping),
          total: new Prisma.Decimal(total),
          createdBy: actor,
          lines: { create: lines },
        },
        include: INCLUDE,
      });

      for (const line of dto.lines) {
        await this.inventory.record(
          {
            variantId: line.variantId,
            storeId: dto.storeId,
            type: 'SALE',
            quantity: line.quantity,
            reference: order.orderNumber,
          },
          actor,
          tx,
        );
      }

      return order;
    });
  }

  async findAll(query: {
    search?: string; storeId?: string; status?: OrderStatus; customerId?: string;
    from?: string; to?: string; skip?: number; take?: number;
  }) {
    const where: Prisma.OrderWhereInput = {
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.from || query.to
        ? {
            placedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              { customerName: { contains: query.search, mode: 'insensitive' } },
              { customerPhone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const take = query.take ? Math.min(Number(query.take), 200) : undefined;
    const skip = query.skip ? Number(query.skip) : undefined;

    if (take === undefined && skip === undefined) {
      return this.prisma.order.findMany({ where, include: INCLUDE, orderBy: { placedAt: 'desc' } });
    }
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({ where, include: INCLUDE, orderBy: { placedAt: 'desc' }, skip, take }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, skip: skip ?? 0, take: take ?? items.length };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: INCLUDE });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return { ...order, balance: Number(order.total) - Number(order.amountPaid) };
  }

  /** Moves an order along, refusing a jump the sequence does not allow. */
  async setStatus(id: string, status: OrderStatus, notes?: string) {
    const order = await this.findOne(id);
    if (order.status === status) return order;

    if (!NEXT[order.status].includes(status)) {
      throw new BadRequestException(
        `An order that is ${order.status} cannot become ${status}. Allowed: ${
          NEXT[order.status].join(', ') || 'nothing — this order is closed'
        }.`,
      );
    }

    // Cancelling or refunding puts the goods back; they never left the shop.
    if (status === 'CANCELLED' || status === 'REFUNDED') {
      await this.prisma.$transaction(async (tx) => {
        for (const line of order.lines) {
          await this.inventory.record(
            {
              variantId: line.variantId,
              storeId: order.storeId,
              type: 'RETURN',
              quantity: line.quantity,
              reference: order.orderNumber,
              notes: `Order ${status.toLowerCase()}`,
            },
            'system',
            tx,
          );
        }
      });
    }

    // The goods leave the balance sheet once they are actually handed over.
    if (status === 'DELIVERED') {
      await this.posting.postOrderCost(id);
    }

    return this.prisma.order.update({
      where: { id },
      data: {
        status,
        ...(notes ? { notes } : {}),
        ...(status === 'DELIVERED' ? { fulfilledAt: new Date() } : {}),
        ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
      },
      include: INCLUDE,
    });
  }

  /**
   * Records money against an order.
   *
   * Overpayment is refused rather than absorbed: it is nearly always a
   * mis-keyed amount, and silently accepting it makes the day's takings wrong.
   */
  async recordPayment(id: string, dto: RecordOrderPaymentDto, actor = 'system') {
    const order = await this.findOne(id);
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
      throw new BadRequestException(`Order ${order.orderNumber} is ${order.status.toLowerCase()}.`);
    }

    const outstanding = Number(order.total) - Number(order.amountPaid);
    if (dto.amount > outstanding + 0.001) {
      throw new BadRequestException(
        `That is more than the ${outstanding.toLocaleString()} outstanding on this order.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.orderPayment.create({
        data: {
          orderId: id,
          amount: new Prisma.Decimal(dto.amount),
          method: dto.method,
          reference: dto.reference,
          receivedBy: actor,
        },
      });

      // The takings reach the ledger in the same transaction as the payment,
      // so the books cannot disagree with the till about what came in.
      await this.posting.postOrderPayment(payment.id, tx);

      const paid = Number(order.amountPaid) + dto.amount;
      const settled = paid >= Number(order.total) - 0.001;

      return tx.order.update({
        where: { id },
        data: {
          amountPaid: new Prisma.Decimal(paid),
          // Settling in full moves a pending order on; a part payment leaves
          // it where it is.
          ...(settled && order.status === 'PENDING' ? { status: OrderStatus.PAID } : {}),
        },
        include: INCLUDE,
      });
    });
  }

  /** What sold, over a period. */
  async salesSummary(query: { storeId?: string; from?: string; to?: string }) {
    const where: Prisma.OrderWhereInput = {
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.from || query.to
        ? {
            placedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [totals, byStatus] = await Promise.all([
      this.prisma.order.aggregate({ where, _count: true, _sum: { total: true, amountPaid: true } }),
      this.prisma.order.groupBy({ by: ['status'], where, _count: true, _sum: { total: true } }),
    ]);

    const revenue = Number(totals._sum.total ?? 0);
    const collected = Number(totals._sum.amountPaid ?? 0);

    return {
      orderCount: totals._count,
      revenue,
      collected,
      outstanding: revenue - collected,
      averageOrderValue: totals._count ? revenue / totals._count : 0,
      byStatus: byStatus.map((row) => ({
        status: row.status,
        count: row._count,
        value: Number(row._sum.total ?? 0),
      })),
    };
  }
}
