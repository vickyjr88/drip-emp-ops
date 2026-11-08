import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PageContentService } from '../page-content/page-content.service';
import { StorefrontService } from '../storefront/storefront.service';
import { paginate } from '../common/pagination.util';
import { isTransientFacebookError } from '../facebook-comments/facebook-comments';
import { shopFacts } from '../facebook-comments/shop-facts';
import {
  PostableProduct, buildCaption, buildThreadsCaption, cleanTimes, dueSlots, isPostable, nairobiParts, nextSlot, pickProduct,
} from './social-post';

const TICK_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 4 * 60_000;
/** A post stuck PENDING (the backend stopped mid-post) is looked at again after this long. */
const STUCK_AFTER_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const THREADS_API = 'https://graph.threads.net/v1.0';
/** Renew a Threads token when it has less than this left (it lasts 60 days). */
const THREADS_RENEW_BEFORE_MS = 20 * DAY_MS;

export type Channel = 'FACEBOOK' | 'THREADS';
export const CHANNELS: Channel[] = ['FACEBOOK', 'THREADS'];

/** Switch for the whole engine, whatever the portal says. `SOCIAL_POSTING=false` stops every post at once. */
export const socialPostingAllowed = () => (process.env.SOCIAL_POSTING || 'true') !== 'false';

type Settings = { facebookEnabled: boolean; threadsEnabled: boolean; times: string[]; cooldownDays: number; updatedBy: string };
const DEFAULTS: Settings = { facebookEnabled: false, threadsEnabled: false, times: ['09:00', '13:00', '19:00'], cooldownDays: 30, updatedBy: 'system' };

type Posted = { ok: true; id: string; permalink?: string } | { ok: false; error: string; transient: boolean };

const hashOf = (text: string) => createHash('sha256').update(text).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  configured(channel: Channel) {
    return channel === 'FACEBOOK' ? Boolean(this.pageId && this.fbToken) : Boolean(this.threadsEnvToken);
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
      ? { facebookEnabled: row.facebookEnabled, threadsEnabled: row.threadsEnabled, times: cleanTimes(row.times), cooldownDays: row.cooldownDays, updatedBy: row.updatedBy }
      : DEFAULTS;
  }

  private enabled(settings: Settings, channel: Channel) {
    return channel === 'FACEBOOK' ? settings.facebookEnabled : settings.threadsEnabled;
  }

  async updateSettings(patch: Partial<Settings>, updatedBy: string) {
    const current = await this.getSettings();
    const next = {
      facebookEnabled: patch.facebookEnabled ?? current.facebookEnabled,
      threadsEnabled: patch.threadsEnabled ?? current.threadsEnabled,
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

  private publishTo(channel: Channel, imageUrl: string, caption: string): Promise<Posted> {
    return channel === 'FACEBOOK' ? this.publishFacebook(imageUrl, caption) : this.publishThreads(imageUrl, caption);
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
    return channel === 'FACEBOOK' ? buildCaption(product, ctx, day) : buildThreadsCaption(product, ctx, day);
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

    const posted = await this.publishTo(channel, imageUrl!, caption!);
    if (posted.ok) {
      return this.prisma.socialPost.update({ where: { id }, data: { status: 'POSTED', externalId: posted.id, permalink: posted.permalink ?? null, postedAt: new Date(), attempts, detail: null } });
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

    for (const channel of CHANNELS) {
      if (!this.configured(channel) || !this.enabled(settings, channel)) continue;

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
    if (!this.configured(channel)) {
      return { status: 'FAILED', detail: channel === 'FACEBOOK' ? 'The Facebook Page is not set up on the server (FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN).' : 'Threads is not set up on the server (THREADS_ACCESS_TOKEN).' };
    }
    if (!socialPostingAllowed()) return { status: 'FAILED', detail: 'Posting is switched off on the server (SOCIAL_POSTING=false).' };
    return this.runSlot(channel, `manual@${Date.now()}`, null, by, productId);
  }

  /** Takes a post down from its channel. */
  async remove(id: string) {
    const row = await this.prisma.socialPost.findUnique({ where: { id } });
    if (!row || row.status !== 'POSTED' || !row.externalId) return { removed: false, detail: 'That post is not live' };
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

  async status() {
    const now = new Date();
    const settings = await this.getSettings();
    const today = nairobiParts(now).day;
    const [counts, todays, login] = await Promise.all([
      this.prisma.socialPost.groupBy({ by: ['channel', 'status'], _count: true }),
      this.prisma.socialPost.findMany({ where: { channel: { in: CHANNELS }, slotKey: { startsWith: today } }, select: { channel: true, slotKey: true, status: true } }),
      this.prisma.socialCredential.findUnique({ where: { channel: 'THREADS' } }),
    ]);
    const tally = (channel: Channel, status: string) => counts.find((c) => c.channel === channel && c.status === status)?._count ?? 0;
    const channel = (c: Channel) => ({
      configured: this.configured(c),
      enabled: this.enabled(settings, c),
      nextPostAt: this.enabled(settings, c) && this.configured(c) && socialPostingAllowed() ? nextSlot(now, settings.times) : null,
      posted: tally(c, 'POSTED'), failed: tally(c, 'FAILED'), skipped: tally(c, 'SKIPPED'), removed: tally(c, 'REMOVED'),
    });
    const threadsLogin = login && login.sourceHash === hashOf(this.threadsEnvToken) ? login : null;
    return {
      allowed: socialPostingAllowed(),
      times: settings.times,
      cooldownDays: settings.cooldownDays,
      updatedBy: settings.updatedBy,
      today: todays,
      facebook: channel('FACEBOOK'),
      threads: { ...channel('THREADS'), tokenExpiresAt: threadsLogin?.expiresAt ?? null, tokenError: threadsLogin?.error ?? null },
      // The first version of the screen read these; kept so it keeps working.
      configured: this.configured('FACEBOOK'), facebookEnabled: settings.facebookEnabled, threadsEnabled: settings.threadsEnabled,
      nextPostAt: channel('FACEBOOK').nextPostAt,
      posted: tally('FACEBOOK', 'POSTED') + tally('THREADS', 'POSTED'), failed: tally('FACEBOOK', 'FAILED') + tally('THREADS', 'FAILED'),
      skipped: tally('FACEBOOK', 'SKIPPED') + tally('THREADS', 'SKIPPED'), removed: tally('FACEBOOK', 'REMOVED') + tally('THREADS', 'REMOVED'),
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
