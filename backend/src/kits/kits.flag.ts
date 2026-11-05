import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The master switch for the Kits and Design Center line on the public site.
 *
 * It lives in the database (KitSettings, one row) so an admin turns the line on or off from the portal, and it is OFF
 * until someone does. The environment variable KITS_ENABLED=false is an emergency override: when set, the line is off
 * whatever the portal says (for an operator who cannot reach the portal).
 *
 * While it is off, every public /kits route answers 404 exactly as if the line did not exist, and the site hides every
 * link to it, drops it from the sitemap and serves no feed. Staff can still prepare kits and clubs in the portal (the
 * admin routes are not behind this switch), so the catalogue can be ready before the day it is turned on.
 *
 * Read through a short in-process cache so a busy public page does not query it on every request; turning it on or
 * off takes effect at once on the server that handled the change and within a few seconds on the other slot.
 */
const CACHE_MS = 5000;

export const kitsForcedOff = (): boolean => (process.env.KITS_ENABLED ?? '').trim().toLowerCase() === 'false';

@Injectable()
export class KitsFlagService {
  private cached: { value: boolean; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(): Promise<boolean> {
    if (kitsForcedOff()) return false;
    const now = Date.now();
    if (this.cached && now - this.cached.at < CACHE_MS) return this.cached.value;
    let value = false;
    try {
      value = Boolean((await this.prisma.kitSettings.findUnique({ where: { id: 'kits' } }))?.enabled);
    } catch {
      // The table is missing (migration not applied yet) or the database is unreachable: the safe answer is "off".
      value = false;
    }
    this.cached = { value, at: now };
    return value;
  }

  async status() {
    const row = await this.prisma.kitSettings.findUnique({ where: { id: 'kits' } }).catch(() => null);
    const forcedOff = kitsForcedOff();
    return {
      enabled: !forcedOff && Boolean(row?.enabled),
      switchedOn: Boolean(row?.enabled),
      forcedOff,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async set(enabled: boolean, updatedBy?: string) {
    await this.prisma.kitSettings.upsert({
      where: { id: 'kits' },
      update: { enabled, updatedBy: updatedBy ?? null },
      create: { id: 'kits', enabled, updatedBy: updatedBy ?? null },
    });
    this.cached = null;
    return this.status();
  }
}

@Injectable()
export class KitsEnabledGuard implements CanActivate {
  constructor(private readonly flag: KitsFlagService) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.flag.isEnabled())) throw new NotFoundException();
    return true;
  }
}
