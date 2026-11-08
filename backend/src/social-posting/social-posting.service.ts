import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PageContentService } from '../page-content/page-content.service';
import { StorefrontService } from '../storefront/storefront.service';
import { paginate } from '../common/pagination.util';
import { isTransientFacebookError } from '../facebook-comments/facebook-comments';
import { shopFacts } from '../facebook-comments/shop-facts';
import { PostableProduct, buildCaption, cleanTimes, dueSlots, isPostable, nairobiParts, nextSlot, pickProduct } from './social-post';

const TICK_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 4 * 60_000;
/** A post stuck PENDING (the backend stopped mid-post) is looked at again after this long. */
const STUCK_AFTER_MS = 10 * 60_000;
const CHANNEL = 'FACEBOOK';

/** Switch for the whole engine, whatever the portal says. `SOCIAL_POSTING=false` stops every post at once. */
export const socialPostingAllowed = () => (process.env.SOCIAL_POSTING || 'true') !== 'false';

type Settings = { facebookEnabled: boolean; times: string[]; cooldownDays: number; updatedBy: string };
const DEFAULTS: Settings = { facebookEnabled: false, times: ['09:00', '13:00', '19:00'], cooldownDays: 30, updatedBy: 'system' };

/**
 * The marketing engine: at the set times each day it picks a product that is in stock with a photo and has not been posted lately,
 * writes the post (photo, name, price, sizes in stock, a tagged link to the product, WhatsApp and the shop's location) and
 * publishes it to the Facebook Page. Visits from these links show as Facebook in Insights, and the comments they draw are answered
 * by the comment replies.
 *
 * Fully automatic, so the guards matter: only products a shopper can buy right now, never the same product within the cooldown, no
 * more than the number of times set (six at most), a slot that was missed by more than 90 minutes is dropped rather than posted late,
 * and it is off until staff turn it on. SOCIAL_POSTING=false overrides everything. A bad post can be removed from the screen.
 */
