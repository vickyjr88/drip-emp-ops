import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Call, Posted, sleep } from './types';

/**
 * TikTok, through the Content Posting API. Unlike the other channels the login is connected from the portal (a TikTok sign-in) and the
 * app keeps and renews it: the access token is short-lived and the refresh token changes every time it is used.
 *
 * A photo post is pulled by TikTok from a picture address, which must be on a domain or address prefix verified in the TikTok developer
 * portal. Until TikTok has audited the app, nothing can be public: posts are sent to the owner's TikTok inbox to finish and publish
 * (post mode INBOX); once audited, DIRECT publishes them. Neither can be deleted through the API.
 */

const AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com/v2';

export const TIKTOK_SCOPES = 'user.info.basic,video.publish,video.upload';
export type TikTokMode = 'INBOX' | 'DIRECT';

export type TikTokTokens = { accessToken: string; refreshToken: string; expiresAt: Date; refreshExpiresAt: Date; openId: string };

// --- the sign-in state ------------------------------------------------------------------------------------------------------
// The state travels through TikTok and back. It is signed and short-lived, so a forged or replayed callback cannot connect an account.

export function signState(secret: string, by: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ by, at: now, n: randomBytes(8).toString('hex') })).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function checkState(secret: string, state: string, now = Date.now(), maxAgeMs = 15 * 60_000): { by: string } | null {
  const [body, sig] = String(state ?? '').split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  let given: Buffer;
  try { given = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof parsed.at === 'number' && now - parsed.at >= 0 && now - parsed.at <= maxAgeMs ? { by: String(parsed.by ?? '') } : null;
  } catch { return null; }
}

export function authorizeUrl(clientKey: string, redirectUri: string, state: string): string {
  return `${AUTH}?${new URLSearchParams({ client_key: clientKey, scope: TIKTOK_SCOPES, response_type: 'code', redirect_uri: redirectUri, state })}`;
}

// --- failures ------------------------------------------------------------------------------------------------------------------

const HINTS: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts: 'TikTok has not audited this app yet, so it cannot post publicly. Switch TikTok to "Send to my TikTok inbox" until the audit is passed.',
  url_ownership_unverified: 'TikTok has not verified the picture address: add the API\'s domain (or the /social-posting/media/ address prefix) under URL properties for the app in the TikTok developer portal.',
  access_token_invalid: 'The TikTok login is no longer valid: connect TikTok again.',
  scope_not_authorized: 'The TikTok login lacks the posting permission: connect TikTok again and allow everything it asks for.',
  spam_risk_too_many_posts: 'TikTok has reached its daily limit of posts for this account.',
  spam_risk_too_many_pending_share: 'TikTok allows only 5 unfinished inbox posts a day: open the TikTok app and finish or discard the waiting ones.',
  app_version_check_failed: 'The TikTok app on the account\'s phone is too old for inbox posts: update TikTok.',
  reached_active_user_cap: 'The app has reached TikTok\'s limit of accounts posting today.',
};

/** Codes where trying again later can work. Everything else (an unverified address, a banned account, a refused permission) would fail the same way. */
const TRANSIENT = new Set(['rate_limit_exceeded', 'internal_error', 'photo_pull_failed', 'internal']);

export function tiktokFailure(r: { status: number; data: any } | null): { ok: false; error: string; transient: boolean } {
  if (!r) return { ok: false, error: 'TikTok could not be reached', transient: true };
  const code = String(r.data?.error?.code ?? r.data?.error ?? '');
  const message = String(r.data?.error?.message || r.data?.error_description || `HTTP ${r.status}`);
  const hint = HINTS[code];
  return { ok: false, error: `${code ? `${code}: ` : ''}${hint ?? message}`.slice(0, 500), transient: TRANSIENT.has(code) || r.status === 429 || r.status >= 500 };
}

// --- tokens ---------------------------------------------------------------------------------------------------------------------

function tokensFrom(data: any, now: Date): TikTokTokens | null {
  if (!data?.access_token || !data?.refresh_token) return null;
  return {
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token),
    expiresAt: new Date(now.getTime() + (Number(data.expires_in) || 7_200) * 1000),
    refreshExpiresAt: new Date(now.getTime() + (Number(data.refresh_expires_in) || 180 * 86_400) * 1000),
    openId: String(data.open_id ?? ''),
  };
}

export class TikTokClient {
  constructor(private readonly cfg: { clientKey: string; clientSecret: string; redirectUri: string; waitMs?: number; pollMs?: number }, private readonly call: Call) {}

