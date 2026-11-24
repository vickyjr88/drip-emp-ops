import { inSendWindow } from '../whatsapp-outreach/whatsapp-subscription';

/**
 * The rules for following up leads and abandoned carts on their own, kept free of the database and of Meta so they can be tested:
 * when a lead is due, whether it should be chased at all, which channels to use, how a failure is read, and what the lead is marked as.
 *
 * A lead is chased once, about an hour after the shopper's last activity, by email and by WhatsApp, between 08:00 and 20:00 Nairobi time, and
 * only if the shopper has not already opened a WhatsApp conversation with the shop. Whatever happens, the lead ends up marked: done, failed
 * or skipped, with the reason, so nobody is chased twice and nobody is left wondering.
 */

export type FollowUpState = 'PENDING' | 'DONE' | 'FAILED' | 'SKIPPED';
/** What happened on WhatsApp: SENT (the template went and opened a conversation), FAILED (this number cannot be reached there), CONVERSATION (they had already written to us). */
export type WhatsappResult = 'SENT' | 'FAILED' | 'CONVERSATION';
export type EmailResult = 'SENT' | 'FAILED';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type FollowUpConfig = {
  enabled: boolean;
  delayMs: number;
  maxAgeMs: number;
  batch: number;
  /** WhatsApp template messages follow-ups may send beyond the shared daily cap, so onboarding messages cannot starve them. */
  reserve: number;
  maxAttempts: number;
  retryMs: number;
  /** How long the run pauses for a problem with the shop's WhatsApp account (payment, a lock, a rate limit): these take a while to fix. */
  pauseMs: number;
  /** ...and for the message not being sendable (a template not yet approved): usually fixed within hours, so it is checked again sooner. */
  configPauseMs: number;
};

const positive = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Settings, read when used rather than at start-up so they can be tested and so a restart picks up an edited .env. */
export function followUpConfig(env: Record<string, string | undefined> = process.env): FollowUpConfig {
  return {
    enabled: (env.LEAD_FOLLOWUP_ENABLED ?? 'true') !== 'false',
    delayMs: positive(env.LEAD_FOLLOWUP_DELAY_MINUTES, 60) * 60_000,
    maxAgeMs: positive(env.LEAD_FOLLOWUP_MAX_AGE_DAYS, 30) * DAY_MS,
    batch: Math.floor(positive(env.LEAD_FOLLOWUP_BATCH, 10)),
    reserve: Math.floor(positive(env.LEAD_FOLLOWUP_RESERVE, 40)),
    maxAttempts: Math.floor(positive(env.LEAD_FOLLOWUP_MAX_ATTEMPTS, 3)),
    retryMs: positive(env.LEAD_FOLLOWUP_RETRY_MINUTES, 60) * 60_000,
    pauseMs: positive(env.LEAD_FOLLOWUP_PAUSE_HOURS, 6) * HOUR_MS,
    configPauseMs: positive(env.LEAD_FOLLOWUP_CONFIG_PAUSE_MINUTES, 60) * 60_000,
  };
}

/** Follow-ups go out between 08:00 and 20:00 Nairobi time, the same window as every other message to customers. */
export const canSendNow = (now: Date) => inSendWindow(now, 8, 20);

/** The next moment a message may go: now if it is inside the window, else 08:00 Nairobi time. Used to say when the backlog will start moving. */
export function nextWindowOpens(now: Date): Date {
  if (canSendNow(now)) return now;
  const EAT_MS = 3 * HOUR_MS;
  const local = new Date(now.getTime() + EAT_MS);
  const eightToday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 8) - EAT_MS;
  return new Date(eightToday > now.getTime() ? eightToday : eightToday + DAY_MS);
}

/** When a lead becomes due: an hour after the shopper last did anything (an abandoned cart that is still being added to is not abandoned yet). */
export const dueAt = (lead: { lastActivityAt: Date; createdAt: Date }, delayMs: number) =>
  new Date(Math.max(lead.lastActivityAt.getTime(), lead.createdAt.getTime()) + delayMs);

// --- what is said ---------------------------------------------------------------------------------------------------

