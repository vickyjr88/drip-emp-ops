import { oauth1Header, xFailure } from '../social-posting/channels/x-client';
import { CredentialsReader } from './credentials.service';

/**
 * "Test connection" for a group of credentials: one harmless read against the platform, reported in words. Secrets never appear in the answer, and
 * the platform's own error text is shown (it says what is wrong) after being cut to a sensible length.
 */

export type TestResult = { ok: boolean; message: string };

type Fetch = typeof fetch;
const timeout = () => AbortSignal.timeout(20_000);
const version = () => process.env.WHATSAPP_API_VERSION || 'v21.0';

async function json(f: Fetch, url: string, init: RequestInit): Promise<{ status: number; data: any } | null> {
  try {
    const r = await f(url, { ...init, signal: timeout() });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  } catch {
    return null;
  }
}

const metaError = (r: { status: number; data: any } | null) => {
  if (!r) return 'Could not reach the service.';
  const e = r.data?.error;
  return String(e?.error_user_msg || e?.message || `HTTP ${r.status}`).slice(0, 300);
};

/** The permissions a Meta token carries, or null when Meta will not say. */
async function scopesOf(f: Fetch, token: string): Promise<string[] | null> {
  const r = await json(f, `https://graph.facebook.com/${version()}/debug_token?${new URLSearchParams({ input_token: token, access_token: token })}`, { method: 'GET' });
  const scopes = r?.data?.data?.scopes;
  return r && r.status < 300 && Array.isArray(scopes) ? scopes : null;
}

const missing = (have: string[] | null, need: string[]) => (have ? need.filter((s) => !have.includes(s)) : []);
const fb = (token: string): RequestInit => ({ method: 'GET', headers: { Authorization: `Bearer ${token}` } });

export async function testGroup(group: string, creds: CredentialsReader, f: Fetch = fetch): Promise<TestResult> {
  switch (group) {
    case 'facebook': {
      const page = creds.get('FACEBOOK_PAGE_ID'); const token = creds.get('FACEBOOK_PAGE_ACCESS_TOKEN');
      if (!page || !token) return { ok: false, message: 'Enter the Page ID and the Page access token first.' };
      const r = await json(f, `https://graph.facebook.com/${version()}/${encodeURIComponent(page)}?fields=name`, fb(token));
      if (!r || r.status >= 300 || !r.data?.name) return { ok: false, message: `Facebook refused it: ${metaError(r)}` };
      const lacks = missing(await scopesOf(f, token), ['pages_manage_posts', 'pages_read_engagement', 'pages_messaging']);
      return lacks.length
        ? { ok: false, message: `Connected to the Page “${r.data.name}”, but the token lacks: ${lacks.join(', ')}.` }
        : { ok: true, message: `Connected to the Page “${r.data.name}”. The token can post and reply.` };
    }
    case 'instagram': {
      const token = creds.get('INSTAGRAM_ACCESS_TOKEN') || creds.get('FACEBOOK_PAGE_ACCESS_TOKEN');
      const direct = creds.get('INSTAGRAM_BUSINESS_ACCOUNT_ID'); const page = creds.get('FACEBOOK_PAGE_ID');
      if (!token || (!direct && !page)) return { ok: false, message: 'Instagram needs the Facebook Page connection (or its own token and account ID) first.' };
      let username: string | null = null;
      if (direct) {
        const r = await json(f, `https://graph.facebook.com/${version()}/${encodeURIComponent(direct)}?fields=username`, fb(token));
        if (!r || r.status >= 300) return { ok: false, message: `Instagram refused it: ${metaError(r)}` };
        username = r.data?.username ?? null;
      } else {
        const r = await json(f, `https://graph.facebook.com/${version()}/${encodeURIComponent(page)}?fields=${encodeURIComponent('instagram_business_account{id,username}')}`, fb(token));
        if (!r || r.status >= 300) return { ok: false, message: `Facebook refused it: ${metaError(r)}` };
        if (!r.data?.instagram_business_account?.id) return { ok: false, message: 'No Instagram Professional account is linked to the Facebook Page.' };
        username = r.data.instagram_business_account.username ?? null;
      }
      const lacks = missing(await scopesOf(f, token), ['instagram_basic', 'instagram_content_publish']);
      return lacks.length
        ? { ok: false, message: `Found ${username ? `@${username}` : 'the account'}, but the token lacks: ${lacks.join(', ')}.` }
        : { ok: true, message: `Posts to ${username ? `@${username}` : 'the linked Instagram account'}. The token can publish.` };
    }
    case 'threads': {
      const token = creds.get('THREADS_ACCESS_TOKEN');
      if (!token) return { ok: false, message: 'Enter the Threads access token first.' };
      const r = await json(f, `https://graph.threads.net/v1.0/me?${new URLSearchParams({ fields: 'id,username', access_token: token })}`, { method: 'GET' });
      if (!r || r.status >= 300 || !r.data?.id) return { ok: false, message: `Threads refused it: ${metaError(r)}` };
      return { ok: true, message: `Connected to Threads as @${r.data.username ?? r.data.id}.` };
    }
    case 'x': {
      const c = { apiKey: creds.get('X_API_KEY'), apiSecret: creds.get('X_API_SECRET'), accessToken: creds.get('X_ACCESS_TOKEN'), accessTokenSecret: creds.get('X_ACCESS_TOKEN_SECRET') };
      if (!c.apiKey || !c.apiSecret || !c.accessToken || !c.accessTokenSecret) return { ok: false, message: 'Enter all four X keys first.' };
      const url = 'https://api.x.com/2/users/me';
      const r = await json(f, url, { method: 'GET', headers: { Authorization: oauth1Header('GET', url, c) } });
      if (!r || r.status >= 300 || !r.data?.data?.username) return { ok: false, message: xFailure(r).error };
      return { ok: true, message: `Connected to X as @${r.data.data.username}. (X may charge a fraction of a cent for this check.)` };
    }
    case 'tiktok': {
      const key = creds.get('TIKTOK_CLIENT_KEY'); const secret = creds.get('TIKTOK_CLIENT_SECRET');
      if (!key || !secret) return { ok: false, message: 'Enter the client key and the client secret first.' };
      const r = await json(f, 'https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_key: key, client_secret: secret, grant_type: 'client_credentials' }).toString(),
      });
      if (!r || r.status >= 300 || !r.data?.access_token) return { ok: false, message: `TikTok refused the app keys: ${String(r?.data?.error_description || r?.data?.error?.message || r?.data?.error || (r ? `HTTP ${r.status}` : 'could not be reached')).slice(0, 300)}` };
      return { ok: true, message: 'TikTok accepts the app keys. Connect the account on the Social Posting screen.' };
    }
    default:
      return { ok: false, message: 'There is no check for this group.' };
  }
}
