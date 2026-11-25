/**
 * Every integration id and secret the portal can hold, grouped as the Settings screen shows them. The names are the ones the server's .env has always
 * used, so the first start can copy each value across by name and nothing downstream needs to know where a value came from.
 */

export type CredentialField = {
  key: string;
  label: string;
  /** Secret values are never sent to the browser, not even masked beyond their last four characters. The rest are shown. */
  secret: boolean;
  help?: string;
  /** What a value must look like, when that is knowable: catches a pasted secret in the id box before it is saved. */
  pattern?: RegExp;
  patternHint?: string;
};

export type CredentialGroup = {
  id: 'facebook' | 'instagram' | 'threads' | 'x' | 'tiktok' | 'ads';
  label: string;
  description: string;
  /** Whether "Test connection" can check this group with a harmless call. */
  testable: boolean;
  fields: CredentialField[];
};

const DIGITS = /^\d{5,30}$/;

export const CREDENTIAL_GROUPS: CredentialGroup[] = [
  {
    id: 'facebook',
    label: 'Facebook Page',
    description: 'Posting to the Page, and the private and public replies to comments on its posts.',
    testable: true,
    fields: [
      { key: 'FACEBOOK_PAGE_ID', label: 'Page ID', secret: false, pattern: DIGITS, patternHint: 'A Page ID is a long number.', help: 'Facebook Page > About > Page transparency, or the Page address.' },
      { key: 'FACEBOOK_PAGE_ACCESS_TOKEN', label: 'Page access token', secret: true, help: 'A Page token with pages_manage_posts, pages_read_engagement, pages_messaging and, for Instagram, instagram_basic and instagram_content_publish.' },
      { key: 'FACEBOOK_APP_SECRET', label: 'App secret', secret: true, help: 'Meta app > Settings > Basic. Used to check that comment events really come from Facebook.' },
      { key: 'FACEBOOK_WEBHOOK_SECRET', label: 'Webhook secret', secret: true, help: 'The secret in the Page webhook address you gave Facebook (…/facebook-comments/webhook/<secret>). Changing it means changing the address in Meta too.' },
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    description: 'Posts through the Facebook Page connection. Fill these in only to use a different token or to name the Instagram account directly.',
    testable: true,
    fields: [
      { key: 'INSTAGRAM_BUSINESS_ACCOUNT_ID', label: 'Instagram account ID', secret: false, pattern: DIGITS, patternHint: 'An Instagram account ID is a long number.', help: 'Leave blank to use the account linked to the Facebook Page.' },
      { key: 'INSTAGRAM_ACCESS_TOKEN', label: 'Access token', secret: true, help: 'Leave blank to use the Facebook Page token.' },
    ],
  },
  {
    id: 'threads',
    label: 'Threads',
    description: 'Threads has its own login. The app renews the token itself before its 60 days end; a new token saved here replaces the renewed copy.',
    testable: true,
    fields: [
      { key: 'THREADS_ACCESS_TOKEN', label: 'Access token', secret: true, help: 'From the Threads user token generator in the Meta app.' },
      { key: 'THREADS_USER_ID', label: 'Threads user ID', secret: false, pattern: DIGITS, patternHint: 'A Threads user ID is a long number.', help: 'Optional: found from the token when blank.' },
    ],
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    description: 'The four keys of the shop\'s X app, made with Read and write permission. X charges for each post.',
    testable: true,
    fields: [
      { key: 'X_API_KEY', label: 'API key', secret: true },
      { key: 'X_API_SECRET', label: 'API key secret', secret: true },
      { key: 'X_ACCESS_TOKEN', label: 'Access token', secret: true, help: 'Generate it after setting the app to Read and write, or X refuses to post.' },
      { key: 'X_ACCESS_TOKEN_SECRET', label: 'Access token secret', secret: true },
    ],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    description: 'The app from the TikTok developer portal. The account itself is connected on the Social Posting screen.',
    testable: true,
    fields: [
      { key: 'TIKTOK_CLIENT_KEY', label: 'Client key', secret: false },
      { key: 'TIKTOK_CLIENT_SECRET', label: 'Client secret', secret: true },
    ],
  },
  {
    id: 'ads',
    label: 'Ad tracking (X and TikTok)',
    description: 'Tells X and TikTok when an order is paid, so their ads can be measured. Separate from posting.',
    testable: false,
    fields: [
      { key: 'X_PIXEL_ID', label: 'X pixel ID', secret: false },
      { key: 'X_PIXEL_TOKEN', label: 'X conversions token', secret: true },
      { key: 'TIKTOK_PIXEL_ID', label: 'TikTok pixel ID', secret: false },
      { key: 'TIKTOK_ACCESS_TOKEN', label: 'TikTok events access token', secret: true },
    ],
  },
];

export const CREDENTIAL_FIELDS: CredentialField[] = CREDENTIAL_GROUPS.flatMap((g) => g.fields);
export const findCredentialField = (key: string) => CREDENTIAL_FIELDS.find((f) => f.key === key);

/** Why a value cannot be saved, or null when it can. */
export function invalidCredential(field: CredentialField, value: string): string | null {
  if (value.length > 4000) return `${field.label} is too long.`;
  if (/[\r\n\t\0]/.test(value)) return `${field.label} must be one line with no tabs or spaces at either end.`;
  if (field.pattern && !field.pattern.test(value)) return `${field.label}: ${field.patternHint ?? 'that does not look right.'}`;
  return null;
}