type Line = { name?: string | null; size?: string | null; quantity?: number | null };
const NO_SIZE = /^(standard|one size|default)$/i;

const oneLine = (text: string) => text.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();

/**
 * What the shopper left, in a few words for a WhatsApp template variable: "Nike Air Force 1 (size 42) and 2 more". A variable may not contain
 * line breaks, tabs or runs of spaces, so those are removed, and it is kept short enough to read in a notification.
 */
export function itemsSummary(lines: Line[], max = 90): string {
  const named = (lines ?? []).filter((l) => oneLine(l?.name ?? ''));
  if (!named.length) return 'some items';
  const label = (l: Line) => {
    const size = oneLine(l.size ?? '');
    return `${oneLine(l.name ?? '')}${size && !NO_SIZE.test(size) ? ` (size ${size})` : ''}`;
  };
  const first = label(named[0]);
  const rest = named.length - 1;
  let text = rest > 0 ? `${first} and ${rest} more` : first;
  if (text.length > max) {
    // Cut the name, never the "and N more" that says there is more.
    const tail = rest > 0 ? ` and ${rest} more` : '';
    text = `${first.slice(0, Math.max(10, max - tail.length - 1)).trimEnd()}…${tail}`;
  }
  return text;
}

export type FollowUpKind = 'ABANDONED_CART' | 'WHATSAPP_ORDER';

/** The three values of the approved templates: first name, what they left, and a link back. All plain text on one line. */
export function whatsappParams(input: { name?: string | null; items: string; link: string }): string[] {
  const first = oneLine(input.name ?? '').split(' ')[0] ?? '';
  const name = !first || /\d|@/.test(first) || /^(walk-?in|guest|customer)$/i.test(first) ? 'there' : first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return [name, oneLine(input.items) || 'some items', oneLine(input.link)];
}

// --- reading a WhatsApp failure -------------------------------------------------------------------------------------

/**
 * Who a WhatsApp failure is about.
 *  - NUMBER: this number cannot get the message (not on WhatsApp, undeliverable). Mark the lead; retrying changes nothing.
 *  - ACCOUNT: the shop's account is the problem (payment, a lock, a rate limit). Nobody did anything wrong, so the lead is left as it was and
 *    the run pauses; it is tried again later.
 *  - CONFIG: the message itself cannot be sent (template missing, paused or not approved; bad token; test mode). Same: leave the lead, pause,
 *    and say so loudly, because every send would fail the same way.
 *  - OTHER: unknown. Retried a few times, then given up on.
 */
export type FailureKind = 'NUMBER' | 'ACCOUNT' | 'CONFIG' | 'OTHER';

const NUMBER_CODES = new Set(['131026', '131021', '131052', '131053']);
const ACCOUNT_CODES = new Set(['131042', '131031', '131048', '131049', '131056', '130429', '80007', '368', '133016']);
const CONFIG_CODES = new Set(['132000', '132001', '132005', '132007', '132012', '132015', '132016', '131030', '131037', '190', '10', '200', '100000']);

export function classifyFailure(code: string | null | undefined, message?: string | null): FailureKind {
  const c = (code ?? '').trim();
  if (NUMBER_CODES.has(c)) return 'NUMBER';
  if (ACCOUNT_CODES.has(c)) return 'ACCOUNT';
  if (CONFIG_CODES.has(c)) return 'CONFIG';
  const text = (message ?? '').toLowerCase();
  if (/not a valid whatsapp|not.*on whatsapp|undeliverable|not registered|unusable whatsapp number/.test(text)) return 'NUMBER';
  if (/template.*(not exist|does not exist|not found|paused|disabled|not approved|rejected)|access token|oauth|not configured/.test(text)) return 'CONFIG';
  if (/payment|rate limit|too many|throttl|spam/.test(text)) return 'ACCOUNT';
  return 'OTHER';
}

