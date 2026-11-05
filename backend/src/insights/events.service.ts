import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { classifyVisit, deviceOf, looksLikeBot } from './visit';

export const EVENT_TYPES = ['SESSION_START', 'VIEW_PRODUCT', 'ADD_TO_CART', 'BEGIN_CHECKOUT', 'WHATSAPP_CLICK', 'SEARCH'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const SESSION_ID = /^[A-Za-z0-9]{12,40}$/;
const MAX_BATCH = 10;

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/[\u0000-\u001f]/g, '');
  return t ? t.slice(0, max) : null;
};

/** The events a browser may send in one request, cleaned. Anything unknown is dropped, never stored. */
export function cleanEvents(raw: unknown): Array<{ type: EventType; productSlug: string | null; detail: string | null; input: Record<string, unknown> }> {
  if (!Array.isArray(raw)) throw new BadRequestException('events must be a list.');
  if (raw.length === 0 || raw.length > MAX_BATCH) throw new BadRequestException(`Send between 1 and ${MAX_BATCH} events.`);
  const out: Array<{ type: EventType; productSlug: string | null; detail: string | null; input: Record<string, unknown> }> = [];
  for (const row of raw) {
    const type = (row as any)?.type;
    if (!EVENT_TYPES.includes(type)) continue;
    out.push({ type, productSlug: text((row as any).productSlug, 120), detail: text((row as any).detail, 80), input: (row as any) ?? {} });
  }
  return out;
}

/**
 * A small per-address limit on the public events route, so one client cannot fill the table. Generous, because mobile
 * carriers put many shoppers behind one address and an event is a few bytes. In memory: it resets on a restart, which is fine.
 */
export function makeRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now = Date.now()): boolean => {
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Stores what a shopper did. Anonymous by design: nothing here names the shopper. A crawler or link-preview fetcher is
   * ignored, and a session's start is recorded once however many times the browser repeats it.
   */
  async record(body: { sessionId?: unknown; events?: unknown }, context: { userAgent?: string; originHost?: string }) {
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    if (!SESSION_ID.test(sessionId)) throw new BadRequestException('Invalid session.');
    const events = cleanEvents(body.events);
    if (looksLikeBot(context.userAgent)) return { recorded: 0 };

    const rows: Array<Record<string, unknown>> = [];
    for (const event of events) {
      const base = { sessionId, type: event.type, productSlug: event.productSlug, detail: event.detail };
      if (event.type === 'SESSION_START') {
        if (await this.prisma.storefrontEvent.findFirst({ where: { sessionId, type: 'SESSION_START' }, select: { id: true } })) continue;
        const input = event.input as any;
        const visit = classifyVisit({
          utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign,
          referrer: typeof input.referrer === 'string' ? input.referrer : null,
          clickIds: input.clickIds && typeof input.clickIds === 'object' ? input.clickIds : null,
          ownHost: context.originHost,
        });
        rows.push({ ...base, source: visit.source, medium: visit.medium, campaign: visit.campaign, device: deviceOf(context.userAgent), landingPath: text(input.landingPath, 200) });
      } else {
        rows.push(base);
      }
    }
    if (rows.length) await this.prisma.storefrontEvent.createMany({ data: rows as any });
    return { recorded: rows.length };
  }
}
