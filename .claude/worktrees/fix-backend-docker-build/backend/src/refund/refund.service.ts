import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountPurpose, JournalSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { AccountResolverService } from '../ledger/account-resolver.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';
import { ApproveRefundDto, CreateRefundDto, RejectRefundDto } from './dto/create-refund.dto';

const ROUNDING_TOLERANCE = 0.01;

@Injectable()
export class RefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly accountResolver: AccountResolverService,
  ) {}

  private async refundableBalance(receiptId: string) {
    const receipt = await this.prisma.receipt.findUnique({ where: { id: receiptId }, include: { refunds: true } });
    if (!receipt) {
      throw new NotFoundException(`Receipt ${receiptId} not found`);
    }
    const committed = receipt.refunds
      .filter((refund) => refund.status !== 'REJECTED')
      .reduce((sum, refund) => sum + Number(refund.amount), 0);
    return { receipt, refundable: Number(receipt.amount) - committed };
  }

  /**
   * Requests a refund without touching the ledger. Nothing is paid out
   * until an approver calls approve() — this is the workflow gap that
   * previously didn't exist (create() used to post immediately).
   */
  async request(dto: CreateRefundDto) {
    const { receipt, refundable } = await this.refundableBalance(dto.receiptId);
    if (receipt.status === 'CANCELLED') {
      throw new BadRequestException('Cannot refund a cancelled receipt.');
    }
    if (dto.amount - refundable > ROUNDING_TOLERANCE) {
      throw new BadRequestException(`Refund amount exceeds refundable balance of ${refundable.toFixed(2)}.`);
    }

    return this.prisma.refund.create({
      data: {
        receiptId: dto.receiptId,
        amount: dto.amount,
        reason: dto.reason,
        method: dto.method,
        bankAccountId: dto.bankAccountId,
        status: 'PENDING',
        requestedBy: dto.requestedBy || 'system',
      },
    });
  }

  async approve(id: string, dto: ApproveRefundDto) {
    const refund = await this.findOne(id);
    if (refund.status !== 'PENDING') {
      throw new BadRequestException('Only pending refunds can be approved.');
    }

    const receipt = await this.prisma.receipt.findUnique({ where: { id: refund.receiptId } });
    if (!receipt) {
      throw new NotFoundException(`Receipt ${refund.receiptId} not found`);
    }

    const refundsPayable = await this.ledger.getAccountByCode(DEFAULT_ACCOUNT_CODES.REFUNDS_PAYABLE);
    const bankAccount = await this.accountResolver.resolveBankAccount(
      AccountPurpose.GENERAL,
      undefined,
      refund.bankAccountId || receipt.bankAccountId,
    );

    const journal = await this.ledger.postJournal({
      memo: `Refund on receipt ${receipt.receiptNumber}: ${refund.reason}`,
      source: JournalSource.AR,
      sourceId: receipt.id,
      lines: [
        { accountId: refundsPayable.id, debit: Number(refund.amount), currencyCode: receipt.currency },
        { accountId: bankAccount.glAccountId, credit: Number(refund.amount), currencyCode: receipt.currency },
      ],
    });

    const updated = await this.prisma.refund.update({
      where: { id },
      data: {
        status: 'PROCESSED',
        bankAccountId: bankAccount.id,
        processedBy: dto.processedBy || 'system',
        processedAt: new Date(),
        journalEntryId: journal.id,
      },
    });

    const { refundable } = await this.refundableBalance(refund.receiptId);
    if (refundable <= ROUNDING_TOLERANCE) {
      await this.prisma.receipt.update({ where: { id: refund.receiptId }, data: { status: 'REFUNDED' } });
    }

    return updated;
  }

  async reject(id: string, dto: RejectRefundDto) {
    const refund = await this.findOne(id);
    if (refund.status !== 'PENDING') {
      throw new BadRequestException('Only pending refunds can be rejected.');
    }

    return this.prisma.refund.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectedReason: dto.reason,
        processedBy: dto.processedBy || 'system',
        processedAt: new Date(),
      },
    });
  }

  findAll(params: { receiptId?: string; status?: string }) {
    return this.prisma.refund.findMany({
      where: {
        ...(params.receiptId ? { receiptId: params.receiptId } : {}),
        ...(params.status ? { status: params.status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id } });
    if (!refund) {
      throw new NotFoundException(`Refund ${id} not found`);
    }
    return refund;
  }
}
