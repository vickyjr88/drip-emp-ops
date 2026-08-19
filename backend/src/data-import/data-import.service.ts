import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ImportDefinition, ImportField, IMPORT_DEFINITIONS, findDefinition } from './import-definitions';

export type ImportRow = { rowNumber: number; [field: string]: unknown };

export type RowResult = {
  rowNumber: number;
  ok: boolean;
  values: Record<string, unknown>;
  errors: string[];
};

/**
 * Shared importer for reference data.
 *
 * Every entity follows the same flow as the expense importer: validate the
 * whole file first, refuse it outright if any row is wrong, then write the
 * batch in one transaction. A half-imported file is worse than a rejected one,
 * because working out which rows landed is harder than fixing the file.
 */
@Injectable()
export class DataImportService {
  constructor(private readonly prisma: PrismaService) {}

  definitions() {
    return IMPORT_DEFINITIONS.map((definition) => ({
      key: definition.key,
      label: definition.label,
      description: definition.description,
      permissionSubject: definition.permissionSubject,
      uniqueBy: definition.uniqueBy,
      fields: definition.fields.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: Boolean(field.required),
        hint: field.hint,
      })),
    }));
  }

  private definitionOrThrow(key: string): ImportDefinition {
    const definition = findDefinition(key);
    if (!definition) {
      throw new NotFoundException(
        `No importer called "${key}". Available: ${IMPORT_DEFINITIONS.map((d) => d.key).join(', ')}`,
      );
    }
    return definition;
  }

  /** Coerces one cell, returning the value or a reason it cannot be used. */
  private coerce(field: ImportField, raw: unknown): { value?: unknown; error?: string } {
    const text = raw === undefined || raw === null ? '' : String(raw).trim();

    if (!text) {
      if (field.required) return { error: `${field.label} is required` };
      return { value: undefined };
    }

    switch (field.type) {
      case 'email': {
        // Deliberately loose: the goal is to catch typos, not to enforce RFC 5322.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
          return { error: `${field.label} "${text}" is not a valid email address` };
        }
        return { value: text.toLowerCase() };
      }
      case 'number': {
        const value = Number(text.replace(/[,\s]/g, ''));
        if (!Number.isFinite(value)) return { error: `${field.label} must be a number` };
        if (field.min !== undefined && value < field.min) {
          return { error: `${field.label} must be at least ${field.min}` };
        }
        if (field.max !== undefined && value > field.max) {
          return { error: `${field.label} must be at most ${field.max}` };
        }
        return { value };
      }
      case 'decimalPercent': {
        // Entered as a percentage because that is how people write rates;
        // stored as a decimal because that is how the app calculates with them.
        const percent = Number(text.replace(/[%,\s]/g, ''));
        if (!Number.isFinite(percent)) return { error: `${field.label} must be a number` };
        if (field.min !== undefined && percent < field.min) {
          return { error: `${field.label} must be at least ${field.min}` };
        }
        if (field.max !== undefined && percent > field.max) {
          return { error: `${field.label} must be at most ${field.max}` };
        }
        return { value: percent / 100 };
      }
      case 'boolean': {
        const lowered = text.toLowerCase();
        if (['true', 'yes', 'y', '1'].includes(lowered)) return { value: true };
        if (['false', 'no', 'n', '0'].includes(lowered)) return { value: false };
        return { error: `${field.label} must be true or false` };
      }
      default:
        return { value: text };
    }
  }

  /**
   * "42" and "eur 42" both become "EUR 42".
   *
   * The catalogue stores sizes that way, and a file typed by hand will not.
   * Normalising here means an imported size matches one added through the
   * portal, rather than sitting beside it as a near-duplicate.
   */
  private normaliseSize(raw: unknown): string {
    const text = String(raw ?? '').trim();
    if (!text) return '';
    const bare = text.match(/^(\d{1,2}(?:\.5)?)$/);
    if (bare) return `EUR ${bare[1]}`;
    const prefixed = text.match(/^eur\s*(\d{1,2}(?:\.5)?)$/i);
    if (prefixed) return `EUR ${prefixed[1]}`;
    return text;
  }

  /** Default variant SKU: AF1-BLK + "EUR 42" -> AF1-BLK-EUR42. */
  private variantSkuFor(productSku: string, size: string) {
    return `${productSku}-${size.replace(/\s+/g, '')}`.toUpperCase();
  }

  /**
   * Product-specific checks, on top of the per-field coercion every importer
   * gets. Rows are grouped by product SKU, so the things that can go wrong are
   * about the group rather than the cell: two rows claiming the same size, a
   * variant SKU colliding with one already in the catalogue, or a product SKU
   * that exists already.
   */
  private async validateProductRows(rows: ImportRow[], results: RowResult[]) {
    const skus = rows.map((row) => String(row.productSku ?? '').trim().toUpperCase()).filter(Boolean);
    const existingProducts = new Set(
      (await this.prisma.product.findMany({
        where: { sku: { in: skus } },
        select: { sku: true },
      })).map((product) => product.sku.toUpperCase()),
    );

    const wantedVariantSkus = rows.map((row) => {
      const productSku = String(row.productSku ?? '').trim().toUpperCase();
      const size = this.normaliseSize(row.size);
      const explicit = String(row.variantSku ?? '').trim().toUpperCase();
      return explicit || (productSku && size ? this.variantSkuFor(productSku, size) : '');
    });
    const existingVariants = new Set(
      (await this.prisma.productVariant.findMany({
        where: { sku: { in: wantedVariantSkus.filter(Boolean) } },
        select: { sku: true },
      })).map((variant) => variant.sku.toUpperCase()),
    );

    const seenSize = new Map<string, number>();
    const seenVariantSku = new Map<string, number>();

    rows.forEach((row, index) => {
      const result = results[index];
      const productSku = String(row.productSku ?? '').trim().toUpperCase();
      const size = this.normaliseSize(row.size);

      if (size) result.values.size = size;
      if (productSku) result.values.productSku = productSku;

      if (productSku && existingProducts.has(productSku)) {
        result.errors.push(
          `Product SKU "${productSku}" already exists. Add sizes to it from its product page instead.`,
        );
      }

      if (productSku && size) {
        const sizeKey = `${productSku}::${size.toUpperCase()}`;
        const first = seenSize.get(sizeKey);
        if (first) {
          result.errors.push(`${productSku} already has size ${size} on row ${first}`);
        } else {
          seenSize.set(sizeKey, row.rowNumber);
        }
      }

      const variantSku = wantedVariantSkus[index];
      if (variantSku) {
        result.values.variantSku = variantSku;
        if (existingVariants.has(variantSku)) {
          result.errors.push(`Size SKU "${variantSku}" already exists in the catalogue`);
        }
        const first = seenVariantSku.get(variantSku);
        if (first) {
          result.errors.push(`Size SKU "${variantSku}" is repeated (also on row ${first})`);
        } else {
          seenVariantSku.set(variantSku, row.rowNumber);
        }
      }

      result.ok = result.errors.length === 0;
    });
  }

  async validate(key: string, rows: ImportRow[]) {
    const definition = this.definitionOrThrow(key);

    // Existing values for the unique field, so a clash is reported before any
    // write rather than surfacing as a constraint error mid-import.
    let existing = new Set<string>();
    if (definition.uniqueBy) {
      const records = await (this.prisma as any)[definition.model].findMany({
        select: { [definition.uniqueBy]: true },
      });
      existing = new Set(
        records
          .map((record: any) => String(record[definition.uniqueBy!] ?? '').trim().toLowerCase())
          .filter(Boolean),
      );
    }

    const seenInFile = new Map<string, number>();
    const results: RowResult[] = [];

    for (const row of rows) {
      const errors: string[] = [];
      const values: Record<string, unknown> = {};

      for (const field of definition.fields) {
        const { value, error } = this.coerce(field, row[field.name]);
        if (error) errors.push(error);
        else if (value !== undefined) values[field.name] = value;
      }

      if (key === 'users') {
        const password = String(row.password ?? '');
        if (password && password.length < 8) {
          errors.push('Initial Password must be at least 8 characters');
        }
      }

      // A grouped importer repeats its key by design -- every size of one shoe
      // carries the same product SKU -- so the duplicate check would reject a
      // correct file. Grouping is validated separately below.
      if (definition.uniqueBy && !definition.groupBy) {
        const raw = values[definition.uniqueBy];
        const value = String(raw ?? '').trim().toLowerCase();
        if (value) {
          if (existing.has(value)) {
            errors.push(`${definition.uniqueBy} "${raw}" already exists`);
          }
          const duplicateRow = seenInFile.get(value);
          if (duplicateRow) {
            errors.push(`${definition.uniqueBy} "${raw}" is repeated (also on row ${duplicateRow})`);
          } else {
            seenInFile.set(value, row.rowNumber);
          }
        }
      }

      results.push({
        rowNumber: row.rowNumber,
        ok: errors.length === 0,
        // Never echo a password back, even in a preview.
        values: key === 'users' ? { ...values, password: values.password ? '••••••••' : undefined } : values,
        errors,
      });
    }

    if (key === 'products') {
      await this.validateProductRows(rows, results);
    }

    return {
      key: definition.key,
      label: definition.label,
      totalRows: results.length,
      validRows: results.filter((row) => row.ok).length,
      invalidRows: results.filter((row) => !row.ok).length,
      rows: results,
    };
  }

  /**
   * Products, which the generic write loop cannot express.
   *
   * Every other importer is one row to one record. Here several rows describe
   * one product with a variant each, so the rows are grouped by product SKU and
   * written as a product with nested variants. Product details come from the
   * first row of each group: repeating them on every row is what the format
   * asks for, and disagreements between rows are not worth failing a file over.
   */
  private async commitProducts(rows: ImportRow[]) {
    type Group = {
      sku: string;
      name: string;
      brand?: string;
      description?: string;
      category?: string;
      variants: {
        sku: string;
        name: string;
        priceKes: number;
        costKes?: number;
        resellerPriceKes?: number;
        wholesalePriceKes?: number;
        barcode?: string;
      }[];
    };

    const groups = new Map<string, Group>();
    for (const row of rows) {
      const sku = String(row.productSku ?? '').trim().toUpperCase();
      const size = this.normaliseSize(row.size);
      const optionalNumber = (value: unknown) => {
        const text = String(value ?? '').trim();
        return text === '' ? undefined : Number(text);
      };

      let group = groups.get(sku);
      if (!group) {
        group = {
          sku,
          name: String(row.name ?? '').trim(),
          brand: String(row.brand ?? '').trim() || undefined,
          description: String(row.description ?? '').trim() || undefined,
          category: String(row.category ?? '').trim() || undefined,
          variants: [],
        };
        groups.set(sku, group);
      }

      group.variants.push({
        sku: String(row.variantSku ?? '').trim().toUpperCase() || this.variantSkuFor(sku, size),
        name: size,
        priceKes: Number(row.priceKes),
        costKes: optionalNumber(row.costKes),
        resellerPriceKes: optionalNumber(row.resellerPriceKes),
        wholesalePriceKes: optionalNumber(row.wholesalePriceKes),
        barcode: String(row.barcode ?? '').trim() || undefined,
      });
    }

    // Categories are resolved once for the whole file, creating any that do not
    // exist. Doing it per row would race inside the transaction and create
    // duplicates for a category named on several rows.
    const categoryNames = [...new Set(
      [...groups.values()].map((group) => group.category).filter((name): name is string => Boolean(name)),
    )];
    const categoryIdByName = new Map<string, string>();
    for (const name of categoryNames) {
      const slug = name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const existing = await this.prisma.productCategory.findFirst({
        where: { OR: [{ name }, { slug }] },
        select: { id: true },
      });
      if (existing) {
        categoryIdByName.set(name, existing.id);
      } else {
        const created = await this.prisma.productCategory.create({
          data: { name, slug },
          select: { id: true },
        });
        categoryIdByName.set(name, created.id);
      }
    }

    const created = await this.prisma.$transaction(
      async (tx) => {
        const ids: string[] = [];
        for (const group of groups.values()) {
          // Slug must be unique; a second colourway legitimately shares a name,
          // so a suffix is added rather than failing the import.
          const root = group.name.toLowerCase().replace(/&/g, ' and ')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
          let slug = root;
          for (let n = 2; ; n++) {
            const clash = await tx.product.findFirst({ where: { slug }, select: { id: true } });
            if (!clash) break;
            slug = `${root}-${n}`;
          }

          const product = await tx.product.create({
            data: {
              sku: group.sku,
              name: group.name,
              slug,
              brand: group.brand,
              description: group.description,
              categoryId: group.category ? categoryIdByName.get(group.category) : undefined,
              variants: {
                create: group.variants.map((variant) => ({
                  sku: variant.sku,
                  name: variant.name,
                  attributes: { size: variant.name },
                  priceKes: variant.priceKes,
                  costKes: variant.costKes,
                  resellerPriceKes: variant.resellerPriceKes,
                  wholesalePriceKes: variant.wholesalePriceKes,
                  barcode: variant.barcode,
                })),
              },
            },
            select: { id: true },
          });
          ids.push(product.id);
        }
        return ids;
      },
      { timeout: 120_000, maxWait: 20_000 },
    );

    return {
      key: 'products',
      label: 'Products & Sizes',
      created: created.length,
      variants: [...groups.values()].reduce((sum, group) => sum + group.variants.length, 0),
    };
  }

  async commit(key: string, rows: ImportRow[]) {
    const definition = this.definitionOrThrow(key);
    const preview = await this.validate(key, rows);

    if (preview.invalidRows > 0) {
      throw new BadRequestException(
        `${preview.invalidRows} of ${preview.totalRows} rows have errors. Fix them and try again — nothing was imported.`,
      );
    }
    if (preview.validRows === 0) {
      throw new BadRequestException('There are no rows to import.');
    }

    // Products group several rows into one record, which the flat loop below
    // cannot express.
    if (key === 'products') {
      return this.commitProducts(rows);
    }

    // Rebuilt from the raw rows: the preview redacts passwords, so it cannot be
    // used as the write payload.
    const payloads: Record<string, unknown>[] = [];
    for (const row of rows) {
      const record: Record<string, unknown> = {};
      for (const field of definition.fields) {
        const { value } = this.coerce(field, row[field.name]);
        if (value !== undefined) record[field.name] = value;
      }
      if (key === 'users') {
        record.password = await bcrypt.hash(String(row.password), 10);
      }
      payloads.push(record);
    }

    const created = await this.prisma.$transaction(
      async (tx) => {
        const ids: string[] = [];
        for (const data of payloads) {
          const record = await (tx as any)[definition.model].create({ data });
          ids.push(record.id);
        }
        return ids;
      },
      { timeout: 120_000, maxWait: 20_000 },
    );

    return { key: definition.key, label: definition.label, created: created.length };
  }

  /**
   * A CSV template with the instructions inside it, so whoever fills it in has
   * the field list in front of them. The parser skips '#' lines.
   */
  buildTemplate(key: string) {
    const definition = this.definitionOrThrow(key);
    const lines: string[] = [
      `# ${definition.label.toUpperCase()} IMPORT TEMPLATE`,
      '#',
      `# ${definition.description}`,
      '#',
      '# Fill in one row per record, below the header row. Lines starting with #',
      '# are ignored, so you can leave these notes in place.',
      '#',
      '# COLUMNS',
    ];

    for (const field of definition.fields) {
      const parts = [field.required ? 'Required.' : 'Optional.'];
      if (field.hint) parts.push(field.hint);
      lines.push(`#   ${field.name.padEnd(28)} ${parts.join(' ')}`);
    }

    if (definition.uniqueBy) {
      lines.push('#', `# ${definition.uniqueBy} must be unique, both in this file and against existing records.`);
    }
    for (const note of definition.notes || []) {
      lines.push(`# ${note}`);
    }

    lines.push('#', definition.fields.map((field) => field.name).join(','));

    const example = definition.fields.map((field) => field.example ?? '').join(',');
    if (example.replace(/,/g, '').trim()) lines.push(example);

    // Trailing newline: without it, appending rows in a text editor joins the
    // first new row onto the example.
    return `${lines.join('\n')}\n`;
  }
}
