import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JournalSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { CreateAccountTransferDto } from './dto/create-account-transfer.dto';

@Injectable()
export class AccountTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  private async nextTransferNumber() {
    const year = new Date().getFullYear();
    const count = await this.prisma.accountTransfer.count({
      where: { transferNumber: { startsWith: `XFR-${year}-` } },
    });
    return `XFR-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async create(dto: CreateAccountTransferDto) {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('Cannot transfer an account to itself.');
    }

    const [fromAccount, toAccount] = await Promise.all([
      this.prisma.bankAccount.findUnique({ where: { id: dto.fromAccountId }, include: { glAccount: true } }),
      this.prisma.bankAccount.findUnique({ where: { id: dto.toAccountId }, include: { glAccount: true } }),
    ]);
    if (!fromAccount) throw new NotFoundException(`Bank account ${dto.fromAccountId} not found`);
    if (!toAccount) throw new NotFoundException(`Bank account ${dto.toAccountId} not found`);
    if (fromAccount.currencyCode !== toAccount.currencyCode) {
      throw new BadRequestException(
        'Transfers between accounts in different currencies are not yet supported. Use matching-currency accounts.',
      );
    }

    const transferNumber = await this.nextTransferNumber();

    return this.prisma.$transaction(async (tx) => {
      const journal = await this.ledger.postJournal(
        {
          memo: dto.memo || `Transfer ${transferNumber}: ${fromAccount.name} → ${toAccount.name}`,
          source: JournalSource.ACCOUNT_TRANSFER,
          lines: [
            { accountId: toAccount.glAccountId, debit: dto.amount, currencyCode: toAccount.currencyCode },
            { accountId: fromAccount.glAccountId, credit: dto.amount, currencyCode: fromAccount.currencyCode },
          ],
        },
        tx,
      );

      const transfer = await tx.accountTransfer.create({
        data: {
          transferNumber,
          fromAccountId: dto.fromAccountId,
          toAccountId: dto.toAccountId,
          amount: dto.amount,
          currency: fromAccount.currencyCode,
          memo: dto.memo,
          journalEntryId: journal.id,
          createdBy: dto.createdBy || 'system',
        },
      });

      await tx.journalEntry.update({ where: { id: journal.id }, data: { sourceId: transfer.id } });

      return transfer;
    });
  }

  findAll(params: { skip?: number; take?: number; accountId?: string }) {
    const { skip, take, accountId } = params;
    return this.prisma.accountTransfer.findMany({
      where: accountId ? { OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] } : undefined,
      include: { fromAccount: true, toAccount: true },
      orderBy: { transferDate: 'desc' },
      skip,
      take,
    });
  }

  async findOne(id: string) {
    const transfer = await this.prisma.accountTransfer.findUnique({
      where: { id },
      include: { fromAccount: true, toAccount: true },
    });
    if (!transfer) {
      throw new NotFoundException(`Account transfer ${id} not found`);
    }
    return transfer;
  }
}
