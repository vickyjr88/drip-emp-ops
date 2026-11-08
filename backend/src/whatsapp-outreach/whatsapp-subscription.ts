import { createHmac, timingSafeEqual } from 'crypto';
import type { OutreachKind } from './whatsapp-outreach.kinds';

/**
 * The rules for people who message the shop's WhatsApp number: what counts as STOP, what Meta's webhook payload looks like
 * once the noise is removed, when the onboarding messages are due and when they may be sent. Pure functions, so the rules are
 * tested without a database or Meta.
 */

// --- what they typed ----------------------------------------------------------------------------------------------

/** The whole message, tidied: lower case, punctuation and extra spaces removed. "STOP." and " stop " are the same. */
const tidy = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

const STOP_WORDS = new Set(['stop', 'stop all', 'stopall', 'unsubscribe', 'opt out', 'optout', 'end']);
const START_WORDS = new Set(['start', 'subscribe', 'unstop', 'resubscribe']);

/**
 * STOP only when that is the whole message. "Please don't stop the delivery" is not an opt-out, and "cancel" is left out on
 * purpose because people use it for orders. Anything that is not exactly a keyword is an ordinary message.
 */
export function classifyKeyword(text: string | null | undefined): 'STOP' | 'START' | null {
  const word = tidy(text ?? '');
  if (STOP_WORDS.has(word)) return 'STOP';
  if (START_WORDS.has(word)) return 'START';
  return null;
}

export const NOTICE_TEXT = "Thanks for messaging Drip Emporium! 👋 You'll now receive updates on new arrivals and offers on this number. Reply STOP at any time to opt out.";
export const STOPPED_TEXT = "You've been unsubscribed and won't receive updates from Drip Emporium. Reply START if you change your mind.";
export const RESUBSCRIBED_TEXT = "Welcome back! You'll receive updates from Drip Emporium again. Reply STOP at any time to opt out.";

// --- Meta's webhook payload ---------------------------------------------------------------------------------------

export type InboundMessage = {
  id: string;
  /** Digits with the country code. */
  from: string;
  name: string | null;
  type: string;
  text: string | null;
  /** Click-to-WhatsApp ad details Meta attaches to the first message of a conversation that came from an ad. */
  referral: { sourceId: string | null; headline: string | null; clickId: string | null } | null;
  timestamp: Date | null;
};

export type DeliveryStatus = {
  id: string;
  status: string;
  recipient: string;
  timestamp: Date | null;
  errorCode: string | null;
  errorTitle: string | null;
};

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const when = (v: unknown): Date | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
};

/** The messages people sent and the delivery reports Meta sent, from a webhook body of any shape. Unknown shapes give nothing. */
export function parseWebhook(body: any): { messages: InboundMessage[]; statuses: DeliveryStatus[] } {
  const messages: InboundMessage[] = [];
  const statuses: DeliveryStatus[] = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'messages') continue;
      const value = change.value ?? {};
      const names = new Map<string, string>();
      for (const c of Array.isArray(value.contacts) ? value.contacts : []) {
        const waId = str(c?.wa_id);
        const name = str(c?.profile?.name, 120);
        if (waId && name) names.set(waId, name);
      }
      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        const from = (str(m?.from) ?? '').replace(/\D/g, '');
        const id = str(m?.id);
        if (!from || !id) continue;
        const ref = m?.referral;
        messages.push({
          id, from, name: names.get(from) ?? null, type: str(m?.type, 30) ?? 'unknown',
          text: m?.type === 'text' ? str(m?.text?.body, 500) : m?.type === 'button' ? str(m?.button?.text, 200) : null,
          referral: ref ? { sourceId: str(ref.source_id), headline: str(ref.headline), clickId: str(ref.ctwa_clid) } : null,
          timestamp: when(m?.timestamp),
        });
      }
      for (const s of Array.isArray(value.statuses) ? value.statuses : []) {
        const id = str(s?.id);
        const status = str(s?.status, 30);
        if (!id || !status) continue;
        const err = Array.isArray(s?.errors) ? s.errors[0] : null;
        statuses.push({
          id, status, recipient: (str(s?.recipient_id) ?? '').replace(/\D/g, ''), timestamp: when(s?.timestamp),
          errorCode: err?.code !== undefined ? String(err.code).slice(0, 20) : null,
          errorTitle: str(err?.title ?? err?.message, 300),
        });
      }
    }
  }
  return { messages, statuses };
}

/** Meta signs each webhook with the app secret: `X-Hub-Signature-256: sha256=<hmac of the exact body>`. */
export function verifySignature(rawBody: Buffer | string | undefined, header: string | undefined, appSecret: string): boolean {
  if (!rawBody || !header || !appSecret) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.replace(/^sha256=/, '');
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The delivery state to keep when reports arrive out of order: read beats delivered beats sent; a failure never overwrites a delivery. */
export function pickDelivery(current: string | null | undefined, next: string): string {
  const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
  if (next === 'failed') return current === 'delivered' || current === 'read' ? current : 'failed';
  if (!current || current === 'failed') return next;
  return (rank[next] ?? 0) > (rank[current] ?? 0) ? next : current;
}

// --- the onboarding messages --------------------------------------------------------------------------------------

/** The same three messages, in the same order and at the same spacing as Mautic campaign 8 sends to new signups. */
export const SEQUENCE: OutreachKind[] = ['APP', 'GROUP', 'REVIEW'];

/** Hours before each message. The first waits a day after the notice so it does not land on top of a live conversation. */
export function sequenceDelaysHours(raw = process.env.WHATSAPP_SEQUENCE_DELAYS_HOURS): number[] {
  const parsed = (raw ?? '').split(',').map((v) => Number(v.trim())).filter((n) => Number.isFinite(n) && n >= 0);
  return parsed.length === SEQUENCE.length ? parsed : [24, 48, 72];
}

/**
 * Failures that say something about the account, not the person: a payment problem, a locked account, a spam-rate limit.
 * Retrying such a message against the person's patience is wrong (they did nothing), so it is retried later without counting
 * against them.
 */
export const ACCOUNT_LEVEL_ERRORS = new Set(['131042', '131031', '131048']);

const EAT_MS = 3 * 3_600_000;

/** Marketing messages go out between 08:00 and 20:00 Nairobi time, never in the middle of the night. */
export function inSendWindow(now: Date, fromHour = 8, toHour = 20): boolean {
  const hour = new Date(now.getTime() + EAT_MS).getUTCHours();
  return hour >= fromHour && hour < toHour;
}

/** The start of today in Nairobi, as a UTC instant: what "messages sent today" counts from. */
export function startOfNairobiDay(now: Date): Date {
  const local = new Date(now.getTime() + EAT_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - EAT_MS);
}
