/**
 * The three messages staff can send a customer from the portal. Each is an approved WhatsApp *marketing* template with
 * two variables: {{1}} the customer's first name, {{2}} the link. Keeping the link in a variable means the group invite
 * or review link can change without sending the template back to Meta for review.
 *
 * Template text to submit in WhatsApp Manager (Category: Marketing, Language: English):
 *
 *   drip_app_download  Hi {{1}}, thanks for joining Drip Emporium. Order faster and track your pairs in our app: {{2}} See you in the app!
 *   drip_join_group    Hi {{1}}, join the Drip Emporium WhatsApp group for new arrivals and offers before anyone else: {{2}} See you there!
 *   drip_rate_us       Hi {{1}}, enjoying your Drip Emporium shoes? A quick rating on Google helps other shoppers find us: {{2}} Thank you!
 *
 * (A variable cannot be the first or last thing in a template body, hence the closing sentence.)
 */
export type OutreachKind = 'APP' | 'GROUP' | 'REVIEW';

export const OUTREACH_KINDS: OutreachKind[] = ['APP', 'GROUP', 'REVIEW'];

export const KIND_LABELS: Record<OutreachKind, string> = {
  APP: 'Download the app',
  GROUP: 'Join the WhatsApp group',
  REVIEW: 'Rate us on Google',
};

export const DEFAULT_APP_URL = 'https://play.google.com/store/apps/details?id=com.dripemporium.app';

export const isKind = (value: unknown): value is OutreachKind => OUTREACH_KINDS.includes(value as OutreachKind);

export const templateFor = (kind: OutreachKind): string =>
  ({
    APP: process.env.WHATSAPP_TEMPLATE_APP || 'drip_app_download',
    GROUP: process.env.WHATSAPP_TEMPLATE_GROUP || 'drip_join_group',
    REVIEW: process.env.WHATSAPP_TEMPLATE_REVIEW || 'drip_rate_us',
  })[kind];

/** Only web links are sent: whatever is stored in the site content is used in a message to a customer. */
export const safeUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

/** First name for "Hi {{1}}", or "there" when it is missing or is really a phone number or an email. */
export const greetingName = (firstName: string | null | undefined): string => {
  const word = (firstName ?? '').trim().split(/\s+/)[0] ?? '';
  if (!word || /\d/.test(word) || word.includes('@')) return 'there';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
};
