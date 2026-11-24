import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PageContentService } from '../page-content/page-content.service';
import { StorefrontService } from '../storefront/storefront.service';
import { paginate } from '../common/pagination.util';
import { isTransientFacebookError } from '../facebook-comments/facebook-comments';
import { shopFacts } from '../facebook-comments/shop-facts';
import { storefrontOrigin } from '../common/storefront-origin';
import {
  PostableProduct, buildCaption, buildInstagramCaption, buildThreadsCaption, buildTikTokCaption, buildXCaption, cleanTimes, dueSlots, isPostable, nairobiParts,
  nextSlot, pickProduct, splitTikTokCaption,
} from './social-post';
import { Call, Posted, sleep } from './channels/types';
import { InstagramClient } from './channels/instagram-client';
import { TikTokClient, TikTokMode, authorizeUrl, checkState, signState } from './channels/tiktok-client';
import { XClient, XCredentials } from './channels/x-client';
import { renditionFromUrl } from './social-image';

const TICK_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 4 * 60_000;
/** A post stuck PENDING (the backend stopped mid-post) is looked at again after this long. */
const STUCK_AFTER_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const THREADS_API = 'https://graph.threads.net/v1.0';
/** Renew a Threads token when it has less than this left (it lasts 60 days). */
const THREADS_RENEW_BEFORE_MS = 20 * DAY_MS;

export type Channel = 'FACEBOOK' | 'THREADS' | 'INSTAGRAM' | 'X' | 'TIKTOK';
export const CHANNELS: Channel[] = ['FACEBOOK', 'THREADS', 'INSTAGRAM', 'X', 'TIKTOK'];

/** Switch for the whole engine, whatever the portal says. `SOCIAL_POSTING=false` stops every post at once. */
export const socialPostingAllowed = () => (process.env.SOCIAL_POSTING || 'true') !== 'false';

type Settings = {
  facebookEnabled: boolean; threadsEnabled: boolean; instagramEnabled: boolean; xEnabled: boolean; tiktokEnabled: boolean; tiktokMode: TikTokMode;
  times: string[]; cooldownDays: number; updatedBy: string;
};
const DEFAULTS: Settings = { facebookEnabled: false, threadsEnabled: false, instagramEnabled: false, xEnabled: false, tiktokEnabled: false, tiktokMode: 'INBOX', times: ['09:00', '13:00', '19:00'], cooldownDays: 30, updatedBy: 'system' };

