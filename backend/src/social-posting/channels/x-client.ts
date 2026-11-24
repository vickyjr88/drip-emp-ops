import { createHmac, randomBytes } from 'crypto';
import { Call, Posted } from './types';

/**
 * X (Twitter). Posting uses the account's own OAuth 1.0a keys: four values from the X developer console that do not expire, so no
 * sign-in flow is needed. One picture goes up first (POST /2/media/upload), then the post that carries it (POST /2/tweets).
 *
 * X charges per request now (a post with a link costs far more than one without), so a failed call because the credit has run out
 * is reported as exactly that, and is never retried.
 */

export type XCredentials = { apiKey: string; apiSecret: string; accessToken: string; accessTokenSecret: string };

const API = 'https://api.x.com/2';

/** RFC 3986 percent-encoding, which OAuth requires (encodeURIComponent leaves ! ' ( ) * alone). */
const enc = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * The Authorization header for one request. Query-string and form fields would be signed with it; a JSON body is not (X's media upload and
 * post creation take JSON). `nonce` and `timestamp` are only given by tests.
 */
export function oauth1Header(method: string, url: string, creds: XCredentials, extra: Record<string, string> = {}, fixed: { nonce?: string; timestamp?: string } = {}): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: fixed.nonce ?? randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: fixed.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };
  const [base, query] = url.split('?');
  const fromQuery = Object.fromEntries(new URLSearchParams(query ?? '').entries());
  const all = { ...fromQuery, ...extra, ...oauth };
  const normalised = Object.keys(all).map((k) => [enc(k), enc(all[k])]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const signatureBase = [method.toUpperCase(), enc(base), enc(normalised)].join('&');
  const key = `${enc(creds.apiSecret)}&${enc(creds.accessTokenSecret)}`;
  const signature = createHmac('sha1', key).update(signatureBase).digest('base64');
  const header = { ...oauth, oauth_signature: signature };
  return `OAuth ${Object.keys(header).sort().map((k) => `${enc(k)}="${enc(header[k as keyof typeof header])}"`).join(', ')}`;
}

/** Why an X call failed, in words, and whether another try could help. */
export function xFailure(r: { status: number; data: any } | null): { ok: false; error: string; transient: boolean } {
  if (!r) return { ok: false, error: 'X could not be reached', transient: true };
  const d = r.data ?? {};
  const detail = d.detail || d.errors?.[0]?.message || d.error || d.title || `HTTP ${r.status}`;
  let error = String(detail);
  if (r.status === 402 || /credits?depleted/i.test(String(d.title ?? '')) || /credit/i.test(error)) {
    error = `X has no credit left for this account: add credit in the X developer console. (${error})`;
  } else if (r.status === 401) {
    error = `X refused the keys: check X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_TOKEN_SECRET, and that the access token was made with Read and write permission. (${error})`;
  }
  // 429 and 5xx pass; everything else (duplicate text, forbidden, no credit) would fail the same way again.
  return { ok: false, error: error.slice(0, 400), transient: r.status === 429 || r.status >= 500 };
}

export class XClient {
  constructor(private readonly creds: XCredentials, private readonly call: Call) {}

  private signed(method: string, url: string, body?: unknown) {
    return this.call(url, {
      method,
      headers: { Authorization: oauth1Header(method, url, this.creds), 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }, `X ${method} ${url.replace(API, '')}`);
  }

  /** One picture and its text as a post. `image` is already a JPEG or PNG under 5 MB. */
  async publish(image: Buffer, text: string): Promise<Posted> {
    const up = await this.signed('POST', `${API}/media/upload`, { media: image.toString('base64'), media_category: 'tweet_image' });
    const mediaId = up?.data?.data?.id;
    if (!up || up.status >= 300 || !mediaId) return xFailure(up);
    const made = await this.signed('POST', `${API}/tweets`, { text, media: { media_ids: [String(mediaId)] } });
    const id = made?.data?.data?.id;
    if (!made || made.status >= 300 || !id) return xFailure(made);
    return { ok: true, id: String(id), permalink: `https://x.com/i/web/status/${id}` };
  }

  async remove(id: string): Promise<{ removed: boolean; detail: string | null }> {
    const r = await this.signed('DELETE', `${API}/tweets/${encodeURIComponent(id)}`);
    if (!r || r.status >= 300 || r.data?.data?.deleted === false) return { removed: false, detail: xFailure(r).error };
    return { removed: true, detail: null };
  }
}
