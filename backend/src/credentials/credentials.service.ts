import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CREDENTIAL_FIELDS, CREDENTIAL_GROUPS, findCredentialField, invalidCredential } from './credential-catalog';
import { decryptValue, encryptValue, parseMasterKey } from './credential-crypto';

/** What the rest of the app reads credentials through. Synchronous on purpose: it reads a copy kept in memory, so no caller had to become async. */
export interface CredentialsReader {
  get(key: string): string;
}

/** The server's environment alone: what the app used before the Credential table, and what tests use. */
export const envCredentials: CredentialsReader = { get: (key) => (process.env[key] ?? '').trim() };

/** The copy in memory is re-read this often, so a change saved through the other backend slot reaches this one within the time. */
const REFRESH_MS = 30_000;

export type CredentialFieldView = {
  key: string; label: string; secret: boolean; help: string | null;
  set: boolean;
  /** PORTAL (typed here), ENV_SEED (copied from the server's .env), SERVER (only in the .env, not yet copied) or null (not set anywhere). */
  source: 'PORTAL' | 'ENV_SEED' | 'SERVER' | null;
  /** The value, for fields that are not secret. Never for secrets. */
  value: string | null;
  /** The last four characters of a secret, to tell two apart. */
  last4: string | null;
  updatedAt: Date | null; updatedBy: string | null;
  error: string | null;
};

/**
 * Integration ids and secrets, kept encrypted in the Credential table and edited in Portal > Settings.
 *
 * A name with a row in the table is read from the table, even when the row is empty (a cleared credential stays cleared rather than quietly
 * falling back to the .env). A name with no row is read from the .env. On start, every name that has a value in the .env and no row is copied
 * into the table, encrypted, so the .env's current values become the table's without anyone handling them.
 *
 * Without CREDENTIALS_ENCRYPTION_KEY nothing is read from or written to the table: the app keeps working from the .env and the screen says why.
 */
