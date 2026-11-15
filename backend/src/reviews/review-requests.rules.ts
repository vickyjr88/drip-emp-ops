import { escapeHtml, ctaButton } from '../email-log/email-html.util';

/**
 * The automatic "how are your pairs?" message: when it goes, to whom, and what it says. The rules are here, without a database or a
 * network, so they can be tested on their own. The sending is in review-requests.service.ts.
 */

export const DEFAULT_DELAY_HOURS = 24;
export const DEFAULT_MAX_AGE_DAYS = 7;
/** Someone with several orders is not asked again within this many days of the last time they were. */
export const COOLDOWN_DAYS = 14;
/** A failed channel is tried this many times in all, this long apart (a template still in review, a mail outage). */
export const MAX_ATTEMPTS = 4;
export const RETRY_AFTER_HOURS = 6;

/** Off unless REVIEW_REQUESTS_ENABLED is set to true: a message to customers is not something to start by deploying. */
export function reviewRequestsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return ['true', 'on', 'yes', '1'].includes((env.REVIEW_REQUESTS_ENABLED ?? '').trim().toLowerCase());
}

const whole = (raw: string | undefined, min: number, max: number, fallback: number) => {
  const text = (raw ?? '').trim();
  if (!/^\d+$/.test(text)) return fallback;
  const n = Number(text);
  return n >= min && n <= max ? n : fallback;
};

/**
 * `delayHours`: how long after the order is marked delivered the request goes (the customer should have had the pair on). 0 means straight
 * away. `maxAgeDays`: orders delivered longer ago than this are never asked, which is what stops switching this on from messaging everyone
 * who ever bought; staff can still send those by hand from the Ask tab.
 */
export function requestTiming(env: Record<string, string | undefined> = process.env) {
  return {
    delayHours: whole(env.REVIEW_REQUEST_DELAY_HOURS, 0, 720, DEFAULT_DELAY_HOURS),
    maxAgeDays: whole(env.REVIEW_REQUEST_MAX_AGE_DAYS, 1, 90, DEFAULT_MAX_AGE_DAYS),
  };
}

export const reviewRequestTemplate = (env: Record<string, string | undefined> = process.env) => env.WHATSAPP_TEMPLATE_REVIEW_REQUEST?.trim() || 'drip_review_request';

/** Whether the next attempt is due, given how many have been made: null when nothing is left to retry. */
export function nextAttemptAt(failed: boolean, attempts: number, now: Date): Date | null {
  return failed && attempts < MAX_ATTEMPTS ? new Date(now.getTime() + RETRY_AFTER_HOURS * 3_600_000) : null;
}

/** "Air Max", "Air Max and Roma", "Air Max, Roma and 1 more". */
export function pairsPhrase(names: string[]): string {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return 'your new pair';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique[0]}, ${unique[1]} and ${unique.length - 2} more`;
}

export function reviewRequestEmail(input: { firstName: string; products: string[]; link: string }): { subject: string; html: string } {
  const pairs = pairsPhrase(input.products);
  return {
    subject: 'How are your pairs? A quick review helps other shoppers',
    html: `<h2>How are your pairs, ${escapeHtml(input.firstName)}?</h2>
<p>Thank you for shopping at Drip Emporium. We hope you are enjoying ${escapeHtml(pairs)}.</p>
<p>A short review helps other shoppers choose, and takes about a minute. It is shown with your first name only.</p>
${ctaButton(input.link, 'Review my pair')}
<p style="font-size:13px;color:#5b6480;">You are getting this one message because you bought from Drip Emporium. If the button does not work, copy this address into your browser: ${escapeHtml(input.link)}</p>`,
  };
}
