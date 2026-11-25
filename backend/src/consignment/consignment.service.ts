import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsignmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesPostingService } from '../sales-posting/sales-posting.service';
import { CreateConsignmentDto, SettleConsignmentDto } from './dto/consignment.dto';
import { ConsignmentQueryDto } from './dto/consignment-query.dto';
import { customerDisplayName } from '../customer/customer-name';
import { nextReference } from '../common/next-reference';
import { containsAny, paginate, searchOr } from '../common/pagination.util';
import { priceForTier } from '../common/price-for-tier';

/** The agreed holding period before unsold stock is due back. */
export const HOLDING_DAYS = 3;

const INCLUDE = {
  customer: {
    select: {
      id: true, code: true, businessName: true, firstName: true, lastName: true,
      phone: true, priceTier: true,
    },
  },
  store: { select: { id: true, code: true, name: true } },
  lines: {
    include: {
      variant: {
        select: { id: true, sku: true, name: true, product: { select: { name: true, brand: true } } },
      },
    },
  },
  payments: { orderBy: { receivedAt: 'asc' } },
} satisfies Prisma.ConsignmentInclude;

@Injectable()
export class ConsignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: SalesPostingService,
  ) {}

  private async nextReference(tx: Prisma.TransactionClient) {
    return nextReference(tx.consignment, 'reference', 'CON');
  }

  /**
   * Hands goods to a reseller.
   *
   * The stock moves off the shop floor into the consignment bucket rather than
   * leaving entirely: it is still owned, and it either comes back or gets paid
   * for. Keeping it out of `quantity` is what stops the same pair being sold
   * over the counter while it sits in someone else's shop.
   */
  async create(dto: CreateConsignmentDto, actor = 'system') {
    return this.prisma.$transaction(async (tx) => {
      const [customer, store] = await Promise.all([
        tx.customer.findUnique({ where: { id: dto.customerId } }),
        tx.store.findUnique({ where: { id: dto.storeId } }),
      ]);
      if (!customer) throw new NotFoundException(`Customer ${dto.customerId} not found`);
      if (!store) throw new NotFoundException(`Store ${dto.storeId} not found`);
      if (!customer.isActive) {
        throw new BadRequestException(`${customerDisplayName(customer)} is not active.`);
      }
      // Stock only goes out on consignment to a trade account. A retail
      // customer taking stock away unpaid is not a consignment, it is a debt.
      if (customer.priceTier === 'RETAIL') {
        throw new BadRequestException(
          `${customerDisplayName(customer)} is a retail customer. Set them to reseller or wholesale first.`,
        );
      }

      const tier = dto.priceTier ?? customer.priceTier;
      const variants = await tx.productVariant.findMany({
        where: { id: { in: dto.lines.map((line) => line.variantId) } },
      });
      const byId = new Map(variants.map((variant) => [variant.id, variant]));

      const lines = dto.lines.map((line) => {
        const variant = byId.get(line.variantId);
        if (!variant) throw new NotFoundException(`Variant ${line.variantId} not found`);
        // Fixed now: a price rise next month does not change what is owed on
        // stock already sitting in their shop.
        const unitPrice = line.unitPrice ?? priceForTier(variant, tier);
        return {
          variantId: variant.id,
          description: `${variant.name} (${variant.sku})`,
          quantityOut: line.quantity,
          unitPrice: new Prisma.Decimal(unitPrice),
        };
      });

      const totalValue = lines.reduce(
        (sum, line) => sum + Number(line.unitPrice) * line.quantityOut,
        0,
      );

      if (Number(customer.creditLimit) > 0) {
        const outstanding = await this.outstandingFor(customer.id, tx);
        if (outstanding + totalValue > Number(customer.creditLimit)) {
          throw new BadRequestException(
            `${customerDisplayName(customer)} would be holding ${(outstanding + totalValue).toLocaleString()} against a limit of ${Number(customer.creditLimit).toLocaleString()}.`,
          );
        }
      }

      const due = dto.dueDate
        ? new Date(dto.dueDate)
        : new Date(Date.now() + HOLDING_DAYS * 24 * 60 * 60 * 1000);

      const consignment = await tx.consignment.create({
        data: {
          reference: await this.nextReference(tx),
          customerId: dto.customerId,
          storeId: dto.storeId,
          priceTier: tier,
          totalValue: new Prisma.Decimal(totalValue),
          dueDate: due,
          notes: dto.notes,
          createdBy: actor,
          lines: { create: lines },
        },
        include: INCLUDE,
      });

      for (const line of dto.lines) {
        await this.moveStock(tx, {
          variantId: line.variantId,
          storeId: dto.storeId,
          quantity: line.quantity,
          direction: 'OUT',
          reference: consignment.reference,
          actor,
        });
      }

      return consignment;
    });
  }

  /**
   * Moves stock between the shop floor and the consignment bucket.
   *
   * Both counts change together and a movement is written for each, so the
   * running totals and the audit trail can never disagree about where a pair
   * of shoes is.
   */
  private async moveStock(
    tx: Prisma.TransactionClient,
    params: {
      variantId: string; storeId: string; quantity: number;
      direction: 'OUT' | 'RETURN' | 'SOLD';
      reference: string; actor: string;
    },
  ) {
    const level = await tx.stockLevel.findUnique({
      where: { variantId_storeId: { variantId: params.variantId, storeId: params.storeId } },
    });

    if (params.direction === 'OUT') {
      const onFloor = level?.quantity ?? 0;
      if (onFloor < params.quantity) {
        throw new BadRequestException(
          `Only ${onFloor} on the shop floor; cannot send out ${params.quantity}.`,
        );
      }
      await tx.stockLevel.update({
        where: { variantId_storeId: { variantId: params.variantId, storeId: params.storeId } },
        data: { quantity: { decrement: params.quantity }, onConsignment: { increment: params.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          variantId: params.variantId, storeId: params.storeId,
          type: 'CONSIGNMENT_OUT', quantity: -params.quantity,
          reference: params.reference, createdBy: params.actor,
        },
      });
      return;
    }

    const held = level?.onConsignment ?? 0;
    if (held < params.quantity) {
      throw new BadRequestException(
        `Only ${held} recorded as out with resellers; cannot account for ${params.quantity}.`,
      );
    }

    if (params.direction === 'RETURN') {
      // Comes back to the shop floor, so it is sellable again.
      await tx.stockLevel.update({
        where: { variantId_storeId: { variantId: params.variantId, storeId: params.storeId } },
        data: { quantity: { increment: params.quantity }, onConsignment: { decrement: params.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          variantId: params.variantId, storeId: params.storeId,
          type: 'CONSIGNMENT_RETURN', quantity: params.quantity,
          reference: params.reference, createdBy: params.actor,
        },
      });
      return;
    }

    // SOLD: it leaves for good, so only the consignment bucket drops.
    await tx.stockLevel.update({
      where: { variantId_storeId: { variantId: params.variantId, storeId: params.storeId } },
      data: { onConsignment: { decrement: params.quantity } },
    });
    await tx.stockMovement.create({
      data: {
        variantId: params.variantId, storeId: params.storeId,
        type: 'CONSIGNMENT_SOLD', quantity: -params.quantity,
        reference: params.reference, createdBy: params.actor,
      },
    });
  }

  /** Cost of goods a reseller reported sold, off the balance sheet. */
  private async postConsignmentCost(
    tx: Prisma.TransactionClient, variantId: string, storeId: string, quantity: number, reference: string,
  ) {
    const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
    if (!variant?.costKes) return;
    await this.posting.postConsignmentCost({ variantId, storeId, quantity, reference }, tx);
  }

  /** Value a reseller is holding that is neither paid for nor returned. */
  private async outstandingFor(customerId: string, tx: Prisma.TransactionClient) {
    const open = await tx.consignment.findMany({
      where: { customerId, status: 'OPEN' },
      include: { lines: true },
    });
    return open.reduce((sum, consignment) => {
      const held = consignment.lines.reduce(
        (lineSum, line) =>
          lineSum + (line.quantityOut - line.quantitySold - line.quantityReturned) * Number(line.unitPrice),
        0,
      );
      return sum + held;
    }, 0);
  }

  /**
   * Records what a reseller sold and what came back.
   *
   * Sold and returned are reported together because that is how a reseller
   * settles: they arrive with money for some pairs and the rest in a bag.
   */
  async settle(id: string, dto: SettleConsignmentDto, actor = 'system') {
    return this.prisma.$transaction(async (tx) => {
      const consignment = await tx.consignment.findUnique({ where: { id }, include: { lines: true } });
      if (!consignment) throw new NotFoundException(`Consignment ${id} not found`);
      if (consignment.status !== 'OPEN') {
        throw new BadRequestException(`${consignment.reference} is already ${consignment.status.toLowerCase()}.`);
      }

      let soldValueAdded = 0;

      for (const entry of dto.lines) {
        const line = consignment.lines.find((item) => item.id === entry.lineId);
        if (!line) throw new NotFoundException(`Line ${entry.lineId} is not on this consignment`);

        const sold = entry.sold ?? 0;
        const returned = entry.returned ?? 0;
        if (sold === 0 && returned === 0) continue;

        const stillHeld = line.quantityOut - line.quantitySold - line.quantityReturned;
        if (sold + returned > stillHeld) {
          throw new BadRequestException(
            `${line.description}: only ${stillHeld} still unaccounted for, but ${sold + returned} reported.`,
          );
        }

        if (sold > 0) {
          await this.moveStock(tx, {
            variantId: line.variantId, storeId: consignment.storeId, quantity: sold,
            direction: 'SOLD', reference: consignment.reference, actor,
          });
          soldValueAdded += sold * Number(line.unitPrice);
          // Reported sold means the goods are gone: their cost leaves
          // inventory now, not when the pickup was issued.
          await this.postConsignmentCost(tx, line.variantId, consignment.storeId, sold, consignment.reference);
        }
        if (returned > 0) {
          await this.moveStock(tx, {
            variantId: line.variantId, storeId: consignment.storeId, quantity: returned,
            direction: 'RETURN', reference: consignment.reference, actor,
          });
        }

        await tx.consignmentLine.update({
          where: { id: line.id },
          data: {
            quantitySold: { increment: sold },
            quantityReturned: { increment: returned },
          },
        });
      }

      if (dto.amountPaid && dto.amountPaid > 0) {
        const payment = await tx.consignmentPayment.create({
          data: {
            consignmentId: id,
            amount: new Prisma.Decimal(dto.amountPaid),
            method: dto.method || 'CASH',
            reference: dto.reference,
            receivedBy: actor,
          },
        });
        await this.posting.postConsignmentPayment(payment.id, tx);
      }

      // Closed only when nothing is still out with them.
      const lines = await tx.consignmentLine.findMany({ where: { consignmentId: id } });
      const stillOut = lines.reduce(
        (sum, line) => sum + (line.quantityOut - line.quantitySold - line.quantityReturned),
        0,
      );
      const soldValue = Number(consignment.soldValue) + soldValueAdded;
      const paid = Number(consignment.amountPaid) + (dto.amountPaid ?? 0);

      const updated = await tx.consignment.update({
        where: { id },
        data: {
          soldValue: new Prisma.Decimal(soldValue),
          amountPaid: new Prisma.Decimal(paid),
          ...(stillOut === 0
            ? { status: ConsignmentStatus.SETTLED, closedAt: new Date() }
            : {}),
        },
        include: INCLUDE,
      });

      // Same derived shape findOne returns, so a caller does not have to
      // re-fetch to learn what is still out.
      return this.decorate(updated);
    });
  }

  /**
   * The reseller keeps what is still out: those pairs become an order at the prices agreed on the pickup.
   *
   * Nothing is counted twice, which is the whole point of doing it here rather than by hand:
   *  - stock: the pairs leave the consignment bucket as sold (the same movement settle writes). The order takes nothing off the shop floor,
   *    because the pairs are not on it;
   *  - cost of goods: booked once, as the order's own cost entry, so marking the order delivered later finds it already there;
   *  - money owed: lives on the order from now. The pickup's sold value is left alone, so the pickup does not also claim it. What the
   *    reseller already paid on the pickup stays on the pickup (it was booked as revenue when it came in).
   * A pickup with nothing left out has nothing to convert; one that is now fully accounted for closes as settled.
   */
  async convertToOrder(id: string, actor = 'system') {
    return this.prisma.$transaction(async (tx) => {
      const consignment = await tx.consignment.findUnique({
        where: { id }, include: { lines: { include: { variant: true } }, customer: true },
      });
      if (!consignment) throw new NotFoundException(`Consignment ${id} not found`);
      if (consignment.status !== 'OPEN') {
        throw new BadRequestException(`${consignment.reference} is already ${consignment.status.toLowerCase()}.`);
      }

      const kept = consignment.lines
        .map((line) => ({ line, quantity: line.quantityOut - line.quantitySold - line.quantityReturned }))
        .filter((entry) => entry.quantity > 0);
      if (!kept.length) throw new BadRequestException(`Nothing is still out on ${consignment.reference}.`);

      const orderLines = kept.map(({ line, quantity }) => {
        const price = Number(line.unitPrice);
        return {
          variantId: line.variantId,
          description: `${line.variant.name} (${line.variant.sku})`,
          quantity,
          unitPrice: new Prisma.Decimal(price),
          listPrice: new Prisma.Decimal(price),
          discount: new Prisma.Decimal(0),
          lineTotal: new Prisma.Decimal(price * quantity),
          fulfillmentType: 'STOCK' as const,
        };
      });
      const total = orderLines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
      const customer = consignment.customer;

      const order = await tx.order.create({
        data: {
          orderNumber: await nextReference(tx.order, 'orderNumber', 'DE'),
          storeId: consignment.storeId,
          customerId: consignment.customerId,
          channel: 'CONSIGNMENT',
          priceTier: consignment.priceTier,
          customerName: customerDisplayName(customer),
          customerPhone: customer.phone || undefined,
          notes: `Converted from pickup ${consignment.reference}: the reseller kept what was still out.`,
          subtotal: new Prisma.Decimal(total),
          discount: new Prisma.Decimal(0),
          shipping: new Prisma.Decimal(0),
          total: new Prisma.Decimal(total),
          createdBy: actor,
          lines: { create: orderLines },
        },
        include: { lines: true },
      });

      for (const { line, quantity } of kept) {
        await this.moveStock(tx, {
          variantId: line.variantId, storeId: consignment.storeId, quantity,
          direction: 'SOLD', reference: consignment.reference, actor,
        });
        await tx.consignmentLine.update({ where: { id: line.id }, data: { quantitySold: { increment: quantity } } });
      }
      // The pairs have left: their cost goes now, as the order's own entry (see above).
      await this.posting.postOrderCost(order.id, tx);

      await tx.consignment.update({
        where: { id },
        data: {
          status: ConsignmentStatus.SETTLED,
          closedAt: new Date(),
          notes: [consignment.notes, `Converted to order ${order.orderNumber} (${kept.reduce((n, k) => n + k.quantity, 0)} pair(s)).`].filter(Boolean).join('\n'),
        },
      });

      return { orderId: order.id, orderNumber: order.orderNumber, total, pairs: kept.reduce((n, k) => n + k.quantity, 0) };
    });
  }

  async findAll(query: ConsignmentQueryDto) {
    const { skip, take, search, customerId, storeId, status, overdueOnly } = query;
    const where: Prisma.ConsignmentWhereInput = {
      ...(customerId ? { customerId } : {}),
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
      // Overdue is derived (OPEN + past due date), so it is expressed directly
      // as a where clause rather than filtered after the fact -- that way it
      // composes with skip/take instead of being applied to a full in-memory
      // fetch.
      ...(overdueOnly ? { status: ConsignmentStatus.OPEN, dueDate: { lt: new Date() } } : {}),
      ...searchOr(search, (term) =>
        containsAny(['reference', 'customer.businessName', 'customer.firstName', 'customer.lastName', 'store.name'], term),
      ),
    };

    const page = await paginate(
      (args) => this.prisma.consignment.findMany({ where, include: INCLUDE, orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }], ...args }),
      () => this.prisma.consignment.count({ where }),
      skip,
      take,
    );

    return { ...page, items: page.items.map((row) => this.decorate(row)) };
  }

  /** Totals for the dashboard cards -- computed in SQL, not by summing a full fetch. */
  async stats() {
    const now = new Date();
    const [open, overdueCount] = await Promise.all([
      this.prisma.consignment.findMany({
        where: { status: ConsignmentStatus.OPEN },
        select: { soldValue: true, amountPaid: true, lines: { select: { quantityOut: true, quantitySold: true, quantityReturned: true } } },
      }),
      this.prisma.consignment.count({
        where: { status: ConsignmentStatus.OPEN, dueDate: { lt: now } },
      }),
    ]);

    const unitsHeld = open.reduce(
      (sum, row) =>
        sum + row.lines.reduce((lineSum, line) => lineSum + (line.quantityOut - line.quantitySold - line.quantityReturned), 0),
      0,
    );
    const owed = open.reduce((sum, row) => sum + (Number(row.soldValue) - Number(row.amountPaid)), 0);

    return { unitsHeld, owed, overdue: overdueCount };
  }

  /**
   * What happened with resellers in a window, as opposed to stats() above,
   * which is always "what is out right now" regardless of period. A day/week/
   * month view wants activity -- pickups issued and cash actually collected in
   * that window -- not the live exposure a period filter cannot sensibly
   * apply to.
   */
  async activity(from?: string, to?: string, storeId?: string) {
    const issuedWhere: Prisma.ConsignmentWhereInput = {
      ...(storeId ? { storeId } : {}),
      ...(from || to
        ? {
            issuedAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [issued, collected] = await Promise.all([
      this.prisma.consignment.aggregate({
        where: issuedWhere,
        _count: { _all: true },
        _sum: { totalValue: true },
      }),
      this.prisma.consignmentPayment.aggregate({
        where: {
          ...(storeId ? { consignment: { storeId } } : {}),
          ...(from || to
            ? {
                receivedAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
                },
              }
            : {}),
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      pickupsIssued: issued._count._all,
      valueIssued: Number(issued._sum.totalValue ?? 0),
      collected: Number(collected._sum.amount ?? 0),
    };
  }

  /** Adds the figures every caller wants: what is still out, and the balance. */
  private decorate<T extends {
    status: string; dueDate: Date | null; soldValue: Prisma.Decimal; amountPaid: Prisma.Decimal;
    customer: { businessName: string | null; firstName: string; lastName: string };
    lines: Array<{ quantityOut: number; quantitySold: number; quantityReturned: number }>;
  }>(row: T) {
    const stillOut = row.lines.reduce(
      (sum, line) => sum + (line.quantityOut - line.quantitySold - line.quantityReturned),
      0,
    );
    return {
      ...row,
      // The screens and the CSV show who has the stock; the customer record only holds the pieces of that name.
      customer: { ...row.customer, name: customerDisplayName(row.customer) },
      unitsStillOut: stillOut,
      balance: Number(row.soldValue) - Number(row.amountPaid),
      isOverdue: row.status === 'OPEN' && !!row.dueDate && row.dueDate.getTime() < Date.now(),
    };
  }

  async findOne(id: string) {
    const consignment = await this.prisma.consignment.findUnique({ where: { id }, include: INCLUDE });
    if (!consignment) throw new NotFoundException(`Consignment ${id} not found`);
    return this.decorate(consignment);
  }

  /** Writes off what a reseller never returned or paid for. */
  async writeOff(id: string, reason: string, actor = 'system') {
    return this.prisma.$transaction(async (tx) => {
      const consignment = await tx.consignment.findUnique({ where: { id }, include: { lines: true } });
      if (!consignment) throw new NotFoundException(`Consignment ${id} not found`);
      if (consignment.status !== 'OPEN') {
        throw new BadRequestException(`${consignment.reference} is already ${consignment.status.toLowerCase()}.`);
      }

      for (const line of consignment.lines) {
        const stillOut = line.quantityOut - line.quantitySold - line.quantityReturned;
        if (stillOut <= 0) continue;
        // The goods are gone: drop them from the consignment bucket and record
        // it as damage so the loss is visible rather than silently vanishing.
        await tx.stockLevel.update({
          where: { variantId_storeId: { variantId: line.variantId, storeId: consignment.storeId } },
          data: { onConsignment: { decrement: stillOut } },
        });
        await tx.stockMovement.create({
          data: {
            variantId: line.variantId, storeId: consignment.storeId,
            type: 'DAMAGE', quantity: -stillOut,
            reference: consignment.reference, notes: `Written off: ${reason}`, createdBy: actor,
          },
        });
        // A loss, not a sale: it goes to shrinkage so margin stays readable.
        await this.posting.postShrinkage(
          { variantId: line.variantId, storeId: consignment.storeId, quantity: stillOut,
            reference: consignment.reference, reason: `written off: ${reason}` },
          tx,
        );
      }

      const written = await tx.consignment.update({
        where: { id },
        data: { status: ConsignmentStatus.WRITTEN_OFF, closedAt: new Date(), notes: reason },
        include: INCLUDE,
      });
      return this.decorate(written);
    });
  }
}
