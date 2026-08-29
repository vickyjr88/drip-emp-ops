import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JournalSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';
import { CreateResellerPayoutDto } from './dto/create-reseller-payout.dto';
import { ResellerPayoutQueryDto } from './dto/reseller-payout-query.dto';
import { nextReference } from '../common/next-reference';
import { paginate } from '../common/pagination.util';

/**
 * A manual, staff-run disbursement of a reseller's accrued commission
 * balance. Mirrors SupplierPaymentService's stage -> approve -> release
 * lifecycle; simpler since there is no per-invoice allocation, just "clear
 * everything currently ACCRUED and not already on another payout".
 */
@Injectable()
export class ResellerPayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  private async nextPayoutNumber() {
    return nextReference(this.prisma.resellerPayout, 'payoutNumber', 'RP');
  }

  private async accountId(code: string) {
    const account = await this.prisma.chartOfAccount.findFirst({ where: { code } });
    if (!account) {
      throw new Error(`Chart of accounts is missing ${code}. Run the bootstrap seed.`);
    }
    return account.id;
  }

  async stage(dto: CreateResellerPayoutDto) {
    const reseller = await this.prisma.customer.findUnique({ where: { id: dto.resellerId } });
    if (!reseller) throw new NotFoundException(`Reseller ${dto.resellerId} not found`);

    const payoutNumber = await this.nextPayoutNumber();

    return this.prisma.$transaction(async (tx) => {
      const commissions = await tx.commission.findMany({
        where: { resellerId: dto.resellerId, status: 'ACCRUED', payoutId: null },
      });
      if (!commissions.length) {
        throw new BadRequestException('This reseller has no accrued commission available to pay out.');
      }

      const amount = commissions.reduce((sum, commission) => sum + Number(commission.amount), 0);

      const payout = await tx.resellerPayout.create({
        data: {
          payoutNumber,
          resellerId: dto.resellerId,
          amount,
          status: 'STAGED',
          stagedBy: dto.stagedBy || 'system',
        },
      });

      await tx.commission.updateMany({
        where: { id: { in: commissions.map((commission) => commission.id) } },
        data: { payoutId: payout.id },
      });

      return payout;
    });
  }

  findAll(query: ResellerPayoutQueryDto) {
    const { skip, take, resellerId, status } = query;
    const where: Prisma.ResellerPayoutWhereInput = {
      ...(resellerId ? { resellerId } : {}),
      ...(status ? { status: status as any } : {}),
    };
    return paginate(
      (args) =>
        this.prisma.resellerPayout.findMany({
          where,
          include: { reseller: { select: { id: true, firstName: true, lastName: true, businessName: true } } },
          orderBy: [{ stagedAt: 'desc' }, { id: 'asc' }],
          ...args,
        }),
      () => this.prisma.resellerPayout.count({ where }),
      skip,
      take,
    );
  }

  async findOne(id: string) {
    const payout = await this.prisma.resellerPayout.findUnique({
      where: { id },
      include: {
        reseller: { select: { id: true, firstName: true, lastName: true, businessName: true } },
        commissions: { include: { order: { select: { id: true, orderNumber: true } } } },
      },
    });
    if (!payout) throw new NotFoundException(`Reseller payout ${id} not found`);
    return payout;
  }

  async approve(id: string, approvedBy: string) {
    const payout = await this.findOne(id);
    if (payout.status !== 'STAGED') {
      throw new BadRequestException('Only staged payouts can be approved.');
    }
    return this.prisma.resellerPayout.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy, approvedAt: new Date() },
    });
  }

  async release(id: string) {
    const payout = await this.findOne(id);
    if (payout.status !== 'APPROVED') {
      throw new BadRequestException('Only approved payouts can be released for payment.');
    }

    const [payableId, cashId] = await Promise.all([
      this.accountId(DEFAULT_ACCOUNT_CODES.RESELLER_COMMISSIONS_PAYABLE),
      this.accountId(DEFAULT_ACCOUNT_CODES.CASH_AND_BANK),
    ]);

    const amount = Number(payout.amount);
    const journal = await this.ledger.postJournal({
      memo: `Reseller payout ${payout.payoutNumber} to ${payout.reseller.businessName || payout.reseller.firstName}`,
      source: JournalSource.AP,
      sourceId: payout.id,
      lines: [
        { accountId: payableId, debit: amount },
        { accountId: cashId, credit: amount },
      ],
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.commission.updateMany({
        where: { payoutId: id },
        data: { status: 'PAID' },
      });
      return tx.resellerPayout.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date(), journalEntryId: journal.id },
      });
    });
  }

  async cancel(id: string) {
    const payout = await this.findOne(id);
    if (payout.status === 'PAID') {
      throw new BadRequestException('Cannot cancel a payout that has already been released.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Eligible for a future payout again.
      await tx.commission.updateMany({
        where: { payoutId: id },
        data: { payoutId: null },
      });
      return tx.resellerPayout.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
  }

  async stats() {
    const [accrued, paidOut, resellersWithBalance, totalClicks, totalReferredOrders] = await Promise.all([
      this.prisma.commission.aggregate({
        where: { status: 'ACCRUED' },
        _sum: { amount: true },
      }),
      this.prisma.commission.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      this.prisma.commission.groupBy({
        by: ['resellerId'],
        where: { status: 'ACCRUED' },
      }),
      this.prisma.referralClick.count(),
      this.prisma.order.count({ where: { referredByCustomerId: { not: null } } }),
    ]);

    return {
      totalAccrued: Number(accrued._sum.amount ?? 0),
      totalPaidOut: Number(paidOut._sum.amount ?? 0),
      resellersWithBalance: resellersWithBalance.length,
      totalClicks,
      // Program-wide, across every reseller's link -- not a per-reseller
      // figure like myReferrals()'s own conversionRate.
      conversionRate: totalClicks > 0 ? totalReferredOrders / totalClicks : null,
    };
  }
}