const hashOf = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * The marketing engine: at the set times each day it picks a product that is in stock with a photo and has not been posted lately,
 * writes the post (photo, name, price, sizes in stock, a tagged link to the product, WhatsApp and the shop's location) and
 * publishes it to the Facebook Page and to Threads, each switched on separately. Visits from these links show in Insights as
 * Facebook or Threads, and the comments on Facebook posts are answered by the comment replies.
 *
 * Fully automatic, so the guards matter: only products a shopper can buy right now, never the same product within the cooldown on a
 * channel, no more than the number of times set (six at most), a slot that was missed by more than 90 minutes is dropped rather
 * than posted late, and each channel is off until staff turn it on. SOCIAL_POSTING=false overrides everything. A bad post can be
 * removed from the screen.
 */
@Injectable()
export class SocialPostingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SocialPostingService.name);
  private timer?: NodeJS.Timeout;
  private lastRenewTry = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storefront: StorefrontService,
    private readonly pages: PageContentService,
  ) {}

  private get pageId() { return process.env.FACEBOOK_PAGE_ID || ''; }
  private get fbToken() { return process.env.FACEBOOK_PAGE_ACCESS_TOKEN || ''; }
  private get version() { return process.env.WHATSAPP_API_VERSION || 'v21.0'; }
  private get threadsEnvToken() { return process.env.THREADS_ACCESS_TOKEN || ''; }

  private get igToken() { return process.env.INSTAGRAM_ACCESS_TOKEN || this.fbToken; }
  private get igAccountId() { return process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || ''; }
  private get xCreds(): XCredentials | null {
    const c = { apiKey: process.env.X_API_KEY || '', apiSecret: process.env.X_API_SECRET || '', accessToken: process.env.X_ACCESS_TOKEN || '', accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET || '' };
    return c.apiKey && c.apiSecret && c.accessToken && c.accessTokenSecret ? c : null;
  }

  /** Where this API is on the internet: TikTok and Instagram fetch the pictures from here, and TikTok sends the sign-in back here. */
  private publicApi(): string {
    // PUBLIC_API_ORIGIN if set; else the address uploaded media is already served from (MEDIA_PUBLIC_BASE_URL, the API's public address in production).
    const set = (process.env.PUBLIC_API_ORIGIN || process.env.MEDIA_PUBLIC_BASE_URL || '').trim();
    if (set) return set.replace(/\/+$/, '');
    const site = storefrontOrigin();
    return /^https:\/\/(?!api\.)/.test(site) ? site.replace('https://', 'https://api.') : 'http://localhost:3101';
  }
  mediaUrl(postId: string) { return `${this.publicApi()}/social-posting/media/${postId}.jpg`; }

  /** The service's own HTTP call, shared by the channel clients. */
  private readonly send: Call = (url, init, label) => this.call(url, init, label);

  private xClient() { const creds = this.xCreds; return creds ? new XClient(creds, this.send) : null; }
  private igClient() {
    return this.igToken && (this.igAccountId || this.pageId)
      ? new InstagramClient({ version: this.version, token: this.igToken, pageId: this.pageId, accountId: this.igAccountId || undefined, waitMs: Number(process.env.INSTAGRAM_PUBLISH_WAIT_MS || 60_000), pollMs: Number(process.env.INSTAGRAM_POLL_MS || 3_000) }, this.send)
      : null;
  }
  private tiktok() {
    const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
    return clientKey && clientSecret
      ? new TikTokClient({ clientKey, clientSecret, redirectUri: `${this.publicApi()}/social-posting/connect/tiktok/callback`, waitMs: Number(process.env.TIKTOK_PUBLISH_WAIT_MS || 90_000), pollMs: Number(process.env.TIKTOK_POLL_MS || 3_000) }, this.send)
      : null;
  }
  private igCache: InstagramClient | null = null;
  private igShared() { return (this.igCache ??= this.igClient()); }

  /** Whether the server has what the channel needs from its settings. (TikTok also needs a sign-in: see connected().) */
  configured(channel: Channel) {
    switch (channel) {
      case 'FACEBOOK': return Boolean(this.pageId && this.fbToken);
      case 'THREADS': return Boolean(this.threadsEnvToken);
      case 'INSTAGRAM': return Boolean(this.igToken && (this.igAccountId || this.pageId));
      case 'X': return Boolean(this.xCreds);
      case 'TIKTOK': return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
    }
  }

  /** Whether the channel can post right now. For TikTok that means someone has signed in and the sign-in has not run out. */
  async connected(channel: Channel): Promise<boolean> {
    if (!this.configured(channel)) return false;
    if (channel !== 'TIKTOK') return true;
    const row = await this.prisma.socialCredential.findUnique({ where: { channel: 'TIKTOK' } });
    return Boolean(row?.refreshToken && (!row.refreshExpiresAt || row.refreshExpiresAt.getTime() > Date.now()));
  }

  onApplicationBootstrap() {
    if (!socialPostingAllowed() || !CHANNELS.some((c) => this.configured(c))) return;
    this.timer = setInterval(() => void this.safeTick(), TICK_MS);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async safeTick() {
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(`Social posting check failed: ${(error as Error).message}`);
    }
  }

  // --- settings ---------------------------------------------------------------------------------------------------------

  async getSettings(): Promise<Settings> {
    const row = await this.prisma.socialSetting.findUnique({ where: { id: 'singleton' } });
    return row
      ? {
          facebookEnabled: row.facebookEnabled, threadsEnabled: row.threadsEnabled, instagramEnabled: row.instagramEnabled, xEnabled: row.xEnabled, tiktokEnabled: row.tiktokEnabled,
          tiktokMode: row.tiktokMode === 'DIRECT' ? 'DIRECT' : 'INBOX', times: cleanTimes(row.times), cooldownDays: row.cooldownDays, updatedBy: row.updatedBy,
        }
      : DEFAULTS;
  }

  private enabled(settings: Settings, channel: Channel) {
    switch (channel) {
      case 'FACEBOOK': return settings.facebookEnabled;
      case 'THREADS': return settings.threadsEnabled;
      case 'INSTAGRAM': return settings.instagramEnabled;
      case 'X': return settings.xEnabled;
      case 'TIKTOK': return settings.tiktokEnabled;
    }
  }

  async updateSettings(patch: Partial<Settings>, updatedBy: string) {
    const current = await this.getSettings();
    const next = {
      facebookEnabled: patch.facebookEnabled ?? current.facebookEnabled,
      threadsEnabled: patch.threadsEnabled ?? current.threadsEnabled,
      instagramEnabled: patch.instagramEnabled ?? current.instagramEnabled,
      xEnabled: patch.xEnabled ?? current.xEnabled,
      tiktokEnabled: patch.tiktokEnabled ?? current.tiktokEnabled,
      tiktokMode: patch.tiktokMode ?? current.tiktokMode,
      times: patch.times ? cleanTimes(patch.times) : current.times,
      cooldownDays: patch.cooldownDays ?? current.cooldownDays,
      updatedBy,
    };
    await this.prisma.socialSetting.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', ...next }, update: next });
    return this.status();
  }

  // --- the channels' APIs -----------------------------------------------------------------------------------------------

  private failure(r: { status: number; data: any } | null) {
    if (!r) return { ok: false as const, error: 'The service could not be reached', transient: true };
    const e = r.data?.error;
    const code = typeof e?.code === 'number' ? e.code : undefined;
    return { ok: false as const, error: [code, e?.error_user_msg || e?.message || `HTTP ${r.status}`].filter((x) => x !== undefined).join(': ').slice(0, 400), transient: isTransientFacebookError(code, r.status) };
  }

  private async call(url: string, init: RequestInit, label: string) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
      return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
    } catch (error) {
      // The label, never the address: a Threads address carries the token.
      this.logger.warn(`${label} failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private fb(path: string, body: unknown, method: 'POST' | 'DELETE' = 'POST') {
    return this.call(`https://graph.facebook.com/${this.version}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.fbToken}`, 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }, `Facebook ${path}`);
  }

  /** A photo post on the Page: the product's picture with the text as its caption. */
  private async publishFacebook(imageUrl: string, caption: string): Promise<Posted> {
    const r = await this.fb(`${this.pageId}/photos`, { url: imageUrl, caption, published: true });
    const id = r?.data?.post_id || r?.data?.id;
    return r && r.status < 300 && id ? { ok: true, id: String(id), permalink: `https://www.facebook.com/${id}` } : this.failure(r);
  }

  // Threads ------------------------------------------------------------------------------------------------------------

  private async th(path: string, token: string, method: 'GET' | 'POST' | 'DELETE', body?: Record<string, string>) {
    const label = `Threads ${path.replace(/\/\d+/g, '/{id}')}`;
    if (method === 'POST') {
      return this.call(`${THREADS_API}/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, access_token: token }) }, label);
    }
    const query = new URLSearchParams({ ...(body ?? {}), access_token: token });
    return this.call(`${THREADS_API}/${path}?${query}`, { method }, label);
  }

  /**
   * The Threads login to use now. A Threads token lasts 60 days and can be renewed before it runs out, so the app keeps its own copy
   * (SocialCredential) and renews it; the token in the server's .env only starts it. A new token put in .env replaces the copy.
   */
  private async threadsLogin(): Promise<{ token: string; userId: string | null } | null> {
    const env = this.threadsEnvToken;
    if (!env) return null;
    const row = await this.prisma.socialCredential.findUnique({ where: { channel: 'THREADS' } });
    if (row && row.sourceHash === hashOf(env)) return { token: row.accessToken, userId: process.env.THREADS_USER_ID || row.userId };
    return { token: env, userId: process.env.THREADS_USER_ID || null };
  }

  /** Records the Threads token and the account it belongs to, and renews the token when it is within 20 days of ending. */
  async maintainThreadsLogin(now: Date = new Date()): Promise<void> {
    const login = await this.threadsLogin();
    if (!login) return;
    const env = this.threadsEnvToken;
    const row = await this.prisma.socialCredential.findUnique({ where: { channel: 'THREADS' } });
    const current = row && row.sourceHash === hashOf(env) ? row : null;

    let userId = login.userId;
    if (!userId) {
      const me = await this.th('me', login.token, 'GET', { fields: 'id,username' });
      userId = me && me.status < 300 && me.data?.id ? String(me.data.id) : null;
      if (!userId) {
        await this.saveLogin({ token: login.token, userId: null, expiresAt: current?.expiresAt ?? null, refreshedAt: current?.refreshedAt ?? null, error: this.failure(me).error }, env);
        return;
      }
    }

    const expiresAt = current?.expiresAt ?? null;
    const needsRenewal = !current || !expiresAt || expiresAt.getTime() - now.getTime() < THREADS_RENEW_BEFORE_MS;
    // Tried at most once an hour: the renewal is refused for a token under a day old, and a failure should not hammer the service.
    if (!needsRenewal || now.getTime() - this.lastRenewTry < 3_600_000) {
      if (!current) await this.saveLogin({ token: login.token, userId, expiresAt: null, refreshedAt: null, error: null }, env);
      return;
    }
    this.lastRenewTry = now.getTime();
    const r = await this.th('refresh_access_token', login.token, 'GET', { grant_type: 'th_refresh_token' });
    if (r && r.status < 300 && r.data?.access_token) {
      const seconds = Number(r.data.expires_in) || 60 * 86_400;
      await this.saveLogin({ token: String(r.data.access_token), userId, expiresAt: new Date(now.getTime() + seconds * 1000), refreshedAt: now, error: null }, env);
      this.logger.log(`Threads login renewed; good until ${new Date(now.getTime() + seconds * 1000).toISOString().slice(0, 10)}.`);
    } else {
      // Not fatal: a token that cannot be renewed (or has not aged a day yet) still works until it ends.
      await this.saveLogin({ token: login.token, userId, expiresAt, refreshedAt: current?.refreshedAt ?? null, error: `Renewal: ${this.failure(r).error}` }, env);
      if (expiresAt && expiresAt.getTime() - now.getTime() < 7 * DAY_MS) this.logger.warn(`The Threads login ends ${expiresAt.toISOString().slice(0, 10)} and could not be renewed: ${this.failure(r).error}`);
    }
  }

  private saveLogin(v: { token: string; userId: string | null; expiresAt: Date | null; refreshedAt: Date | null; error: string | null }, env: string) {
    const data = { accessToken: v.token, userId: v.userId, expiresAt: v.expiresAt, refreshedAt: v.refreshedAt, error: v.error, sourceHash: hashOf(env) };
    return this.prisma.socialCredential.upsert({ where: { channel: 'THREADS' }, create: { channel: 'THREADS', ...data }, update: data });
  }

  /** A photo post on Threads: make the item, wait until Threads has fetched the picture, then publish it. */
  private async publishThreads(imageUrl: string, text: string): Promise<Posted> {
    let login = await this.threadsLogin();
    if (!login) return { ok: false, error: 'THREADS_ACCESS_TOKEN is not set on the server', transient: false };
    if (!login.userId) {
      await this.maintainThreadsLogin();
      login = await this.threadsLogin();
    }
    if (!login?.userId) return { ok: false, error: 'The Threads account could not be identified from the token', transient: false };
    const { token, userId } = login;

    const made = await this.th(`${userId}/threads`, token, 'POST', { media_type: 'IMAGE', image_url: imageUrl, text });
    const creationId = made?.data?.id;
    if (!made || made.status >= 300 || !creationId) return this.failure(made);

    // Threads fetches the picture before the item can be published; its own advice is to wait about half a minute.
    const waitUntil = Date.now() + Number(process.env.THREADS_PUBLISH_WAIT_MS || 60_000);
    for (;;) {
      const s = await this.th(String(creationId), token, 'GET', { fields: 'status,error_message' });
      const state = s?.data?.status;
      if (state === 'FINISHED') break;
      if (state === 'ERROR' || state === 'EXPIRED') return { ok: false, error: `Threads could not use the picture: ${s?.data?.error_message || state}`, transient: false };
      if (Date.now() >= waitUntil) return { ok: false, error: 'Threads was still preparing the post; it will be tried again', transient: true };
      await sleep(Number(process.env.THREADS_POLL_MS || 3_000));
    }

    const published = await this.th(`${userId}/threads_publish`, token, 'POST', { creation_id: String(creationId) });
    const id = published?.data?.id;
    if (!published || published.status >= 300 || !id) return this.failure(published);
    const link = await this.th(String(id), token, 'GET', { fields: 'permalink' });
    return { ok: true, id: String(id), permalink: link?.data?.permalink ? String(link.data.permalink) : undefined };
  }

  // Instagram, X and TikTok ---------------------------------------------------------------------------------------------

  /** A product photo as a JPEG the platforms accept. Instagram and TikTok fetch it from the API (mediaFor); X is sent the bytes. */
  private mediaCache = new Map<string, Buffer>();
  async mediaFor(file: string): Promise<Buffer> {
    const id = /^([0-9a-f-]{36})\.jpg$/i.exec(file)?.[1];
    if (!id) throw new NotFoundException();
    const cached = this.mediaCache.get(id);
    if (cached) return cached;
    const row = await this.prisma.socialPost.findUnique({ where: { id }, select: { imageUrl: true } });
    if (!row?.imageUrl) throw new NotFoundException();
    let jpeg: Buffer;
    try { jpeg = await renditionFromUrl(row.imageUrl); } catch { throw new NotFoundException(); }
    if (this.mediaCache.size >= 30) this.mediaCache.delete(this.mediaCache.keys().next().value as string);
    this.mediaCache.set(id, jpeg);
    return jpeg;
  }

  private async publishInstagram(postId: string, caption: string): Promise<Posted> {
    const client = this.igShared();
    return client ? client.publish(this.mediaUrl(postId), caption) : { ok: false, error: 'Instagram is not set up on the server (the Facebook Page settings, with the Instagram permissions).', transient: false };
  }

  private async publishX(imageUrl: string, caption: string): Promise<Posted> {
    const client = this.xClient();
    if (!client) return { ok: false, error: 'X is not set up on the server (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET).', transient: false };
    let jpeg: Buffer;
    try { jpeg = await renditionFromUrl(imageUrl); } catch (error) { return { ok: false, error: `The picture could not be prepared: ${(error as Error).message}`, transient: true }; }
    return client.publish(jpeg, caption);
  }

  private async publishTikTok(postId: string, caption: string): Promise<Posted> {
    const client = this.tiktok();
    if (!client) return { ok: false, error: 'TikTok is not set up on the server (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET).', transient: false };
    const access = await this.tiktokAccess();
    if ('error' in access) return { ok: false, error: access.error, transient: false };
    const { title, description } = splitTikTokCaption(caption);
    return client.publishPhoto(access.token, { imageUrl: this.mediaUrl(postId), title, description, mode: (await this.getSettings()).tiktokMode, username: access.username });
  }

  // TikTok's login: connected from the portal, kept and renewed here. Its refresh token changes on every use, so two backend slots
  // must never renew at once: whoever loses the race picks up what the winner saved.

  /** The address that starts the TikTok sign-in. The signed state is what lets the callback know a staff member began it. */
  tiktokConnectUrl(by: string): { url: string } | { error: string } {
    const client = this.tiktok();
    if (!client) return { error: 'TikTok is not set up on the server (TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET).' };
    return { url: authorizeUrl(process.env.TIKTOK_CLIENT_KEY!, `${this.publicApi()}/social-posting/connect/tiktok/callback`, signState(this.stateSecret(), by)) };
  }
  private stateSecret() { return process.env.JWT_SECRET || 'super-secret-key-change-me'; }

  /** What TikTok sends back after the sign-in: checks it, swaps the code for the login and keeps it. */
  async completeTikTokConnect(code: string | undefined, state: string | undefined): Promise<{ ok: true } | { ok: false; error: string }> {
    const checked = checkState(this.stateSecret(), state ?? '');
    if (!checked) return { ok: false, error: 'The TikTok sign-in expired or was not started here. Start it again from Social Posting.' };
    const client = this.tiktok();
    if (!client) return { ok: false, error: 'TikTok is not set up on the server.' };
    if (!code) return { ok: false, error: 'TikTok did not give a sign-in code.' };
    const got = await client.exchangeCode(code);
    if (!got.ok) return { ok: false, error: got.error };
    const name = await client.displayName(got.tokens.accessToken).catch(() => null);
    const data = { accessToken: got.tokens.accessToken, refreshToken: got.tokens.refreshToken, expiresAt: got.tokens.expiresAt, refreshExpiresAt: got.tokens.refreshExpiresAt, refreshedAt: new Date(), userId: got.tokens.openId || null, username: name, error: null, sourceHash: null };
    await this.prisma.socialCredential.upsert({ where: { channel: 'TIKTOK' }, create: { channel: 'TIKTOK', ...data }, update: data });
    this.logger.log(`TikTok connected${name ? ` as ${name}` : ''} by ${checked.by || 'staff'}.`);
    return { ok: true };
  }

  async disconnectTikTok(by: string) {
    await this.prisma.socialCredential.deleteMany({ where: { channel: 'TIKTOK' } });
    await this.updateSettings({ tiktokEnabled: false }, by);
    return this.status();
  }

  /** A TikTok access token that is good for at least five more minutes, renewing the login if it is not. */
  async tiktokAccess(now: Date = new Date()): Promise<{ token: string; username: string | null } | { error: string }> {
    const row = await this.prisma.socialCredential.findUnique({ where: { channel: 'TIKTOK' } });
    if (!row?.refreshToken) return { error: 'TikTok is not connected: connect it on the Social Posting screen.' };
    if (row.refreshExpiresAt && row.refreshExpiresAt.getTime() <= now.getTime()) return { error: 'The TikTok connection has run out: connect TikTok again.' };
    const fresh = (r: typeof row) => Boolean(r.expiresAt && r.expiresAt.getTime() - now.getTime() > 5 * 60_000);
    if (fresh(row)) return { token: row.accessToken, username: row.username };

    const client = this.tiktok();
    if (!client) return { error: 'TikTok is not set up on the server (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET).' };
    const renewed = await client.refresh(row.refreshToken, now);
    if (renewed.ok) {
      const saved = await this.prisma.socialCredential.updateMany({
        where: { channel: 'TIKTOK', refreshToken: row.refreshToken },
        data: { accessToken: renewed.tokens.accessToken, refreshToken: renewed.tokens.refreshToken, expiresAt: renewed.tokens.expiresAt, refreshExpiresAt: renewed.tokens.refreshExpiresAt, refreshedAt: now, error: null },
      });
      if (saved.count === 1) return { token: renewed.tokens.accessToken, username: row.username };
    }
    // The renewal failed or lost a race: the other backend slot may already have saved a newer login.
    const latest = await this.prisma.socialCredential.findUnique({ where: { channel: 'TIKTOK' } });
    if (latest?.refreshToken && latest.refreshToken !== row.refreshToken && fresh(latest)) return { token: latest.accessToken, username: latest.username };
    const why = renewed.ok ? 'The TikTok login could not be saved.' : renewed.permanent ? `${renewed.error} Connect TikTok again.` : renewed.error;
    await this.prisma.socialCredential.updateMany({ where: { channel: 'TIKTOK' }, data: { error: why.slice(0, 400) } });
    return { error: why };
  }

  private publishTo(channel: Channel, imageUrl: string, caption: string, postId: string): Promise<Posted> {
    switch (channel) {
      case 'FACEBOOK': return this.publishFacebook(imageUrl, caption);
      case 'THREADS': return this.publishThreads(imageUrl, caption);
      case 'INSTAGRAM': return this.publishInstagram(postId, caption);
      case 'X': return this.publishX(imageUrl, caption);
      case 'TIKTOK': return this.publishTikTok(postId, caption);
    }
  }

  // --- choosing ---------------------------------------------------------------------------------------------------------

  private async candidates(): Promise<PostableProduct[]> {
    const products = await this.storefront.postableProducts();
    return products.filter(isPostable) as PostableProduct[];
  }

  private async lastPosted(channel: Channel): Promise<{ map: Map<string, Date>; lastProductId: string | null }> {
    const rows = await this.prisma.socialPost.groupBy({ by: ['productId'], where: { channel, status: 'POSTED', productId: { not: null } }, _max: { postedAt: true } });
    const map = new Map<string, Date>();
    for (const r of rows) if (r.productId && r._max.postedAt) map.set(r.productId, r._max.postedAt);
    const last = await this.prisma.socialPost.findFirst({ where: { channel, status: 'POSTED' }, orderBy: { postedAt: 'desc' }, select: { productId: true } });
    return { map, lastProductId: last?.productId ?? null };
  }

  private async choose(channel: Channel, now: Date, cooldownDays: number, productId?: string) {
    const candidates = await this.candidates();
    if (productId) return candidates.find((p) => p.id === productId) ?? null;
    const { map, lastProductId } = await this.lastPosted(channel);
    const lastBrand = candidates.find((p) => p.id === lastProductId)?.brand ?? null;
    return pickProduct({ candidates, lastPosted: map, lastBrand, now, cooldownDays });
  }

  private async captionFor(channel: Channel, product: PostableProduct, now: Date) {
    const facts = await shopFacts(this.pages, this.pageId, this.logger);
    const ctx = { origin: facts.site, whatsapp: facts.whatsapp, location: facts.location };
    const day = nairobiParts(now).day;
    switch (channel) {
      case 'FACEBOOK': return buildCaption(product, ctx, day);
      case 'THREADS': return buildThreadsCaption(product, ctx, day);
      case 'INSTAGRAM': return buildInstagramCaption(product, ctx, day);
      case 'X': return buildXCaption(product, ctx, day);
      case 'TIKTOK': return buildTikTokCaption(product, ctx, day);
    }
  }

  /** What the next post would be on each channel, without posting it. */
  async preview(productId?: string) {
    const now = new Date();
    const settings = await this.getSettings();
    const out: Record<string, { product: { id: string; name: string; slug: string; imageUrl: string; brand: string | null } | null; caption: string | null }> = {};
    for (const channel of CHANNELS) {
      const product = await this.choose(channel, now, settings.cooldownDays, productId);
      out[channel] = product
        ? { product: { id: product.id, name: product.name, slug: product.slug, imageUrl: product.imageUrl, brand: product.brand }, caption: await this.captionFor(channel, product, now) }
        : { product: null, caption: null };
    }
    // The Facebook preview is also at the top level, as the screen first showed it.
    return { ...out.FACEBOOK, previews: out };
  }

  // --- posting ----------------------------------------------------------------------------------------------------------

  /** Posts for one slot. The slot key is unique per channel, so the other backend slot (or a repeated check) cannot post it twice. */
  private async runSlot(channel: Channel, slotKey: string, scheduledFor: Date | null, triggeredBy: string, productId?: string) {
    let row;
    try {
      row = await this.prisma.socialPost.create({ data: { channel, slotKey, scheduledFor, triggeredBy, status: 'PENDING' } });
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') return null;
      throw error;
    }
    return this.publish(row.id, productId);
  }

  private async publish(id: string, productId?: string) {
    const row = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } });
    const channel = row.channel as Channel;
    const now = new Date();
    const attempts = row.attempts + 1;

    let { productId: pid, productName, imageUrl, caption } = row;
    if (!pid || !caption || !imageUrl) {
      const settings = await this.getSettings();
      const product = await this.choose(channel, now, settings.cooldownDays, productId);
      if (!product) {
        return this.prisma.socialPost.update({ where: { id }, data: { status: 'SKIPPED', detail: productId ? 'That product cannot be posted now (not in stock, no photo or no price)' : 'No product in stock with a photo that has not been posted recently', attempts } });
      }
      pid = product.id; productName = product.name; imageUrl = product.imageUrl; caption = await this.captionFor(channel, product, now);
      await this.prisma.socialPost.update({ where: { id }, data: { productId: pid, productName, productSlug: product.slug, imageUrl, caption } });
    }

    const posted = await this.publishTo(channel, imageUrl!, caption!, id);
    if (posted.ok) {
      return this.prisma.socialPost.update({ where: { id }, data: { status: 'POSTED', externalId: posted.id, permalink: posted.permalink ?? null, postedAt: new Date(), attempts, detail: posted.detail ?? null } });
    }
    const retry = posted.transient && attempts < MAX_ATTEMPTS;
    if (!retry) this.logger.warn(`${channel} post of ${productName} failed: ${posted.error}`);
    return this.prisma.socialPost.update({ where: { id }, data: { status: retry ? 'RETRY' : 'FAILED', detail: posted.error, attempts } });
  }

  /** The scheduled check: posts any slot that is due on each channel that is on, and tries again the posts that could not be taken. */
  async tick(now: Date = new Date()): Promise<{ posted: number; skipped: number; failed: number }> {
    const result = { posted: 0, skipped: 0, failed: 0 };
    if (!socialPostingAllowed()) return result;
    const settings = await this.getSettings();
    const tally = (r: { status: string } | null) => {
      if (!r) return;
      if (r.status === 'POSTED') result.posted += 1;
      else if (r.status === 'SKIPPED') result.skipped += 1;
      else if (r.status === 'FAILED') result.failed += 1;
    };

    if (this.configured('THREADS')) await this.maintainThreadsLogin(now).catch((e) => this.logger.warn(`Threads login check failed: ${(e as Error).message}`));

    // TikTok's login is renewed ahead of time, so it is fresh when a post is due and does not lapse through disuse.
    if (await this.connected('TIKTOK')) {
      const row = await this.prisma.socialCredential.findUnique({ where: { channel: 'TIKTOK' } });
      if (!row?.expiresAt || row.expiresAt.getTime() - now.getTime() < 30 * 60_000) await this.tiktokAccess(now).catch((e) => this.logger.warn(`TikTok login check failed: ${(e as Error).message}`));
    }

    for (const channel of CHANNELS) {
      if (!(await this.connected(channel)) || !this.enabled(settings, channel)) continue;

      // Retries first: a post that could not be taken a few minutes ago, while its slot is still fresh.
      const due = await this.prisma.socialPost.findMany({
        where: {
          channel, attempts: { lt: MAX_ATTEMPTS },
          createdAt: { gte: new Date(now.getTime() - 2 * 3_600_000) },
          OR: [
            { status: 'RETRY', updatedAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) } },
            { status: 'PENDING', updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
          ],
        },
        take: 5,
      });
      for (const row of due) {
        const claimed = await this.prisma.socialPost.updateMany({ where: { id: row.id, status: row.status, updatedAt: row.updatedAt }, data: { status: 'PENDING' } });
        if (claimed.count === 1) tally(await this.publish(row.id));
      }

      for (const slot of dueSlots(now, settings.times)) tally(await this.runSlot(channel, slot.slotKey, slot.scheduledFor, 'schedule'));
    }
    if (result.posted || result.failed) this.logger.log(`Social posting: ${result.posted} posted, ${result.skipped} skipped, ${result.failed} failed.`);
    return result;
  }

  /** A post started by staff, now, on one channel. Works whether or not the schedule is on. */
  async postNow(by: string, productId?: string, channel: Channel = 'FACEBOOK') {
    if (!(await this.connected(channel))) {
      const why: Record<Channel, string> = {
        FACEBOOK: 'The Facebook Page is not set up on the server (FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN).',
        THREADS: 'Threads is not set up on the server (THREADS_ACCESS_TOKEN).',
        INSTAGRAM: 'Instagram is not set up on the server (the Facebook Page settings, with the Instagram permissions).',
        X: 'X is not set up on the server (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET).',
        TIKTOK: this.configured('TIKTOK') ? 'TikTok is not connected: connect it on this screen.' : 'TikTok is not set up on the server (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET).',
      };
      return { status: 'FAILED', detail: why[channel] };
    }
    if (!socialPostingAllowed()) return { status: 'FAILED', detail: 'Posting is switched off on the server (SOCIAL_POSTING=false).' };
    return this.runSlot(channel, `manual@${Date.now()}`, null, by, productId);
  }

  /** Takes a post down from its channel. */
  async remove(id: string) {
    const row = await this.prisma.socialPost.findUnique({ where: { id } });
    if (!row || row.status !== 'POSTED' || !row.externalId) return { removed: false, detail: 'That post is not live' };
    // Instagram and TikTok give other apps no way to delete a post; X does.
    if (row.channel === 'INSTAGRAM') return { removed: false, detail: 'Instagram does not let other apps delete a post: delete it in the Instagram app.' };
    if (row.channel === 'TIKTOK') return { removed: false, detail: 'TikTok does not let other apps delete a post: delete it in the TikTok app.' };
    if (row.channel === 'X') {
      const client = this.xClient();
      if (!client) return { removed: false, detail: 'X is not set up on the server' };
      const out = await client.remove(row.externalId);
      if (out.removed) await this.prisma.socialPost.update({ where: { id }, data: { status: 'REMOVED', detail: 'Taken down' } });
      return out;
    }
    let r: { status: number; data: any } | null;
    if (row.channel === 'FACEBOOK') {
      r = await this.fb(row.externalId, null, 'DELETE');
    } else {
      const login = await this.threadsLogin();
      if (!login) return { removed: false, detail: 'Threads is not set up on the server' };
      r = await this.th(row.externalId, login.token, 'DELETE');
    }
    if (!r || r.status >= 300 || r.data?.success === false) {
      const why = this.failure(r).error;
      return { removed: false, detail: row.channel === 'THREADS' ? `${why}. Delete it in the Threads app instead, then it can be ignored here.` : why };
    }
    await this.prisma.socialPost.update({ where: { id }, data: { status: 'REMOVED', detail: 'Taken down' } });
    return { removed: true, detail: null };
  }

  // --- for the portal ---------------------------------------------------------------------------------------------------

  /** The Instagram account the posts go to, for "Connected as ...". Looked up at most every ten minutes. */
  private async instagramInfo(): Promise<{ account: string | null; problem: string | null }> {
    const client = this.igShared();
    if (!client) return { account: null, problem: null };
    try {
      const found = await client.account();
      return 'error' in found ? { account: null, problem: found.error } : { account: found.username ? `@${found.username}` : found.id, problem: null };
    } catch {
      return { account: null, problem: null };
    }
  }

  async status() {
    const now = new Date();
    const settings = await this.getSettings();
    const today = nairobiParts(now).day;
    const [counts, todays, login, tiktokLogin] = await Promise.all([
      this.prisma.socialPost.groupBy({ by: ['channel', 'status'], _count: true }),
      this.prisma.socialPost.findMany({ where: { channel: { in: CHANNELS }, slotKey: { startsWith: today } }, select: { channel: true, slotKey: true, status: true } }),
      this.prisma.socialCredential.findUnique({ where: { channel: 'THREADS' } }),
      this.prisma.socialCredential.findUnique({ where: { channel: 'TIKTOK' } }),
    ]);
    const live = new Map<Channel, boolean>();
    for (const c of CHANNELS) live.set(c, await this.connected(c));
    const tally = (channel: Channel, status: string) => counts.find((c) => c.channel === channel && c.status === status)?._count ?? 0;
    const channel = (c: Channel) => ({
      configured: live.get(c) ?? false,
      enabled: this.enabled(settings, c),
      nextPostAt: this.enabled(settings, c) && live.get(c) && socialPostingAllowed() ? nextSlot(now, settings.times) : null,
      posted: tally(c, 'POSTED'), failed: tally(c, 'FAILED'), skipped: tally(c, 'SKIPPED'), removed: tally(c, 'REMOVED'),
    });
    const threadsLogin = login && login.sourceHash === hashOf(this.threadsEnvToken) ? login : null;
    const instagram = live.get('INSTAGRAM') ? await this.instagramInfo() : { account: null, problem: null };
    const total = (status: string) => ['FACEBOOK', 'THREADS'].reduce((n, c) => n + tally(c as Channel, status), 0);
    return {
      allowed: socialPostingAllowed(),
      times: settings.times,
      cooldownDays: settings.cooldownDays,
      updatedBy: settings.updatedBy,
      today: todays,
      facebook: channel('FACEBOOK'),
      threads: { ...channel('THREADS'), tokenExpiresAt: threadsLogin?.expiresAt ?? null, tokenError: threadsLogin?.error ?? null },
      instagram: { ...channel('INSTAGRAM'), ...instagram },
      x: channel('X'),
      tiktok: {
        ...channel('TIKTOK'),
        clientConfigured: this.configured('TIKTOK'),
        mode: settings.tiktokMode,
        account: tiktokLogin?.username ?? null,
        connectedAt: tiktokLogin?.refreshedAt ?? null,
        refreshExpiresAt: tiktokLogin?.refreshExpiresAt ?? null,
        error: tiktokLogin?.error ?? null,
      },
      // The first version of the screen read these; kept so it keeps working.
      configured: this.configured('FACEBOOK'), facebookEnabled: settings.facebookEnabled, threadsEnabled: settings.threadsEnabled,
      nextPostAt: channel('FACEBOOK').nextPostAt,
      posted: total('POSTED'), failed: total('FAILED'), skipped: total('SKIPPED'), removed: total('REMOVED'),
    };
  }

  list(query: { skip?: number; take?: number }) {
    return paginate(
      (args) => this.prisma.socialPost.findMany({ where: { channel: { in: CHANNELS } }, orderBy: { createdAt: 'desc' }, ...args }),
      () => this.prisma.socialPost.count({ where: { channel: { in: CHANNELS } } }),
      query.skip,
      query.take,
    );
  }
}
