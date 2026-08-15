import { BadRequestException, Injectable } from '@nestjs/common';
import { JournalSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';

export type ImportRow = {
  rowNumber: number;
  date?: string;
  description?: string;
  amount?: string | number;
  accountCode?: string;
  storeCode?: string;
};

export type RowResult = {
  rowNumber: number;
  ok: boolean;
  date?: string;
  description?: string;
  amount?: number;
  accountCode?: string;
  accountName?: string;
  storeCode?: string;
  storeName?: string;
  errors: string[];
};

/**
 * Bulk import of historical expenditure.
 *
 * Every row is validated before anything is written, and the whole batch posts
 * in one transaction: a spreadsheet that half-imports is worse than one that
 * does not import at all, because reconciling the remainder means finding which
 * rows landed.
 */
@Injectable()
export class ExpenseImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Accepts d/m/yyyy and yyyy-mm-dd, the two forms the existing spreadsheets
   * use. Day-first is assumed for slash dates: these are Kenyan records, and
   * 3/4/2024 there means 3 April.
   */
  private parseDate(raw: string): Date | null {
    const value = String(raw || '').trim();
    if (!value) return null;

    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
    if (iso) {
      const date = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(value);
    if (slash) {
      const day = +slash[1];
      const month = +slash[2];
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const date = new Date(Date.UTC(+slash[3], month - 1, day));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  private parseAmount(raw: string | number | undefined): number | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    // Spreadsheet exports carry thousands separators and currency prefixes.
    const cleaned = String(raw).replace(/[,\s]/g, '').replace(/^KES/i, '');
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  }

  /**
   * Validates without writing. The UI runs this first so an operator sees every
   * problem in one pass rather than fixing one row per attempt.
   */
  async validate(rows: ImportRow[], creditAccountCode = '1000', defaultStoreCode?: string) {
    const [accounts, stores] = await Promise.all([
      this.prisma.chartOfAccount.findMany({ where: { isActive: true } }),
      this.prisma.store.findMany(),
    ]);

    const accountByCode = new Map(accounts.map((a) => [a.code.toUpperCase(), a]));
    const storeByCode = new Map(stores.map((store) => [store.code.toUpperCase(), store]));

    // A typo'd store code is caught here rather than posting the spend
    // untagged, where it would quietly disappear from every per-store report.
    const fallbackStore = defaultStoreCode?.trim()
      ? storeByCode.get(defaultStoreCode.trim().toUpperCase())
      : undefined;
    if (defaultStoreCode?.trim() && !fallbackStore) {
      throw new BadRequestException(
        `Default store "${defaultStoreCode}" does not exist. Use a store code from Stores.`,
      );
    }

    const creditAccount = accountByCode.get(creditAccountCode.toUpperCase());
    const results: RowResult[] = [];

    for (const row of rows) {
      const errors: string[] = [];

      const date = this.parseDate(String(row.date ?? ''));
      if (!row.date || String(row.date).trim() === '') errors.push('Date is required');
      else if (!date) errors.push(`Date "${row.date}" is not d/m/yyyy or yyyy-mm-dd`);

      const amount = this.parseAmount(row.amount);
      if (amount === null) errors.push('Amount is required and must be a number');
      else if (amount <= 0) errors.push('Amount must be greater than zero');

      const description = String(row.description ?? '').trim();
      if (!description) errors.push('Description is required');

      const rowStoreCode = String(row.storeCode ?? '').trim();
      const store = rowStoreCode ? storeByCode.get(rowStoreCode.toUpperCase()) : fallbackStore;
      if (rowStoreCode && !store) errors.push(`Store "${rowStoreCode}" does not exist`);

      const accountCode = String(row.accountCode ?? '').trim();
      const account = accountCode ? accountByCode.get(accountCode.toUpperCase()) : undefined;
      if (!accountCode) errors.push('Account code is required');
      else if (!account) errors.push(`Account code "${accountCode}" does not exist`);
      else if (account.type !== 'EXPENSE') {
        errors.push(`Account ${account.code} is ${account.type}, not an expense account`);
      }

      results.push({
        rowNumber: row.rowNumber,
        ok: errors.length === 0,
        date: date ? date.toISOString().slice(0, 10) : undefined,
        description,
        amount: amount ?? undefined,
        accountCode: account?.code,
        accountName: account?.name,
        storeCode: store?.code,
        storeName: store?.name,
        errors,
      });
    }

    if (!creditAccount) {
      // Without the funding side nothing can post, so surface it once rather
      // than as an error on every row.
      throw new BadRequestException(
        `Credit account "${creditAccountCode}" does not exist. This is the cash or bank account the spend was paid from.`,
      );
    }

    const valid = results.filter((r) => r.ok);
    return {
      creditAccount: { code: creditAccount.code, name: creditAccount.name },
      totalRows: results.length,
      validRows: valid.length,
      invalidRows: results.length - valid.length,
      totalAmount: Math.round(valid.reduce((sum, r) => sum + (r.amount || 0), 0) * 100) / 100,
      rows: results,
    };
  }

  /**
   * Posts a validated batch. Each row becomes one balanced entry: the expense
   * debited against its store, and the funding account credited.
   */
  async commit(
    rows: ImportRow[],
    options: {
      creditAccountCode?: string;
      postedBy?: string;
      batchRef?: string;
      defaultStoreCode?: string;
    },
  ) {
    const creditAccountCode = options.creditAccountCode || '1000';
    const preview = await this.validate(rows, creditAccountCode, options.defaultStoreCode);

    if (preview.invalidRows > 0) {
      throw new BadRequestException(
        `${preview.invalidRows} of ${preview.totalRows} rows have errors. Fix them and try again — nothing was imported.`,
      );
    }
    if (preview.validRows === 0) {
      throw new BadRequestException('There are no rows to import.');
    }

    const [accounts, stores] = await Promise.all([
      this.prisma.chartOfAccount.findMany({ where: { isActive: true } }),
      this.prisma.store.findMany(),
    ]);
    const accountByCode = new Map(accounts.map((a) => [a.code.toUpperCase(), a]));
    const storeByCode = new Map(stores.map((store) => [store.code.toUpperCase(), store]));
    const creditAccount = accountByCode.get(creditAccountCode.toUpperCase())!;
    const fallbackStoreId = options.defaultStoreCode?.trim()
      ? storeByCode.get(options.defaultStoreCode.trim().toUpperCase())?.id
      : undefined;

    // Stamped on every entry so an entire import can be found -- and undone --
    // as a unit afterwards.
    const batchRef = options.batchRef?.trim() || `IMPORT-${new Date().toISOString().slice(0, 19)}`;

    const created = await this.prisma.$transaction(
      async (tx) => {
        const ids: string[] = [];
        for (const row of preview.rows) {
          const account = accountByCode.get((row.accountCode || '').toUpperCase())!;
          const rowStoreCode = String(row.storeCode ?? '').trim();
          const storeId = rowStoreCode
            ? storeByCode.get(rowStoreCode.toUpperCase())?.id
            : fallbackStoreId;
          const entry = await this.ledger.postJournal(
            {
              entryDate: new Date(`${row.date}T00:00:00.000Z`),
              memo: `${row.description} [${batchRef}]`,
              source: JournalSource.MANUAL,
              sourceId: batchRef,
              postedBy: options.postedBy,
              lines: [
                {
                  accountId: account.id,
                  debit: row.amount!,
                  credit: 0,
                  memo: row.description,
                  // Only the expense side is tagged: the credit is the shared
                  // cash or bank account, which belongs to no single store.
                  storeId,
                },
                { accountId: creditAccount.id, debit: 0, credit: row.amount! },
              ],
            },
            tx,
          );
          ids.push(entry.id);
        }
        return ids;
      },
      // A few thousand spreadsheet rows post one entry at a time; the default
      // 5s transaction timeout is not enough.
      { timeout: 120_000, maxWait: 20_000 },
    );

    return {
      batchRef,
      entriesCreated: created.length,
      totalAmount: preview.totalAmount,
    };
  }

  /**
   * A ready-to-fill CSV listing the real account and store codes.
   *
   * Instructions ship inside the file as comment lines rather than a separate
   * document, so whoever opens the spreadsheet has the codes in front of them.
   * The importer skips any line starting with '#', so the guidance can be left
   * in place.
   */
  async buildTemplate() {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { type: 'EXPENSE', isActive: true },
      include: { parent: true },
      orderBy: { code: 'asc' },
    });

    // Only leaf accounts: posting to a parent would bypass the category split
    // the report is built on.
    const postable = accounts.filter((account) => account.parent !== null);

    const lines: string[] = [
      '# EXPENSE IMPORT TEMPLATE',
      '#',
      '# Fill in one row per payment, below the header row. Lines starting with #',
      '# are ignored, so you can leave these notes in place.',
      '#',
      '# COLUMNS',
      '#   date        Required. d/m/yyyy (e.g. 17/7/2024) or yyyy-mm-dd.',
      '#               Slash dates are read day-first: 3/4/2024 is 3 April.',
      '#   description Required. What the money was spent on, e.g. "somo steel".',
      '#   amount      Required. Positive number. 1,250,000 and KES 1250000 both work.',
      '#   accountCode Required. The expense category — see the list below.',
      '#   storeCode   Optional. Which shop the spend belongs to. Leave blank for',
      '#               head-office costs that belong to no single shop. Set it per',
      '#               row to mix shops in one file, or pick a default at import.',
      '#',
      '# HOW TO TAG A CATEGORY',
      '#   Put the account code in the accountCode column. Every row must use one',
      '#   of the codes below. These are the categories the reports group by, so a',
      '#   wrong code puts the spend under the wrong heading.',
      '#',
    ];

    let currentParent = '';
    for (const account of postable) {
      const parentName = account.parent?.name || '';
      if (parentName !== currentParent) {
        lines.push(`#   ${parentName.toUpperCase()}`);
        currentParent = parentName;
      }
      lines.push(`#     ${account.code}  ${account.name}`);
    }

    const templateStores = await this.prisma.store.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
    if (templateStores.length) {
      lines.push('#', '# STORE CODES');
      for (const store of templateStores) {
        lines.push(`#     ${store.code}  ${store.name}`);
      }
    }

    lines.push(
      '#',
      '# NOTES',
      '#   Each row is posted as a balanced entry: the category is debited and the',
      '#   funding account (cash/bank, chosen at import) is credited. You do not',
      '#   enter the other side.',
      '#   Shared costs such as salaries or rent: enter the share that belongs to',
      '#   each shop as its own row, or leave storeCode blank to keep it central.',
      '#   Do not include subtotal or running-total rows — periods come from the',
      '#   dates, and a total row would be imported as another expense.',
      '#',
      'date,description,amount,accountCode,storeCode',
    );

    // A couple of worked examples using codes that actually exist.
    const example = postable[0];
    if (example) {
      const exampleStore = templateStores[0]?.code || '';
      lines.push(`17/7/2024,shop cleaning,4500,${example.code},${exampleStore}`);
      lines.push(`26/7/2024,accountant fees,15000,${example.code},`);
    }

    // Trailing newline: without it, appending rows in a plain text editor
    // concatenates the first new row onto the last example line.
    return `${lines.join('\n')}\n`;
  }

  /** Batches created by import, so one can be reviewed or undone as a unit. */
  async listBatches() {
    const rows = await this.prisma.journalEntry.groupBy({
      by: ['sourceId'],
      where: { sourceId: { startsWith: 'IMPORT-' }, status: 'POSTED' },
      _count: { _all: true },
      _min: { createdAt: true },
    });

    return rows
      .map((row) => ({
        batchRef: row.sourceId as string,
        entryCount: row._count._all,
        importedAt: row._min.createdAt,
      }))
      .sort((a, b) => (a.importedAt && b.importedAt ? b.importedAt.getTime() - a.importedAt.getTime() : 0));
  }
}
