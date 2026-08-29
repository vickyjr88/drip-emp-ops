import { Injectable, Logger } from '@nestjs/common';
import { JournalSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';

/**
 * Credits the reseller who actually referred an order, the moment that order
 * is marked PAID.
 *
 * The amount is the shop-wide margin (OrderLine.listPrice minus the variant's
 * resellerPriceKes) summed across the order's lines -- resellerPriceKes is
 * already a single reference price per variant, not something that varies
 * reseller to reseller, so this is inherently "one shop-wide margin figure."
 * The commission itself still goes to exactly one reseller: whoever
 * Order.referredByCustomerId names, never split or pooled across resellers.
 */
@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

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
   * Called from the PAID transition in both checkout.service.ts and
   * order.service.ts. A no-op for an order nobody referred, and safe to call
   * twice -- Commission.orderId is unique, so a re-entrant call (a webhook
   * replay, a part-payment settling twice) finds the existing row and stops.
   */
  async accrue(orderId: string, tx: Prisma.TransactionClient): Promise<void> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { lines: { include: { variant: { select: { resellerPriceKes: true } } } } },
    });
    if (!order?.referredByCustomerId) return;

    const existing = await tx.commission.findUnique({ where: { orderId } });
    if (existing) return;

    let amount = 0;
    for (const line of order.lines) {
      const listPrice = Number(line.listPrice ?? line.unitPrice);
      const resellerPrice = line.variant.resellerPriceKes !== null ? Number(line.variant.resellerPriceKes) : listPrice;
      amount += Math.max(0, listPrice - resellerPrice) * line.quantity;
    }

    let journalEntryId: string | undefined;
    if (amount > 0) {
      const [expenseId, payableId] = await Promise.all([
        this.accountId(DEFAULT_ACCOUNT_CODES.RESELLER_COMMISSION_EXPENSE, tx),
        this.accountId(DEFAULT_ACCOUNT_CODES.RESELLER_COMMISSIONS_PAYABLE, tx),
      ]);
      const journal = await this.ledger.postJournal(
        {
          memo: `${order.orderNumber} — reseller commission accrued`,
          source: JournalSource.SALES,
          sourceId: order.id,
          lines: [
            { accountId: expenseId, debit: amount, storeId: order.storeId },
            { accountId: payableId, credit: amount, storeId: order.storeId },
          ],
        },
        tx,
      );
      journalEntryId = journal.id;
    }

    await tx.commission.create({
      data: {
        orderId: order.id,
        resellerId: order.referredByCustomerId,
        amount,
        journalEntryId,
      },
    });
  }

  /**
   * Called when a PAID order with a still-ACCRUED commission is cancelled or
   * refunded. Deliberately called AFTER (not inside) the order's own
   * stock-reversal transaction: LedgerService.reverseJournal opens its own
   * internal $transaction and cannot be nested inside another one.
   *
   * A commission already PAID out is left untouched -- the money has left
   * the business, and automatic clawback is out of scope here, matching this
   * codebase's existing tolerance for the same class of gap in
   * SupplierPayment (cancel() also only ever blocks on PAID, never reverses it).
   */
  async reverseForOrder(orderId: string, postedBy?: string): Promise<void> {
    const commission = await this.prisma.commission.findUnique({ where: { orderId } });
    if (!commission || commission.status !== 'ACCRUED') return;

    if (commission.journalEntryId) {
      const reversal = await this.ledger.reverseJournal(commission.journalEntryId, postedBy);
      await this.prisma.commission.update({
        where: { id: commission.id },
        data: { status: 'CANCELLED', reversalJournalEntryId: reversal.id },
      });
    } else {
      // amount was 0 -- nothing was ever posted, so there's nothing to reverse.
      await this.prisma.commission.update({ where: { id: commission.id }, data: { status: 'CANCELLED' } });
    }
  }
}
