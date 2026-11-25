import type { AlertKind } from './alert-kinds';

/**
 * One thing to tell the shop's people, described once and rendered three ways: an email, a WhatsApp message written out in full (used
 * when the person has written to the business in the last 24 hours, the only time WhatsApp allows free text), and the three short
 * values an approved template fills in (used otherwise).
 */
export type AlertEvent = {
  kind: AlertKind;
  /** The email subject and the first line of the WhatsApp message. */
  subject: string;
  /** The email's heading. */
  heading: string;
  /** Short facts, in order. A blank value is left out. */
  rows: Array<[label: string, value: string | null | undefined]>;
  /** A long piece of text (a message, a reason) shown under the facts. */
  text?: { label: string; value: string };
  /** A customer to reply to. The link opens their chat with the message ready; nothing is sent from here. */
  followUp?: { phone?: string | null; message?: string };
  /** A portal page to open, e.g. /portal/inquiries. */
  portalPath?: string;
  /** With the kind, makes a repeat of the same event one alert. */
  dedupeKey?: string;
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** WhatsApp template values must be one line, with no runs of spaces. */
export const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function filledRows(event: AlertEvent): Array<[string, string]> {
  return event.rows.filter((r): r is [string, string] => Boolean(r[1] && String(r[1]).trim())).map(([l, v]) => [l, String(v).trim()]);
}

/** Digits with the country code, from a number typed any usual way; null when it cannot be one. */
export function chatNumber(raw?: string | null): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function followUpUrl(event: AlertEvent): string | null {
  const phone = chatNumber(event.followUp?.phone);
  if (!phone) return null;
  const text = event.followUp?.message ? `?text=${encodeURIComponent(event.followUp.message)}` : '';
  return `https://wa.me/${phone}${text}`;
}

export function portalUrl(event: AlertEvent, origin: string): string | null {
  return event.portalPath ? `${origin.replace(/\/$/, '')}${event.portalPath}` : null;
}

/** The facts on one line, for the log and for the template. */
export function summaryLine(event: AlertEvent): string {
  const parts = filledRows(event).map(([l, v]) => `${l}: ${oneLine(v)}`);
  if (event.text) parts.push(`${event.text.label}: ${oneLine(event.text.value)}`);
  return parts.join(' · ');
}

export function renderEmail(event: AlertEvent, origin: string): { subject: string; html: string } {
  const facts = filledRows(event).map(([l, v]) => `<p style="margin:0 0 6px"><strong>${escapeHtml(l)}:</strong> ${escapeHtml(v)}</p>`).join('');
  const text = event.text
    ? `<p style="margin:16px 0 4px"><strong>${escapeHtml(event.text.label)}:</strong></p><p style="white-space:pre-wrap;margin:0">${escapeHtml(event.text.value)}</p>`
    : '';
  const reply = followUpUrl(event);
  const portal = portalUrl(event, origin);
  const links = [
    reply ? `<a href="${escapeHtml(reply)}" style="display:inline-block;padding:10px 16px;background:#25d366;color:#fff;text-decoration:none;border-radius:6px;margin-right:8px">Reply on WhatsApp</a>` : '',
    portal ? `<a href="${escapeHtml(portal)}" style="display:inline-block;padding:10px 16px;background:#1a1c1c;color:#fff;text-decoration:none;border-radius:6px">Open in the portal</a>` : '',
  ].filter(Boolean).join('');
  return {
    subject: event.subject,
    html: `<h2>${escapeHtml(event.heading)}</h2>${facts}${text}${links ? `<p style="margin:20px 0 0">${links}</p>` : ''}`,
  };
}

/** The full message, for a recipient whose 24-hour window is open. */
export function renderWhatsAppText(event: AlertEvent, origin: string): string {
  const lines = [`*${event.subject}*`, ...filledRows(event).map(([l, v]) => `${l}: ${v}`)];
  if (event.text) lines.push('', `${event.text.label}:`, clip(event.text.value, 800));
  const tail: string[] = [];
  const reply = followUpUrl(event);
  const portal = portalUrl(event, origin);
  if (reply) tail.push(`Reply: ${reply}`);
  if (portal) tail.push(`Portal: ${portal}`);
  if (tail.length) lines.push('', ...tail);
  return lines.join('\n').trim();
}

/**
 * The three values an approved template fills in. Create the template in WhatsApp Manager (category Utility), name `admin_alert`:
 *
 *   Drip Emporium alert: {{1}}
 *
 *   {{2}}
 *
 *   {{3}}
 */
export function templateParams(event: AlertEvent, origin: string): [string, string, string] {
  const reply = followUpUrl(event);
  const portal = portalUrl(event, origin);
  const action = reply ? `Reply: ${reply}` : portal ? `Open: ${portal}` : 'Open the portal to follow up.';
  return [clip(oneLine(event.subject), 120), clip(summaryLine(event) || oneLine(event.heading), 500), clip(oneLine(action), 300)];
}