/** "131026: Message undeliverable" (how a failed delivery is stored) or "(#131026) ..." into the code. */
export function errorCodeOf(text: string | null | undefined): string | null {
  const m = /^\s*\(?#?(\d{3,6})\)?\s*[:)]?/.exec(text ?? '');
  return m ? m[1] : null;
}

// --- deciding ---------------------------------------------------------------------------------------------------------

export type DecideInput = {
  now: Date;
  lead: {
    status: string;
    state: FollowUpState;
    createdAt: Date;
    lastActivityAt: Date;
    nextAt: Date | null;
    emailAttempts: number;
    whatsapp: WhatsappResult | null;
    email: EmailResult | null;
    /** The older 24-hour reminder email, sent before this follow-up existed: counts as already emailed. */
    reminderSentAt: Date | null;
  };
  /** The number as WhatsApp wants it (digits with the country code), or null. */
  phone: string | null;
  /** The person's own address, or null (a stand-in address is not one). */
  email: string | null;
  facts: {
    /** They wrote to the shop's WhatsApp number at or after the lead: a conversation is already open. */
    conversation: boolean;
    /** They replied STOP. */
    stopped: boolean;
    /** An earlier message to this number came back undeliverable. */
    badNumber: boolean;
    /** This number was already followed up (another lead) in the last day. */
    sameNumberRecently: boolean;
    /** This address was already followed up in the last day. */
    sameEmailRecently: boolean;
  };
  channels: { whatsappReady: boolean; emailReady: boolean };
  config: Pick<FollowUpConfig, 'delayMs' | 'maxAgeMs' | 'maxAttempts'>;
};

export type Decision =
  | { action: 'WAIT'; until?: Date }
  | { action: 'CLOSE'; state: Exclude<FollowUpState, 'PENDING'>; reason: string; note: string }
  | { action: 'SEND'; whatsapp: boolean; email: boolean };

const close = (state: Exclude<FollowUpState, 'PENDING'>, reason: string, note: string): Decision => ({ action: 'CLOSE', state, reason, note });

export function decide(i: DecideInput): Decision {
  const { lead, facts, channels, now } = i;
  if (lead.state !== 'PENDING') return { action: 'WAIT' };

  // Not a lead any more.
  if (lead.status === 'CONVERTED') return close('SKIPPED', 'CLOSED', 'An order was placed');
  if (lead.status === 'EXPIRED') return close('SKIPPED', 'CLOSED', 'Dismissed by staff');
  if (now.getTime() - lead.lastActivityAt.getTime() > i.config.maxAgeMs) return close('SKIPPED', 'TOO_OLD', 'Too old to chase automatically');
  // Staff opened the WhatsApp follow-up button: that is a follow-up.
  if (lead.status === 'CONTACTED') return close('DONE', 'STAFF', 'A member of staff followed this up');

  const due = dueAt(lead, i.config.delayMs);
  if (now < due) return { action: 'WAIT', until: due };
  if (lead.nextAt && now < lead.nextAt) return { action: 'WAIT', until: lead.nextAt };

  if (!i.phone && !i.email) return close('SKIPPED', 'NO_CONTACT', 'No usable phone number or email address');

  // They are already talking to the shop on WhatsApp: a nudge from us would only interrupt.
  if (facts.conversation) return close('DONE', 'CONVERSATION', 'The customer already messaged us on WhatsApp');

  const alreadyEmailed = lead.email === 'SENT' || Boolean(lead.reminderSentAt);
  const waWanted = Boolean(i.phone) && lead.whatsapp === null && !facts.stopped && !facts.badNumber && !facts.sameNumberRecently;
  const emailWanted = Boolean(i.email) && !alreadyEmailed && !facts.sameEmailRecently && lead.emailAttempts < i.config.maxAttempts;
  const wa = waWanted && channels.whatsappReady;
  const email = emailWanted && channels.emailReady;

  if (wa || email) return { action: 'SEND', whatsapp: wa, email };

  // A channel that is wanted but not set up is a reason to wait, not to give up on the lead.
  if ((waWanted && !channels.whatsappReady) || (emailWanted && !channels.emailReady)) return { action: 'WAIT', until: new Date(now.getTime() + 10 * 60_000) };

  // Nothing left to send. Say why, in the most useful words.
  if (lead.whatsapp === 'SENT' || alreadyEmailed) return close('DONE', 'SENT', 'Already followed up');
  if (facts.sameNumberRecently || facts.sameEmailRecently) return close('DONE', 'DUPLICATE', 'The same person was followed up on another lead in the last day');
  if (lead.whatsapp === 'FAILED' || facts.badNumber) return close('FAILED', 'WHATSAPP_FAILED', 'This number is not on WhatsApp and there is no email address to use');
  if (facts.stopped) return close('SKIPPED', 'STOPPED', 'The customer asked us to stop messaging them');
  return close('FAILED', 'NOT_REACHABLE', 'Could not reach this customer');
}

// --- after the sends --------------------------------------------------------------------------------------------------

export type WhatsappAttempt = 'SENT' | 'NUMBER' | 'RETRY' | 'NONE';
export type EmailAttempt = 'SENT' | 'FAILED' | 'NONE';

export type Resolution = {
  state: FollowUpState;
  reason: string;
  note: string;
  /** Try again later (the lead stays PENDING). */
  retry: boolean;
};

/**
 * What a lead is marked as once this run's sends are known. Anything that reached the customer makes it DONE, even if the other channel failed:
 * the WhatsApp result is kept on its own, so a number that failed is marked as failed whether or not the email got through.
 */
export function resolveOutcome(i: {
  whatsapp: WhatsappAttempt;
  email: EmailAttempt;
  priorWhatsapp: WhatsappResult | null;
  priorEmailSent: boolean;
  attempts: number;
  emailAttempts: number;
  hadEmailAddress: boolean;
  maxAttempts: number;
}): Resolution {
  const waSent = i.whatsapp === 'SENT' || i.priorWhatsapp === 'SENT';
  const emailSent = i.email === 'SENT' || i.priorEmailSent;
  if (waSent || emailSent) {
    const channels = [waSent ? 'WhatsApp' : '', emailSent ? 'email' : ''].filter(Boolean).join(' and ');
    const waFailed = i.whatsapp === 'NUMBER' || i.priorWhatsapp === 'FAILED';
    return { state: 'DONE', reason: 'SENT', note: `Followed up by ${channels}${waFailed ? '; the WhatsApp number could not be reached' : ''}`, retry: false };
  }

  const waDead = i.whatsapp === 'NUMBER' || i.priorWhatsapp === 'FAILED';
  const emailPossible = i.hadEmailAddress && i.emailAttempts < i.maxAttempts;
  if (waDead && !emailPossible) return { state: 'FAILED', reason: 'WHATSAPP_FAILED', note: 'This number is not on WhatsApp and there is no email address that worked', retry: false };

  const retryable = i.whatsapp === 'RETRY' || i.email === 'FAILED' || (waDead && emailPossible);
  if (retryable && i.attempts + 1 < i.maxAttempts) return { state: 'PENDING', reason: 'RETRY', note: 'Will try again', retry: true };
  if (retryable) return { state: 'FAILED', reason: 'GAVE_UP', note: `Not delivered after ${i.maxAttempts} tries`, retry: false };

  return { state: 'FAILED', reason: 'NOT_REACHABLE', note: 'Could not reach this customer', retry: false };
}

// --- links ------------------------------------------------------------------------------------------------------------

/**
 * A link back to the shop, tagged so a visit that comes through it shows up in Insights as follow-up traffic (source whatsapp or email,
 * medium `auto-followup`, campaign the kind of lead). With no product page to send them to, a cart goes to the cart and an enquiry to the shop.
 */
export function utmLink(origin: string, path: string | null | undefined, kind: FollowUpKind, source: 'whatsapp' | 'email'): string {
  const base = origin.replace(/\/+$/, '');
  const target = path && path.startsWith('/') && !path.startsWith('//') ? path : kind === 'ABANDONED_CART' ? '/cart' : '/shop';
  const campaign = kind === 'ABANDONED_CART' ? 'abandoned-cart' : 'whatsapp-order';
  return `${base}${target}?utm_source=${source}&utm_medium=auto-followup&utm_campaign=${campaign}`;
}

/** The kind a lead is chased as, and the log's name for what was sent. */
export const outreachKindFor = (kind: FollowUpKind) => (kind === 'ABANDONED_CART' ? 'FOLLOWUP_CART' : 'FOLLOWUP_ORDER');
export const EMAIL_KIND = 'LEAD_FOLLOWUP';
