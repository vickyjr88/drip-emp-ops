import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JournalSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalEntryDto, JournalLineInputDto } from './dto/create-journal-entry.dto';
import { nextReference } from '../common/next-reference';

export type PostJournalLine = {
  accountId: string;
  debit?: number;
  credit?: number;
  currencyCode?: string;
  fxRate?: number;
  storeId?: string | null;
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
    return nextReference(tx.journalEntry, 'entryNumber', 'JE');
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
              storeId: line.storeId || undefined,
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

  /**
   * Moves posted lines to a different account or project.
   *
   * Deliberately narrow: only the categorisation fields can change. Amounts,
   * dates and the set of lines are left alone, so a correction can never
   * unbalance an entry or restate what was actually spent -- it only fixes
   * where that spend is reported. Who made the change is captured by the audit
   * log.
   */
  async recategoriseJournal(
    id: string,
    dto: { lines: Array<{ lineId: string; accountId?: string; storeId?: string | null; memo?: string }> },
  ) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!entry) {
      throw new NotFoundException(`Journal entry ${id} not found`);
    }
    if (entry.status !== 'POSTED') {
      throw new BadRequestException(`Only posted entries can be recategorised (this one is ${entry.status}).`);
    }

    const byId = new Map(entry.lines.map((line) => [line.id, line]));
    for (const change of dto.lines) {
      if (!byId.has(change.lineId)) {
        throw new BadRequestException(`Line ${change.lineId} does not belong to this entry.`);
      }
      if (change.accountId) {
        const account = await this.prisma.chartOfAccount.findUnique({ where: { id: change.accountId } });
        if (!account) {
          throw new BadRequestException(`Account ${change.accountId} not found.`);
        }
        if (!account.isActive) {
          throw new BadRequestException(`Account ${account.code} is inactive.`);
        }
      }
      if (change.storeId) {
        const project = await this.prisma.store.findUnique({ where: { id: change.storeId } });
        if (!project) {
          throw new BadRequestException(`Project ${change.storeId} not found.`);
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const change of dto.lines) {
        await tx.journalLine.update({
          where: { id: change.lineId },
          data: {
            ...(change.accountId ? { accountId: change.accountId } : {}),
            // null is meaningful here: it detaches the line from any project.
            ...(change.storeId !== undefined ? { storeId: change.storeId } : {}),
            ...(change.memo !== undefined ? { memo: change.memo } : {}),
          },
        });
      }

      return tx.journalEntry.findUnique({
        where: { id },
        include: { lines: { include: { account: true } } },
      });
    });
  }

  /**
   * Deletes a journal entry outright, both sides together.
   *
   * Reversal is the correct tool for a mistake discovered after the fact: it
   * leaves the original and its correction visible. Deletion is for data that
   * should never have existed -- a mis-keyed import being redone -- where a
   * reversal pair would just be noise in a ledger that is still being built.
   *
   * Restricted to MANUAL entries, so nothing generated by invoicing, petty cash
   * or depreciation can be removed here and leave its source document pointing
   * at a ledger entry that is gone. The audit log records the deletion.
   */
  async deleteJournal(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true, reversedBy: true },
    });
    if (!entry) {
      throw new NotFoundException(`Journal entry ${id} not found`);
    }
    if (entry.source !== JournalSource.MANUAL) {
      throw new BadRequestException(
        `Only manually posted entries can be deleted. ${entry.entryNumber} came from ${entry.source} — reverse it instead.`,
      );
    }
    if (entry.reversedBy) {
      throw new BadRequestException(
        `${entry.entryNumber} has already been reversed. Delete the reversal first if this entry should not exist.`,
      );
    }
    if (entry.reversalOfId) {
      throw new BadRequestException(
        `${entry.entryNumber} is itself a reversal. Deleting it would leave the entry it reversed standing.`,
      );
    }

    // Lines cascade with the entry, so both sides go together and the ledger
    // cannot be left half-deleted and unbalanced.
    await this.prisma.journalEntry.delete({ where: { id } });

    return {
      deleted: true,
      entryNumber: entry.entryNumber,
      linesDeleted: entry.lines.length,
    };
  }

  /**
   * Deletes every entry from one import batch.
   *
   * Undoing a bad import row by row is impractical when it is a few thousand
   * rows, and leaving half of it behind is worse than either outcome.
   */
  async deleteImportBatch(batchRef: string) {
    const entries = await this.prisma.journalEntry.findMany({
      where: { sourceId: batchRef, source: JournalSource.MANUAL },
      select: { id: true, reversalOfId: true, reversedBy: { select: { id: true } } },
    });

    if (!entries.length) {
      throw new NotFoundException(`No manual entries found for batch ${batchRef}`);
    }

    const blocked = entries.filter((entry) => entry.reversedBy || entry.reversalOfId);
    if (blocked.length) {
      throw new BadRequestException(
        `${blocked.length} entries in this batch have been reversed. Resolve those before deleting the batch.`,
      );
    }

    const result = await this.prisma.journalEntry.deleteMany({
      where: { id: { in: entries.map((entry) => entry.id) } },
    });

    return { deleted: true, batchRef, entriesDeleted: result.count };
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
            storeId: line.storeId,
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

  /**
   * Filtered journal search.
   *
   * Line-level filters (project, account, amount) match the *entry* when any of
   * its lines match, and the whole entry is returned: showing one side of a
   * double entry on its own would misrepresent it.
   */
  async findAll(params: {
    skip?: number;
    take?: number;
    source?: string;
    sourceId?: string;
    from?: string;
    to?: string;
    search?: string;
    storeId?: string;
    accountId?: string;
    supplierId?: string;
    status?: string;
    minAmount?: number;
    maxAmount?: number;
    untaggedOnly?: boolean;
  }) {
    const { skip = 0, source, sourceId, from, to, search, storeId, accountId, status } = params;
    const take = Math.min(params.take ?? 50, 200);

    const lineFilters: Prisma.JournalLineWhereInput[] = [];
    if (storeId) lineFilters.push({ storeId });
    if (params.supplierId) lineFilters.push({ supplierId: params.supplierId });
    if (accountId) lineFilters.push({ accountId });
    if (params.untaggedOnly) {
      // Expense with no project never reaches a project report, so being able
      // to list exactly those rows is how a mis-tagged import gets found.
      lineFilters.push({ storeId: null, account: { type: 'EXPENSE' } });
    }
    if (params.minAmount !== undefined || params.maxAmount !== undefined) {
      const range = {
        ...(params.minAmount !== undefined ? { gte: params.minAmount } : {}),
        ...(params.maxAmount !== undefined ? { lte: params.maxAmount } : {}),
      };
      // Either side of the entry can carry the amount being looked for.
      lineFilters.push({ OR: [{ debit: range }, { credit: range }] });
    }

    const where: Prisma.JournalEntryWhereInput = {
      ...(source ? { source: source as any } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(status ? { status: status as any } : {}),
      ...(from || to
        ? {
            entryDate: {
              ...(from ? { gte: new Date(from) } : {}),
              // A bare end date means the whole of that day.
              ...(to ? { lte: new Date(`${to.slice(0, 10)}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(lineFilters.length ? { AND: lineFilters.map((filter) => ({ lines: { some: filter } })) } : {}),
      ...(search
        ? {
            OR: [
              { entryNumber: { contains: search, mode: 'insensitive' } },
              { memo: { contains: search, mode: 'insensitive' } },
              { postedBy: { contains: search, mode: 'insensitive' } },
              { sourceId: { contains: search, mode: 'insensitive' } },
              // Descriptions live on the line, which is where imported rows put
              // the text an operator actually remembers.
              { lines: { some: { memo: { contains: search, mode: 'insensitive' } } } },
              { lines: { some: { account: { name: { contains: search, mode: 'insensitive' } } } } },
              { lines: { some: { account: { code: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include: { lines: { include: { account: true, supplier: { select: { id: true, name: true } } } } },
        orderBy: [{ entryDate: 'desc' }, { entryNumber: 'desc' }],
        skip,
        take,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return { items, total, skip, take };
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

  async generalLedger(params: { accountId: string; from?: string; to?: string; storeId?: string }) {
    const account = await this.prisma.chartOfAccount.findUnique({ where: { id: params.accountId } });
    if (!account) {
      throw new NotFoundException(`Account ${params.accountId} not found`);
    }

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: params.accountId,
        ...(params.storeId ? { storeId: params.storeId } : {}),
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

    return { account, rows, closingBalance: runningBalance, storeId: params.storeId || null };
  }

  /**
   * Scoped to a project this covers only journal lines tagged with it. Such a
   * cut is not expected to balance, since the opposite leg of an entry often
   * sits on an untagged shared account, so `balanced` is null rather than false.
   */
  async trialBalance(asOf?: string, storeId?: string) {
    const accounts = await this.prisma.chartOfAccount.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
    const lines = await this.prisma.journalLine.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
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

    return {
      asOf: asOf || new Date().toISOString(),
      storeId: storeId || null,
      rows,
      totalDebit,
      totalCredit,
      note: storeId
        ? 'Project-scoped view: covers only journal lines tagged with this project, so debits and credits are not expected to agree.'
        : undefined,
    };
  }
}