@Injectable()
export class SocialPostingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SocialPostingService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storefront: StorefrontService,
    private readonly pages: PageContentService,
  ) {}

  private get pageId() { return process.env.FACEBOOK_PAGE_ID || ''; }
  private get token() { return process.env.FACEBOOK_PAGE_ACCESS_TOKEN || ''; }
  private get version() { return process.env.WHATSAPP_API_VERSION || 'v21.0'; }
  get configured() { return Boolean(this.pageId && this.token); }

  onApplicationBootstrap() {
    if (!socialPostingAllowed() || !this.configured) return;
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
    return row ? { facebookEnabled: row.facebookEnabled, times: cleanTimes(row.times), cooldownDays: row.cooldownDays, updatedBy: row.updatedBy } : DEFAULTS;
  }

  async updateSettings(patch: Partial<Settings>, updatedBy: string) {
    const current = await this.getSettings();
    const times = patch.times ? cleanTimes(patch.times) : current.times;
    const next = { facebookEnabled: patch.facebookEnabled ?? current.facebookEnabled, times, cooldownDays: patch.cooldownDays ?? current.cooldownDays, updatedBy };
    await this.prisma.socialSetting.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', ...next }, update: next });
    return this.status();
  }

  // --- Facebook ---------------------------------------------------------------------------------------------------------

  private async graph(path: string, body: unknown, method: 'POST' | 'DELETE' = 'POST') {
    try {
      const response = await fetch(`https://graph.facebook.com/${this.version}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(45_000),
      });
      return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
    } catch (error) {
      this.logger.warn(`Facebook ${path} failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private failure(r: { status: number; data: any } | null) {
    if (!r) return { ok: false as const, error: 'Facebook could not be reached', transient: true };
    const e = r.data?.error;
    const code = typeof e?.code === 'number' ? e.code : undefined;
    return { ok: false as const, error: [code, e?.error_user_msg || e?.message || `HTTP ${r.status}`].filter((x) => x !== undefined).join(': ').slice(0, 400), transient: isTransientFacebookError(code, r.status) };
  }

  /** A photo post on the Page: the product's picture with the text as its caption. */
  private async publishPhoto(imageUrl: string, caption: string): Promise<{ ok: true; id: string } | { ok: false; error: string; transient: boolean }> {
    const r = await this.graph(`${this.pageId}/photos`, { url: imageUrl, caption, published: true });
    const id = r?.data?.post_id || r?.data?.id;
    return r && r.status < 300 && id ? { ok: true, id: String(id) } : this.failure(r);
  }

  // --- choosing ---------------------------------------------------------------------------------------------------------

  private async candidates(): Promise<PostableProduct[]> {
    const products = await this.storefront.postableProducts();
    return products.filter(isPostable) as PostableProduct[];
  }

  private async lastPosted(): Promise<{ map: Map<string, Date>; lastProductId: string | null }> {
    const rows = await this.prisma.socialPost.groupBy({ by: ['productId'], where: { channel: CHANNEL, status: 'POSTED', productId: { not: null } }, _max: { postedAt: true } });
    const map = new Map<string, Date>();
    for (const r of rows) if (r.productId && r._max.postedAt) map.set(r.productId, r._max.postedAt);
    const last = await this.prisma.socialPost.findFirst({ where: { channel: CHANNEL, status: 'POSTED' }, orderBy: { postedAt: 'desc' }, select: { productId: true } });
    return { map, lastProductId: last?.productId ?? null };
  }

  private async choose(now: Date, cooldownDays: number, productId?: string) {
    const candidates = await this.candidates();
    if (productId) return candidates.find((p) => p.id === productId) ?? null;
    const { map, lastProductId } = await this.lastPosted();
    const lastBrand = candidates.find((p) => p.id === lastProductId)?.brand ?? null;
    return pickProduct({ candidates, lastPosted: map, lastBrand, now, cooldownDays });
  }

  private async captionFor(product: PostableProduct, now: Date) {
    const facts = await shopFacts(this.pages, this.pageId, this.logger);
    return buildCaption(product, { origin: facts.site, whatsapp: facts.whatsapp, location: facts.location }, nairobiParts(now).day);
  }

  /** What the next post would be, without posting it. */
  async preview(productId?: string) {
    const now = new Date();
    const settings = await this.getSettings();
    const product = await this.choose(now, settings.cooldownDays, productId);
    if (!product) return { product: null, caption: null };
    return { product: { id: product.id, name: product.name, slug: product.slug, imageUrl: product.imageUrl, brand: product.brand }, caption: await this.captionFor(product, now) };
  }

  // --- posting ----------------------------------------------------------------------------------------------------------

  /** Posts for one slot. The slot key is unique, so the other backend slot (or a repeated check) cannot post it twice. */
  private async runSlot(slotKey: string, scheduledFor: Date | null, triggeredBy: string, productId?: string) {
    let row;
    try {
      row = await this.prisma.socialPost.create({ data: { channel: CHANNEL, slotKey, scheduledFor, triggeredBy, status: 'PENDING' } });
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') return null;
      throw error;
    }
    return this.publish(row.id, productId);
  }

  private async publish(id: string, productId?: string) {
    const row = await this.prisma.socialPost.findUniqueOrThrow({ where: { id } });
    const now = new Date();
    const attempts = row.attempts + 1;

    let { productId: pid, productName, productSlug, caption, imageUrl } = row;
    if (!pid || !caption || !imageUrl) {
      const settings = await this.getSettings();
      const product = await this.choose(now, settings.cooldownDays, productId);
      if (!product) {
        return this.prisma.socialPost.update({ where: { id }, data: { status: 'SKIPPED', detail: productId ? 'That product cannot be posted now (not in stock, no photo or no price)' : 'No product in stock with a photo that has not been posted recently', attempts } });
      }
      pid = product.id; productName = product.name; productSlug = product.slug; imageUrl = product.imageUrl; caption = await this.captionFor(product, now);
      await this.prisma.socialPost.update({ where: { id }, data: { productId: pid, productName, productSlug, imageUrl, caption } });
    }

    const posted = await this.publishPhoto(imageUrl!, caption!);
    if (posted.ok) {
      return this.prisma.socialPost.update({ where: { id }, data: { status: 'POSTED', externalId: posted.id, postedAt: new Date(), attempts, detail: null } });
    }
    const retry = posted.transient && attempts < MAX_ATTEMPTS;
    if (!retry) this.logger.warn(`Post of ${productName} failed: ${posted.error}`);
    return this.prisma.socialPost.update({ where: { id }, data: { status: retry ? 'RETRY' : 'FAILED', detail: posted.error, attempts } });
  }

  /** The scheduled check: posts any slot that is due, and tries again the posts Facebook could not take. */
  async tick(now: Date = new Date()): Promise<{ posted: number; skipped: number; failed: number }> {
    const result = { posted: 0, skipped: 0, failed: 0 };
    if (!socialPostingAllowed() || !this.configured) return result;
    const settings = await this.getSettings();
    if (!settings.facebookEnabled) return result;

    const tally = (r: { status: string } | null) => {
      if (!r) return;
      if (r.status === 'POSTED') result.posted += 1;
      else if (r.status === 'SKIPPED') result.skipped += 1;
      else if (r.status === 'FAILED') result.failed += 1;
    };

    // Retries first: a post that Facebook could not take a few minutes ago, while its slot is still fresh.
    const due = await this.prisma.socialPost.findMany({
      where: {
        channel: CHANNEL, attempts: { lt: MAX_ATTEMPTS },
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

    for (const slot of dueSlots(now, settings.times)) tally(await this.runSlot(slot.slotKey, slot.scheduledFor, 'schedule'));
    if (result.posted || result.failed) this.logger.log(`Social posting: ${result.posted} posted, ${result.skipped} skipped, ${result.failed} failed.`);
    return result;
  }

  /** A post started by staff, now. Works whether or not the schedule is on. */
  async postNow(by: string, productId?: string) {
    if (!this.configured) return { status: 'FAILED', detail: 'The Facebook Page is not set up on the server (FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN).' };
    if (!socialPostingAllowed()) return { status: 'FAILED', detail: 'Posting is switched off on the server (SOCIAL_POSTING=false).' };
    return this.runSlot(`manual@${Date.now()}`, null, by, productId);
  }

  /** Takes a post down from the Page. */
  async remove(id: string) {
    const row = await this.prisma.socialPost.findUnique({ where: { id } });
    if (!row || row.status !== 'POSTED' || !row.externalId) return { removed: false, detail: 'That post is not on the Page' };
    const r = await this.graph(row.externalId, null, 'DELETE');
    if (!r || r.status >= 300 || r.data?.success === false) return { removed: false, detail: this.failure(r).error };
    await this.prisma.socialPost.update({ where: { id }, data: { status: 'REMOVED', detail: 'Removed from the Page' } });
    return { removed: true, detail: null };
  }

  // --- for the portal ---------------------------------------------------------------------------------------------------

  async status() {
    const now = new Date();
    const settings = await this.getSettings();
    const today = nairobiParts(now).day;
    const [counts, todays] = await Promise.all([
      this.prisma.socialPost.groupBy({ by: ['status'], where: { channel: CHANNEL }, _count: true }),
      this.prisma.socialPost.findMany({ where: { channel: CHANNEL, slotKey: { startsWith: today } }, select: { slotKey: true, status: true } }),
    ]);
    const by = Object.fromEntries(counts.map((c) => [c.status, c._count]));
    return {
      allowed: socialPostingAllowed(),
      configured: this.configured,
      facebookEnabled: settings.facebookEnabled,
      times: settings.times,
      cooldownDays: settings.cooldownDays,
      updatedBy: settings.updatedBy,
      nextPostAt: settings.facebookEnabled && this.configured && socialPostingAllowed() ? nextSlot(now, settings.times) : null,
      today: todays,
      posted: by.POSTED ?? 0, failed: by.FAILED ?? 0, skipped: by.SKIPPED ?? 0, removed: by.REMOVED ?? 0,
    };
  }

  list(query: { skip?: number; take?: number }) {
    return paginate(
      (args) => this.prisma.socialPost.findMany({ where: { channel: CHANNEL }, orderBy: { createdAt: 'desc' }, ...args }),
      () => this.prisma.socialPost.count({ where: { channel: CHANNEL } }),
      query.skip,
      query.take,
    );
  }
}
