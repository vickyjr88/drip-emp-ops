import { Injectable, Logger } from '@nestjs/common';
import { JournalSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';

/**
 * Puts trading into the ledger.
 *
 * Without this a sale changes stock and takes money but never reaches the
 * profit and loss, so the accounting stack sits beside the business rather
 * than describing it.
 *
 * Two entries per sale, which is what double entry requires and what makes
 * margin readable:
 *
 *   the money   debit Cash/Bank, credit Sales Revenue
 *   the goods   debit Cost of Goods Sold, credit Inventory
 *
 * Booking only the first would show revenue with no cost against it and every
 * margin would read high.
 */
@Injectable()
export class SalesPostingService {
  private readonly logger = new Logger(SalesPostingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  private async accountId(code: string, tx: Prisma.TransactionClient) {
    const account = await tx.chartOfAccount.findFirst({ where: { code } });
    if (!account) {
      throw new Error(`Chart of accounts is missing ${code}. Run the bootstrap seed.`);
    }
    return account.id;
  }

  /**
   * What the goods on an order cost us.
   *
   * Uses the variant's recorded cost, STOCK lines only: a SUPPLIER_ORDER line
   * was never drawn from Inventory, so crediting that account for it would
   * write down stock that was never held. Its cost is booked separately,
   * against Accounts Payable, once the supplier bill that actually fulfilled
   * it is approved -- see the note on postSupplierOrderLineCost below.
   *
   * A STOCK variant with no cost contributes nothing rather than blocking the
   * sale: the money side must still post, and a missing cost is a catalogue
   * gap to fix, not a reason to lose the sale from the books.
   */
  private async costOfOrder(orderId: string, tx: Prisma.TransactionClient) {
    const lines = await tx.orderLine.findMany({
      where: { orderId, fulfillmentType: 'STOCK' },
      include: { variant: { select: { costKes: true, sku: true } } },
    });

    let cost = 0;
    const missing: string[] = [];
    for (const line of lines) {
      if (line.variant.costKes === null) {
        missing.push(line.variant.sku);
        continue;
      }
      cost += Number(line.variant.costKes) * line.quantity;
    }
    return { cost, missing };
  }

  /**
   * Posts a payment taken against an order.
   *
   * Called once the money is in hand rather than when the order is placed:
   * an unpaid order is a promise, and promising is not trading.
   */
  async postOrderPayment(paymentId: string, tx?: Prisma.TransactionClient) {
    const run = async (client: Prisma.TransactionClient) => {
      const payment = await client.orderPayment.findUnique({
        where: { id: paymentId },
        include: { order: { include: { store: true } } },
      });
      if (!payment) return null;
      // Already posted: a second call must not double-count the takings.
      if (payment.journalEntryId) return null;

      const order = payment.order;
      const revenueCode =
        order.priceTier === 'WHOLESALE'
          ? DEFAULT_ACCOUNT_CODES.WHOLESALE_REVENUE
          : DEFAULT_ACCOUNT_CODES.SALES_REVENUE;

      const [cashId, revenueId] = await Promise.all([
        this.accountId(DEFAULT_ACCOUNT_CODES.CASH_AND_BANK, client),
        this.accountId(revenueCode, client),
      ]);

      const amount = Number(payment.amount);
      const entry = await this.ledger.postJournal(
        {
          entryDate: payment.receivedAt,
          memo: `${order.orderNumber} — ${payment.method}${payment.reference ? ` ${payment.reference}` : ''}`,
          source: JournalSource.SALES,
          sourceId: order.id,
          postedBy: payment.receivedBy,
          lines: [
            { accountId: cashId, debit: amount, credit: 0, storeId: order.storeId },
            { accountId: revenueId, debit: 0, credit: amount, storeId: order.storeId },
          ],
        },
        client,
      );

      await client.orderPayment.update({
        where: { id: paymentId },
        data: { journalEntryId: entry.id },
      });

      return entry;
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * Moves the goods off the balance sheet when an order is fulfilled.
   *
   * Kept apart from the money because the two do not always happen together:
   * a part-paid order has taken cash but not yet given up the goods.
   */
  async postOrderCost(orderId: string, tx?: Prisma.TransactionClient) {
    const run = async (client: Prisma.TransactionClient) => {
      const order = await client.order.findUnique({ where: { id: orderId } });
      if (!order) return null;

      // One cost entry per order, found by source rather than a flag so the
      // ledger itself is the record of what has been posted.
      const existing = await client.journalEntry.findFirst({
        where: { source: JournalSource.SALES, sourceId: orderId, memo: { contains: 'cost of goods' } },
      });
      if (existing) return null;

      const { cost, missing } = await this.costOfOrder(orderId, client);
      if (missing.length) {
        this.logger.warn(
          `${order.orderNumber}: no cost recorded for ${missing.join(', ')}; margin will read high until set.`,
        );
      }
      if (cost <= 0) return null;

      const [cogsId, inventoryId] = await Promise.all([
        this.accountId(DEFAULT_ACCOUNT_CODES.COST_OF_GOODS_SOLD, client),
        this.accountId(DEFAULT_ACCOUNT_CODES.INVENTORY, client),
      ]);

      return this.ledger.postJournal(
        {
          entryDate: new Date(),
          memo: `${order.orderNumber} — cost of goods sold`,
          source: JournalSource.SALES,
          sourceId: orderId,
          postedBy: 'system',
          lines: [
            { accountId: cogsId, debit: cost, credit: 0, storeId: order.storeId },
            { accountId: inventoryId, debit: 0, credit: cost, storeId: order.storeId },
          ],
        },
        client,
      );
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * Posts a reseller's payment against a pickup.
   *
   * Consigned goods stay in inventory until the reseller reports them sold,
   * which is the point of consignment: they were never our sale until then.
   */
  async postConsignmentPayment(paymentId: string, tx?: Prisma.TransactionClient) {
    const run = async (client: Prisma.TransactionClient) => {
      const payment = await client.consignmentPayment.findUnique({
        where: { id: paymentId },
        include: { consignment: true },
      });
      if (!payment || payment.journalEntryId) return null;

      const [cashId, revenueId] = await Promise.all([
        this.accountId(DEFAULT_ACCOUNT_CODES.CASH_AND_BANK, client),
        this.accountId(DEFAULT_ACCOUNT_CODES.WHOLESALE_REVENUE, client),
      ]);

      const amount = Number(payment.amount);
      const entry = await this.ledger.postJournal(
        {
          entryDate: payment.receivedAt,
          memo: `${payment.consignment.reference} — ${payment.method}`,
          source: JournalSource.CONSIGNMENT,
          sourceId: payment.consignmentId,
          postedBy: payment.receivedBy,
          lines: [
            { accountId: cashId, debit: amount, credit: 0, storeId: payment.consignment.storeId },
            { accountId: revenueId, debit: 0, credit: amount, storeId: payment.consignment.storeId },
          ],
        },
        client,
      );

      await client.consignmentPayment.update({
        where: { id: paymentId },
        data: { journalEntryId: entry.id },
      });
      return entry;
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * Cost of goods a reseller reported sold.
   *
   * Separate from shrinkage: these were sold, so the cost belongs in cost of
   * goods sold where it offsets the revenue, not in shrinkage where it would
   * read as a loss and understate margin.
   */
  async postConsignmentCost(
    params: { variantId: string; storeId: string; quantity: number; reference: string },
    tx?: Prisma.TransactionClient,
  ) {
    const run = async (client: Prisma.TransactionClient) => {
      const variant = await client.productVariant.findUnique({ where: { id: params.variantId } });
      if (!variant?.costKes) return null;

      const value = Number(variant.costKes) * params.quantity;
      const [cogsId, inventoryId] = await Promise.all([
        this.accountId(DEFAULT_ACCOUNT_CODES.COST_OF_GOODS_SOLD, client),
        this.accountId(DEFAULT_ACCOUNT_CODES.INVENTORY, client),
      ]);

      return this.ledger.postJournal(
        {
          entryDate: new Date(),
          memo: `${params.reference} — cost of goods sold on consignment`,
          source: JournalSource.CONSIGNMENT,
          sourceId: params.reference,
          postedBy: 'system',
          lines: [
            { accountId: cogsId, debit: value, credit: 0, storeId: params.storeId },
            { accountId: inventoryId, debit: 0, credit: value, storeId: params.storeId },
          ],
        },
        client,
      );
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * Stock leaving without a sale behind it: damage, or a write-off.
   *
   * Booked to shrinkage rather than cost of goods sold, so a bad month of
   * losses does not read as a bad month of margin.
   */
  async postShrinkage(
    params: { variantId: string; storeId: string; quantity: number; reference: string; reason: string },
    tx?: Prisma.TransactionClient,
  ) {
    const run = async (client: Prisma.TransactionClient) => {
      const variant = await client.productVariant.findUnique({ where: { id: params.variantId } });
      if (!variant?.costKes) return null;

      const value = Number(variant.costKes) * params.quantity;
      const [shrinkageId, inventoryId] = await Promise.all([
        this.accountId(DEFAULT_ACCOUNT_CODES.INVENTORY_SHRINKAGE, client),
        this.accountId(DEFAULT_ACCOUNT_CODES.INVENTORY, client),
      ]);

      return this.ledger.postJournal(
        {
          entryDate: new Date(),
          memo: `${params.reference} — ${params.reason}`,
          source: JournalSource.INVENTORY,
          sourceId: params.reference,
          postedBy: 'system',
          lines: [
            { accountId: shrinkageId, debit: value, credit: 0, storeId: params.storeId },
            { accountId: inventoryId, debit: 0, credit: value, storeId: params.storeId },
          ],
        },
        client,
      );
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * Stock arriving: inventory goes up, and it is owed for or paid.
   *
   * Credited to accounts payable, since goods are generally received before
   * the supplier is settled.
   */
  async postStockReceipt(
    params: { variantId: string; storeId: string; quantity: number; reference: string },
    tx?: Prisma.TransactionClient,
  ) {
    const run = async (client: Prisma.TransactionClient) => {
      const variant = await client.productVariant.findUnique({ where: { id: params.variantId } });
      if (!variant?.costKes) return null;

      const value = Number(variant.costKes) * params.quantity;
      const [inventoryId, payableId] = await Promise.all([
        this.accountId(DEFAULT_ACCOUNT_CODES.INVENTORY, client),
        this.accountId(DEFAULT_ACCOUNT_CODES.ACCOUNTS_PAYABLE, client),
      ]);

      return this.ledger.postJournal(
        {
          entryDate: new Date(),
          memo: `${params.reference} — stock received`,
          source: JournalSource.INVENTORY,
          sourceId: params.reference,
          postedBy: 'system',
          lines: [
            { accountId: inventoryId, debit: value, credit: 0, storeId: params.storeId },
            { accountId: payableId, debit: 0, credit: value, storeId: params.storeId },
          ],
        },
        client,
      );
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }
}
