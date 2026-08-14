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

      if (definition.uniqueBy) {
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

    return {
      key: definition.key,
      label: definition.label,
      totalRows: results.length,
      validRows: results.filter((row) => row.ok).length,
      invalidRows: results.filter((row) => !row.ok).length,
      rows: results,
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