@Injectable()
export class CredentialsService implements CredentialsReader, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CredentialsService.name);
  private snapshot = new Map<string, string>();
  private errors = new Map<string, string>();
  private rows = new Map<string, { source: string; updatedAt: Date; updatedBy: string }>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  private key(): Buffer | null { return parseMasterKey(process.env.CREDENTIALS_ENCRYPTION_KEY); }
  get encryptionReady() { return this.key() !== null; }

  get(key: string): string {
    const stored = this.snapshot.get(key);
    return stored !== undefined ? stored : (process.env[key] ?? '').trim();
  }

  async onApplicationBootstrap() {
    try {
      await this.seedFromEnv();
      await this.refresh();
    } catch (error) {
      this.logger.error(`Credentials could not be loaded; the .env is being used: ${(error as Error).message}`);
    }
    this.timer = setInterval(() => void this.refresh().catch((e) => this.logger.warn(`Credentials refresh failed: ${(e as Error).message}`)), REFRESH_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Copies each .env value that has no row yet into the table. Safe to run on both backend slots at once. Logs names, never values. */
  async seedFromEnv(): Promise<string[]> {
    const key = this.key();
    if (!key) {
      if (CREDENTIAL_FIELDS.some((f) => (process.env[f.key] ?? '').trim())) this.logger.warn('CREDENTIALS_ENCRYPTION_KEY is not set: credentials are read from the .env and cannot be edited in the portal.');
      return [];
    }
    const existing = new Set((await this.prisma.credential.findMany({ select: { key: true } })).map((r) => r.key));
    const copied: string[] = [];
    for (const field of CREDENTIAL_FIELDS) {
      const value = (process.env[field.key] ?? '').trim();
      if (!value || existing.has(field.key)) continue;
      const made = await this.prisma.credential.createMany({
        data: [{ key: field.key, value: encryptValue(value, field.key, key), source: 'ENV_SEED', updatedBy: 'server .env' }],
        skipDuplicates: true,
      });
      if (made.count) copied.push(field.key);
    }
    if (copied.length) this.logger.log(`Credentials copied from the .env into the encrypted store: ${copied.join(', ')}.`);
    return copied;
  }

  /** Re-reads the table into memory. A row that cannot be opened (wrong key, tampered) is skipped and reported, and that name falls back to the .env. */
  async refresh(): Promise<void> {
    const key = this.key();
    const snapshot = new Map<string, string>();
    const errors = new Map<string, string>();
    const rows = new Map<string, { source: string; updatedAt: Date; updatedBy: string }>();
    const found = await this.prisma.credential.findMany();
    for (const row of found) {
      rows.set(row.key, { source: row.source, updatedAt: row.updatedAt, updatedBy: row.updatedBy });
      if (!key) { errors.set(row.key, 'CREDENTIALS_ENCRYPTION_KEY is not set on the server, so this saved value cannot be opened.'); continue; }
      try {
        snapshot.set(row.key, decryptValue(row.value, row.key, key));
      } catch {
        errors.set(row.key, 'This saved value cannot be opened with the server\'s encryption key. Enter it again.');
      }
    }
    this.snapshot = snapshot; this.errors = errors; this.rows = rows;
  }

  /** What the Settings screen shows. Secrets are described, never returned. */
  describe() {
    const groups = CREDENTIAL_GROUPS.map((group) => ({
      id: group.id, label: group.label, description: group.description, testable: group.testable,
      fields: group.fields.map((field): CredentialFieldView => {
        const row = this.rows.get(field.key);
        const value = this.get(field.key);
        const fromEnvOnly = !row && value !== '';
        return {
          key: field.key, label: field.label, secret: field.secret, help: field.help ?? null,
          set: value !== '',
          source: row ? (value !== '' ? (row.source === 'ENV_SEED' ? 'ENV_SEED' : 'PORTAL') : null) : fromEnvOnly ? 'SERVER' : null,
          value: !field.secret && value !== '' ? value : null,
          last4: field.secret && value !== '' ? (value.length >= 12 ? value.slice(-4) : '') : null,
          updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null,
          error: this.errors.get(field.key) ?? null,
        };
      }),
    }));
    return { encryptionReady: this.encryptionReady, groups };
  }

  /** Saves the given values (a name left out, or a value that is blank, is left alone: use clear() to remove one). Returns the names changed. */
  async set(values: Record<string, unknown>, by: string): Promise<string[]> {
    const key = this.key();
    if (!key) throw new BadRequestException('Credentials cannot be saved: CREDENTIALS_ENCRYPTION_KEY is not set on the server.');
    const changes: Array<[string, string]> = [];
    for (const [name, raw] of Object.entries(values ?? {})) {
      const field = findCredentialField(name);
      if (!field) throw new BadRequestException(`${name} is not a credential this system keeps.`);
      if (typeof raw !== 'string') throw new BadRequestException(`${field.label} must be text.`);
      const value = raw.trim();
      if (!value) continue;
      const problem = invalidCredential(field, value);
      if (problem) throw new BadRequestException(problem);
      changes.push([name, value]);
    }
    for (const [name, value] of changes) {
      const data = { value: encryptValue(value, name, key), source: 'PORTAL', updatedBy: by };
      await this.prisma.credential.upsert({ where: { key: name }, create: { key: name, ...data }, update: data });
    }
    await this.refresh();
    return changes.map(([name]) => name);
  }

  /** Empties a credential. The row stays (empty), so the .env's value is not used in its place. */
  async clear(name: string, by: string): Promise<void> {
    const key = this.key();
    if (!key) throw new BadRequestException('Credentials cannot be changed: CREDENTIALS_ENCRYPTION_KEY is not set on the server.');
    const field = findCredentialField(name);
    if (!field) throw new BadRequestException(`${name} is not a credential this system keeps.`);
    const data = { value: encryptValue('', name, key), source: 'PORTAL', updatedBy: by };
    await this.prisma.credential.upsert({ where: { key: name }, create: { key: name, ...data }, update: data });
    await this.refresh();
  }
}
