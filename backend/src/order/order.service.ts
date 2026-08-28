import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderLineFulfillmentStatus, OrderLineFulfillmentType, OrderStatus, PriceTier, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { SalesPostingService } from '../sales-posting/sales-posting.service';
import { OwnerNotificationService } from '../email-log/owner-notification.service';
import { CreateOrderDto, RecordOrderPaymentDto, UpdateOrderLineFulfillmentDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { nextReference } from '../common/next-reference';
import { paginate, searchOr, containsAny } from '../common/pagination.util';
import { priceForTier } from '../common/price-for-tier';

const INCLUDE = {
  store: { select: { id: true, code: true, name: true } },
  customer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  lines: {
    include: {
      variant: {
        select: { id: true, sku: true, name: true, product: { select: { id: true, name: true, brand: true } } },
      },
      // Who is actually sourcing a SUPPLIER_ORDER line, once bought in --
      // the detail page names the bill and the supplier, not just a status.
      supplierInvoice: {
        select: {
          id: true, invoiceNumber: true, status: true,
          supplier: { select: { id: true, name: true, phone: true, email: true } },
        },
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

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly posting: SalesPostingService,
    private readonly ownerNotification: OwnerNotificationService,
  ) {}

  private async nextOrderNumber(tx: Prisma.TransactionClient) {
    return nextReference(tx.order, 'orderNumber', 'DE');
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
        // A drop-ship variant is never on the shop floor, so a line against
        // it can only ever be sourced from the supplier -- the caller's
        // choice is honoured for everything else, defaulting to STOCK.
        const fulfillmentType: OrderLineFulfillmentType = variant.isDropShip
          ? 'SUPPLIER_ORDER'
          : line.fulfillmentType ?? 'STOCK';
        return {
          variantId: variant.id,
          description: `${variant.name} (${variant.sku})`,
          quantity: line.quantity,
          unitPrice: new Prisma.Decimal(unitPrice),
          listPrice: new Prisma.Decimal(listPrice),
          discount: new Prisma.Decimal(discount),
          lineTotal: new Prisma.Decimal(lineTotal),
          fulfillmentType,
          // Charged the same as any line, but there is nothing to hand over
          // yet -- this is what the operations worklist chases.
          fulfillmentStatus: fulfillmentType === 'SUPPLIER_ORDER' ? OrderLineFulfillmentStatus.AWAITING_SUPPLIER : null,
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

      // Only a STOCK line takes anything off the shop floor. A SUPPLIER_ORDER
      // line is charged the same but has nothing to reserve -- it is not
      // physically ours yet, so StockLevel is left untouched and the
      // operations worklist is what tracks getting it in.
      for (const line of lines) {
        if (line.fulfillmentType !== 'STOCK') continue;
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

  async findAll(query: OrderQueryDto) {
    const { skip, take, search, storeId, status, customerId, from, to, awaitingSupplier } = query;
    const where: Prisma.OrderWhereInput = {
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(from || to
        ? {
            placedAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      // The operations worklist: any order still holding a supplier line
      // that has not reached the customer yet.
      ...(awaitingSupplier
        ? {
            lines: {
              some: {
                fulfillmentType: 'SUPPLIER_ORDER',
                fulfillmentStatus: { not: OrderLineFulfillmentStatus.HANDED_TO_CUSTOMER },
              },
            },
          }
        : {}),
      ...searchOr(search, (term) => containsAny(['orderNumber', 'customerName', 'customerPhone'], term)),
    };
    const orderBy: Prisma.OrderOrderByWithRelationInput[] = [{ placedAt: 'desc' }, { id: 'asc' }];
    return paginate(
      (args) => this.prisma.order.findMany({ where, include: INCLUDE, orderBy, ...args }),
      () => this.prisma.order.count({ where }),
      skip,
      take,
    );
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
    // A SUPPLIER_ORDER line never took stock in the first place -- there is
    // nothing to return -- so it is simply left as-is; per-line cancellation
    // for a supplier line not yet fulfilled is handled separately.
    if (status === 'CANCELLED' || status === 'REFUNDED') {
      await this.prisma.$transaction(async (tx) => {
        for (const line of order.lines) {
          if (line.fulfillmentType !== 'STOCK') continue;
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
   * Sequence a SUPPLIER_ORDER line moves through, same idea as order status:
   * chasing the supplier, then the customer, are different jobs and neither
   * should be skippable by accident.
   */
  private static readonly NEXT_LINE_STATUS: Record<OrderLineFulfillmentStatus, OrderLineFulfillmentStatus[]> = {
    AWAITING_SUPPLIER: ['ORDERED_FROM_SUPPLIER'],
    ORDERED_FROM_SUPPLIER: ['RECEIVED'],
    RECEIVED: ['HANDED_TO_CUSTOMER'],
    HANDED_TO_CUSTOMER: [],
  };

  /**
   * Advances one SUPPLIER_ORDER line -- ordered from the supplier, received,
   * then handed over. This is the operations worklist's counterpart to
   * setStatus: it tracks a promise to source an item rather than a stock
   * movement, so it never touches StockLevel.
   */
  async updateLineFulfillment(orderId: string, lineId: string, dto: UpdateOrderLineFulfillmentDto) {
    const line = await this.prisma.orderLine.findUnique({ where: { id: lineId } });
    if (!line || line.orderId !== orderId) throw new NotFoundException(`Line ${lineId} not found on order ${orderId}`);
    if (line.fulfillmentType !== 'SUPPLIER_ORDER') {
      throw new BadRequestException('Only a SUPPLIER_ORDER line has a fulfillment sequence to advance.');
    }
    const current = line.fulfillmentStatus ?? OrderLineFulfillmentStatus.AWAITING_SUPPLIER;
    if (current === dto.status) return line;
    if (!OrderService.NEXT_LINE_STATUS[current].includes(dto.status)) {
      throw new BadRequestException(
        `A line that is ${current} cannot become ${dto.status}. Allowed: ${
          OrderService.NEXT_LINE_STATUS[current].join(', ') || 'nothing — already handed over'
        }.`,
      );
    }
    if (dto.status === 'ORDERED_FROM_SUPPLIER' && !dto.supplierInvoiceId && !line.supplierInvoiceId) {
      throw new BadRequestException('Link the supplier invoice this was bought in against before marking it ordered.');
    }

    return this.prisma.orderLine.update({
      where: { id: lineId },
      data: {
        fulfillmentStatus: dto.status,
        ...(dto.supplierInvoiceId ? { supplierInvoiceId: dto.supplierInvoiceId } : {}),
      },
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

    const updated = await this.prisma.$transaction(async (tx) => {
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

    // WhatsApp orders specifically, per the notification scope -- an in-store
    // walk-in settling at the till is not one of the events worth an email.
    if (updated.status === 'PAID' && order.status !== 'PAID' && updated.channel === 'WHATSAPP') {
      void this.ownerNotification.notifyOrderPaid({
        orderNumber: updated.orderNumber,
        channel: updated.channel,
        customerName: updated.customerName,
        customerPhone: updated.customerPhone,
        customerEmail: updated.customerEmail,
        total: Number(updated.total),
      });
    }

    return updated;
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

    const [totals, byStatus, byChannel] = await Promise.all([
      this.prisma.order.aggregate({ where, _count: true, _sum: { total: true, amountPaid: true } }),
      this.prisma.order.groupBy({ by: ['status'], where, _count: true, _sum: { total: true } }),
      this.prisma.order.groupBy({ by: ['channel'], where, _count: true, _sum: { total: true } }),
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
      // Which route the sale actually came through -- card checkout, a
      // WhatsApp order rung up at the till, or a walk-in -- since the same
      // revenue figure says nothing about where the demand is coming from.
      byChannel: byChannel.map((row) => ({
        channel: row.channel,
        count: row._count,
        value: Number(row._sum.total ?? 0),
      })),
    };
  }
}
