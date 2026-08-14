import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JournalSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalEntryDto, JournalLineInputDto } from './dto/create-journal-entry.dto';

export type PostJournalLine = {
  accountId: string;
  debit?: number;
  credit?: number;
  currencyCode?: string;
  fxRate?: number;
  projectId?: string | null;
  unitId?: string | null;
  memo?: string;
};

export type PostJournalOptions = {
  entryDate?: Date;
  memo?: string;
  source: JournalSource;
  sourceId?: string;
  postedBy?: string;
  lines: PostJournalLine[];
};

const ROUNDING_TOLERANCE = 0.01;

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccountByCode(code: string) {
    const account = await this.prisma.chartOfAccount.findUnique({ where: { code } });
    if (!account) {
      throw new NotFoundException(
        `Chart of account with code ${code} is not set up. Run the accounting seed or create it under Chart of Accounts first.`,
      );
    }
    return account;
  }

  private async nextEntryNumber(tx: any) {
    const year = new Date().getFullYear();
    const count = await tx.journalEntry.count({
      where: { entryNumber: { startsWith: `JE-${year}-` } },
    });
    return `JE-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private validateBalance(lines: PostJournalLine[] | JournalLineInputDto[]) {
    if (lines.length < 2) {
      throw new BadRequestException('A journal entry needs at least two lines.');
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of lines) {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      const fxRate = Number(line.fxRate ?? 1);

      if (debit < 0 || credit < 0) {
        throw new BadRequestException('Journal line amounts cannot be negative.');
      }
      if (debit > 0 && credit > 0) {
        throw new BadRequestException('A journal line cannot have both a debit and a credit.');
      }
      if (debit === 0 && credit === 0) {
        throw new BadRequestException('A journal line must have either a debit or a credit amount.');
      }

      totalDebit += debit * fxRate;
      totalCredit += credit * fxRate;
    }

    if (Math.abs(totalDebit - totalCredit) > ROUNDING_TOLERANCE) {
      throw new BadRequestException(
        `Journal entry does not balance: total debits ${totalDebit.toFixed(2)} vs total credits ${totalCredit.toFixed(2)}.`,
      );
    }
  }

  /**
   * Posts a balanced double-entry journal. Callers from AR/AP/petty-cash/fixed-assets
   * services pass an explicit `source` + `sourceId` so postings are traceable back to
   * the sub-ledger transaction that created them.
   */
  async postJournal(options: PostJournalOptions, tx?: any) {
    this.validateBalance(options.lines);
    const runner = tx || this.prisma;

    const entryNumber = await this.nextEntryNumber(runner);

    return runner.journalEntry.create({
      data: {
        entryNumber,
        entryDate: options.entryDate || new Date(),
        memo: options.memo,
        source: options.source,
        sourceId: options.sourceId,
        postedBy: options.postedBy || 'system',
        lines: {
          create: options.lines.map((line) => {
            const fxRate = Number(line.fxRate ?? 1);
            const debit = Number(line.debit || 0);
            const credit = Number(line.credit || 0);
            return {
              accountId: line.accountId,
              debit,
              credit,
              currencyCode: line.currencyCode || 'KES',
              fxRate,
              baseDebit: debit * fxRate,
              baseCredit: credit * fxRate,
              projectId: line.projectId || undefined,
              unitId: line.unitId || undefined,
              memo: line.memo,
            };
          }),
        },
      },
      include: { lines: true },
    });
  }

  async createManualJournal(dto: CreateJournalEntryDto) {
    return this.postJournal({
      entryDate: dto.entryDate ? new Date(dto.entryDate) : undefined,
      memo: dto.memo,
      source: JournalSource.MANUAL,
      postedBy: dto.postedBy,
      lines: dto.lines,
    });
  }

  async reverseJournal(id: string, postedBy?: string) {
    const original = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!original) {
      throw new NotFoundException(`Journal entry ${id} not found`);
    }
    if (original.status === 'REVERSED') {
      throw new BadRequestException('This journal entry has already been reversed.');
    }

    return this.prisma.$transaction(async (tx) => {
      const reversal = await this.postJournal(
        {
          entryDate: new Date(),
          memo: `Reversal of ${original.entryNumber}${original.memo ? ` — ${original.memo}` : ''}`,
          source: original.source,
          sourceId: original.sourceId || undefined,
          postedBy,
          lines: original.lines.map((line) => ({
            accountId: line.accountId,
            debit: Number(line.credit),
            credit: Number(line.debit),
            currencyCode: line.currencyCode,
            fxRate: Number(line.fxRate),
            projectId: line.projectId,
            unitId: line.unitId,
            memo: line.memo || undefined,
          })),
        },
        tx,
      );

      await tx.journalEntry.update({
        where: { id: original.id },
        data: { status: 'REVERSED', reversalOfId: reversal.id },
      });

      return reversal;
    });
  }

  findAll(params: { skip?: number; take?: number; source?: string; sourceId?: string; from?: string; to?: string }) {
    const { skip, take, source, sourceId, from, to } = params;
    return this.prisma.journalEntry.findMany({
      where: {
        ...(source ? { source: source as any } : {}),
        ...(sourceId ? { sourceId } : {}),
        ...(from || to
          ? {
              entryDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: { lines: { include: { account: true } } },
      orderBy: { entryDate: 'desc' },
      skip,
      take,
    });
  }

  async findOne(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: { include: { account: true } } },
    });
    if (!entry) {
      throw new NotFoundException(`Journal entry ${id} not found`);
    }
    return entry;
  }

  async generalLedger(params: { accountId: string; from?: string; to?: string }) {
    const account = await this.prisma.chartOfAccount.findUnique({ where: { id: params.accountId } });
    if (!account) {
      throw new NotFoundException(`Account ${params.accountId} not found`);
    }

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: params.accountId,
        entry: {
          status: 'POSTED',
          ...(params.from || params.to
            ? {
                entryDate: {
                  ...(params.from ? { gte: new Date(params.from) } : {}),
                  ...(params.to ? { lte: new Date(params.to) } : {}),
                },
              }
            : {}),
        },
      },
      include: { entry: true },
      orderBy: { entry: { entryDate: 'asc' } },
    });

    let runningBalance = 0;
    const isDebitNormal = account.type === 'ASSET' || account.type === 'EXPENSE';
    const rows = lines.map((line) => {
      const debit = Number(line.baseDebit);
      const credit = Number(line.baseCredit);
      runningBalance += isDebitNormal ? debit - credit : credit - debit;
      return {
        date: line.entry.entryDate,
        entryNumber: line.entry.entryNumber,
        memo: line.memo || line.entry.memo,
        debit,
        credit,
        balance: runningBalance,
      };
    });

    return { account, rows, closingBalance: runningBalance };
  }

  async trialBalance(asOf?: string) {
    const accounts = await this.prisma.chartOfAccount.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: {
          status: 'POSTED',
          ...(asOf ? { entryDate: { lte: new Date(asOf) } } : {}),
        },
      },
    });

    const totalsByAccount = new Map<string, { debit: number; credit: number }>();
    for (const line of lines) {
      const current = totalsByAccount.get(line.accountId) || { debit: 0, credit: 0 };
      current.debit += Number(line.baseDebit);
      current.credit += Number(line.baseCredit);
      totalsByAccount.set(line.accountId, current);
    }

    const rows = accounts
      .map((account) => {
        const totals = totalsByAccount.get(account.id) || { debit: 0, credit: 0 };
        const net = totals.debit - totals.credit;
        return {
          accountId: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          debit: Math.max(net, 0),
          credit: Math.max(-net, 0),
        };
      })
      .filter((row) => row.debit !== 0 || row.credit !== 0);

    const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
    const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);

    return { asOf: asOf || new Date().toISOString(), rows, totalDebit, totalCredit };
  }
}