  private form(fields: Record<string, string>, label: string) {
    return this.call(`${API}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: this.cfg.clientKey, client_secret: this.cfg.clientSecret, ...fields }).toString(),
    }, label);
  }

  async exchangeCode(code: string, now = new Date()): Promise<{ ok: true; tokens: TikTokTokens } | { ok: false; error: string }> {
    const r = await this.form({ grant_type: 'authorization_code', code, redirect_uri: this.cfg.redirectUri }, 'TikTok token');
    const tokens = r && r.status < 300 ? tokensFrom(r.data, now) : null;
    return tokens ? { ok: true, tokens } : { ok: false, error: tiktokFailure(r).error };
  }

  /** A new access token. TikTok returns a new refresh token too and cancels the old one, so the caller must keep what comes back. */
  async refresh(refreshToken: string, now = new Date()): Promise<{ ok: true; tokens: TikTokTokens } | { ok: false; error: string; permanent: boolean }> {
    const r = await this.form({ grant_type: 'refresh_token', refresh_token: refreshToken }, 'TikTok refresh');
    const tokens = r && r.status < 300 ? tokensFrom(r.data, now) : null;
    if (tokens) return { ok: true, tokens };
    const failed = tiktokFailure(r);
    // A refused refresh token (expired, replaced or revoked) cannot be fixed by waiting: the account has to be connected again.
    return { ok: false, error: failed.error, permanent: !failed.transient && Boolean(r && r.status < 500) };
  }

  /** The account's display name, for "Connected as ...". Best effort: the connection works without it. */
  async displayName(accessToken: string): Promise<string | null> {
    const r = await this.call(`${API}/user/info/?fields=open_id,display_name`, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }, 'TikTok user info');
    const name = r?.data?.data?.user?.display_name;
    return r && r.status < 300 && name ? String(name) : null;
  }

  /** What privacy options the account offers: needed before a direct post. */
  private async creatorOptions(accessToken: string): Promise<{ ok: true; privacy: string[] } | { ok: false; error: string; transient: boolean }> {
    const r = await this.call(`${API}/post/publish/creator_info/query/`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: '{}',
    }, 'TikTok creator info');
    const error = r?.data?.error?.code;
    if (!r || r.status >= 300 || (error && error !== 'ok')) return tiktokFailure(r);
    return { ok: true, privacy: Array.isArray(r.data?.data?.privacy_level_options) ? r.data.data.privacy_level_options : [] };
  }

  /**
   * Posts one picture (TikTok "photo mode") from an address TikTok pulls it from. `caption`'s first line is the title.
   * INBOX hands it to the owner's TikTok inbox; DIRECT publishes it, if the account allows a public post.
   */
  async publishPhoto(accessToken: string, input: { imageUrl: string; title: string; description: string; mode: TikTokMode; username?: string | null }): Promise<Posted> {
    const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' };
    let privacy = 'SELF_ONLY';
    if (input.mode === 'DIRECT') {
      const options = await this.creatorOptions(accessToken);
      if (!options.ok) return options;
      if (!options.privacy.includes('PUBLIC_TO_EVERYONE')) {
        return { ok: false, error: `This TikTok account does not allow public posts from other apps (it offers: ${options.privacy.join(', ') || 'nothing'}).`, transient: false };
      }
      privacy = 'PUBLIC_TO_EVERYONE';
    }
    const body = {
      media_type: 'PHOTO',
      post_mode: input.mode === 'DIRECT' ? 'DIRECT_POST' : 'MEDIA_UPLOAD',
      post_info: input.mode === 'DIRECT'
        ? { title: input.title, description: input.description, privacy_level: privacy, disable_comment: false, auto_add_music: true }
        : { title: input.title, description: input.description },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [input.imageUrl] },
    };
    const init = await this.call(`${API}/post/publish/content/init/`, { method: 'POST', headers: auth, body: JSON.stringify(body) }, 'TikTok publish init');
    const publishId = init?.data?.data?.publish_id;
    const initError = init?.data?.error?.code;
    if (!init || init.status >= 300 || (initError && initError !== 'ok') || !publishId) return tiktokFailure(init);

    // TikTok pulls the picture, then either posts it or puts it in the inbox.
    const until = Date.now() + (this.cfg.waitMs ?? 90_000);
    for (;;) {
      const s = await this.call(`${API}/post/publish/status/fetch/`, { method: 'POST', headers: auth, body: JSON.stringify({ publish_id: publishId }) }, 'TikTok publish status');
      const state = s?.data?.data?.status;
      if (state === 'PUBLISH_COMPLETE') {
        const postId = s?.data?.data?.publicaly_available_post_id?.[0];
        return { ok: true, id: String(publishId), permalink: postId && input.username ? `https://www.tiktok.com/@${input.username}/photo/${postId}` : undefined, detail: input.mode === 'DIRECT' ? undefined : 'Finished in the TikTok app' };
      }
      if (state === 'SEND_TO_USER_INBOX') return { ok: true, id: String(publishId), detail: 'In the TikTok inbox: open TikTok to finish and publish it' };
      if (state === 'FAILED') {
        const reason = String(s?.data?.data?.fail_reason ?? 'unknown');
        return { ok: false, error: `TikTok could not post it: ${HINTS[reason] ?? reason}`, transient: TRANSIENT.has(reason) };
      }
      if (Date.now() >= until) return { ok: true, id: String(publishId), detail: 'TikTok was still processing it; check the TikTok app' };
      await sleep(this.cfg.pollMs ?? 3_000);
    }
  }
}
