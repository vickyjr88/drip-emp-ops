import { isTransientFacebookError } from '../../facebook-comments/facebook-comments';
import { Call, Posted, sleep } from './types';

/**
 * Instagram, through the Meta Graph API: the same Facebook Page token the Page posts use, once it carries the Instagram permissions, and
 * the Instagram professional account linked to that Page. A post is three calls: make a container from the picture's address and the
 * caption, wait until Instagram has fetched the picture, publish the container.
 *
 * Instagram takes JPEG only, and only pictures between 4:5 and 1.91:1; the picture address given here is the shop's own converted copy.
 * There is no call to delete a post: that has to be done in the Instagram app.
 */

export type InstagramConfig = {
  version: string;
  token: string;
  /** The Facebook Page the Instagram account is linked to (used to find the account when its id is not given). */
  pageId: string;
  /** The Instagram professional account id, when set directly instead of being found from the Page. */
  accountId?: string;
  waitMs?: number;
  pollMs?: number;
};

export type InstagramAccount = { id: string; username: string | null } | { error: string };

/** Meta's reasons, with what to do about the ones that mean the token or the account is not set up for Instagram. */
export function instagramFailure(r: { status: number; data: any } | null): { ok: false; error: string; transient: boolean } {
  if (!r) return { ok: false, error: 'Instagram could not be reached', transient: true };
  const e = r.data?.error;
  const code = typeof e?.code === 'number' ? e.code : undefined;
  let message = String(e?.error_user_msg || e?.message || `HTTP ${r.status}`);
  if (code === 10 || code === 200 || code === 190 || /permission|instagram_content_publish|instagram_basic/i.test(message)) {
    message = `${message} — the Facebook token needs the instagram_basic and instagram_content_publish permissions: generate it again with them, and check the Instagram account is a Professional account linked to the Page.`;
  }
  return { ok: false, error: [code, message].filter((x) => x !== undefined).join(': ').slice(0, 500), transient: isTransientFacebookError(code, r.status) };
}

export class InstagramClient {
  private cached: { at: number; value: InstagramAccount } | null = null;

  constructor(private readonly cfg: InstagramConfig, private readonly call: Call) {}

  private api(path: string, method: 'GET' | 'POST', body?: Record<string, string>) {
    const base = `https://graph.facebook.com/${this.cfg.version}/${path}`;
    const headers = { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' };
    if (method === 'POST') return this.call(base, { method, headers, body: JSON.stringify(body ?? {}) }, `Instagram ${path.replace(/\/\d+/g, '/{id}')}`);
    return this.call(`${base}?${new URLSearchParams(body ?? {})}`, { method, headers }, `Instagram ${path.replace(/\/\d+/g, '/{id}')}`);
  }

  /** The Instagram account to post to: the one set directly, else the one linked to the Page. Kept for ten minutes. */
  async account(now = Date.now()): Promise<InstagramAccount> {
    if (this.cfg.accountId) return { id: this.cfg.accountId, username: null };
    if (this.cached && now - this.cached.at < 600_000) return this.cached.value;
    const r = await this.api(this.cfg.pageId, 'GET', { fields: 'instagram_business_account{id,username}' });
    const linked = r?.data?.instagram_business_account;
    const value: InstagramAccount = r && r.status < 300 && linked?.id
      ? { id: String(linked.id), username: linked.username ? String(linked.username) : null }
      : { error: r && r.status < 300 ? 'No Instagram professional account is linked to the Facebook Page.' : instagramFailure(r).error };
    // A failure is not kept: the person may be fixing it right now.
    if (!('error' in value)) this.cached = { at: now, value };
    return value;
  }

  async publish(imageUrl: string, caption: string): Promise<Posted> {
    const account = await this.account();
    if ('error' in account) return { ok: false, error: account.error, transient: false };

    const made = await this.api(`${account.id}/media`, 'POST', { image_url: imageUrl, caption });
    const container = made?.data?.id;
    if (!made || made.status >= 300 || !container) return instagramFailure(made);

    // Instagram fetches the picture before the container can be published.
    const until = Date.now() + (this.cfg.waitMs ?? 60_000);
    for (;;) {
      const s = await this.api(String(container), 'GET', { fields: 'status_code' });
      const state = s?.data?.status_code;
      if (state === 'FINISHED') break;
      if (state === 'ERROR' || state === 'EXPIRED') return { ok: false, error: `Instagram could not use the picture (${state}). It must be a JPEG between 4:5 and 1.91:1.`, transient: false };
      if (Date.now() >= until) return { ok: false, error: 'Instagram was still preparing the post; it will be tried again', transient: true };
      await sleep(this.cfg.pollMs ?? 3_000);
    }

    const published = await this.api(`${account.id}/media_publish`, 'POST', { creation_id: String(container) });
    const id = published?.data?.id;
    if (!published || published.status >= 300 || !id) return instagramFailure(published);
    const link = await this.api(String(id), 'GET', { fields: 'permalink' });
    return { ok: true, id: String(id), permalink: link?.data?.permalink ? String(link.data.permalink) : undefined };
  }
}
