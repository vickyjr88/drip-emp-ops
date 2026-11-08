import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PageContentService } from '../page-content/page-content.service';
import { StorefrontService } from '../storefront/storefront.service';
import { shopFacts } from '../facebook-comments/shop-facts';
import { PostableProduct, buildStatusCaption, isPostable, nairobiParts, pickProduct } from './social-post';
import { fetchPhoto, renderStatusImage } from './status-image';

const CHANNEL = 'STATUS';
/** A Status disappears after a day, so a product may come round again sooner than on a feed. */
const MAX_COOLDOWN_DAYS = 14;
const CACHE_MS = 60_000;

export const statusKitSize = () => Math.min(8, Math.max(1, Number(process.env.STATUS_KIT_COUNT || 3) || 3));

/**
 * WhatsApp has no way to post a Status automatically, so this prepares it: each day a few products are chosen the same way the Page
 * posts are (in stock, with a photo, not shown lately) and for each one a ready 9:16 picture and its text are made. Staff open the
 * "WhatsApp Status" screen on their phone, share each picture straight into WhatsApp > My status, and mark it posted, which moves
 * that product to the back of the line. The day's kit is made once and stays the same until the next day.
 */
@Injectable()
export class StatusKitService {
  private readonly logger = new Logger(StatusKitService.name);
  private cache: { at: number; products: PostableProduct[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storefront: StorefrontService,
    private readonly pages: PageContentService,
  ) {}

  private async candidates(fresh = false): Promise<PostableProduct[]> {
    if (!fresh && this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.products;
    const products = (await this.storefront.postableProducts()).filter(isPostable) as PostableProduct[];
    this.cache = { at: Date.now(), products };
    return products;
  }

  private async lastPosted(): Promise<Map<string, Date>> {
    const rows = await this.prisma.socialPost.groupBy({ by: ['productId'], where: { channel: CHANNEL, status: 'POSTED', productId: { not: null } }, _max: { postedAt: true } });
    const map = new Map<string, Date>();
    for (const r of rows) if (r.productId && r._max.postedAt) map.set(r.productId, r._max.postedAt);
    return map;
  }

  private async context() {
    const facts = await shopFacts(this.pages, process.env.FACEBOOK_PAGE_ID || '', this.logger);
    return { facts, ctx: { origin: facts.site, whatsapp: facts.whatsapp, location: facts.location } };
  }

  /** The next product, never one already in today's kit. */
  private async choose(exclude: Set<string>): Promise<PostableProduct | null> {
    const now = new Date();
    const settings = await this.prisma.socialSetting.findUnique({ where: { id: 'singleton' } });
    const cooldown = Math.min(settings?.cooldownDays ?? 30, MAX_COOLDOWN_DAYS);
    const candidates = (await this.candidates(true)).filter((p) => !exclude.has(p.id));
    return pickProduct({ candidates, lastPosted: await this.lastPosted(), lastBrand: null, now, cooldownDays: cooldown });
  }

  /** Today's kit, made on first use. Each item carries its text as it reads now, so a price changed since the morning is not stale. */
  async today(by = 'system') {
    const day = nairobiParts(new Date()).day;
    let rows = await this.prisma.socialPost.findMany({ where: { channel: CHANNEL, slotKey: { startsWith: `${day}#` } }, orderBy: { slotKey: 'asc' } });
    const wanted = statusKitSize();
    if (rows.length < wanted) {
      const taken = new Set(rows.map((r) => r.productId).filter((id): id is string => Boolean(id)));
      const { ctx } = await this.context();
      for (let n = 1; n <= wanted; n += 1) {
        const slotKey = `${day}#${n}`;
        if (rows.some((r) => r.slotKey === slotKey)) continue;
        const product = await this.choose(taken);
        if (!product) break;
        taken.add(product.id);
        try {
          await this.prisma.socialPost.create({
            data: {
              channel: CHANNEL, slotKey, status: 'READY', triggeredBy: by, productId: product.id, productName: product.name, productSlug: product.slug,
              imageUrl: product.imageUrl, caption: buildStatusCaption(product, ctx),
            },
          });
        } catch (error) {
          // Another request (or backend slot) made this one a moment ago: use theirs.
          if ((error as { code?: string }).code !== 'P2002') throw error;
        }
      }
      rows = await this.prisma.socialPost.findMany({ where: { channel: CHANNEL, slotKey: { startsWith: `${day}#` } }, orderBy: { slotKey: 'asc' } });
    }

    const live = new Map((await this.candidates()).map((p) => [p.id, p]));
    const { ctx } = await this.context();
    return rows.map((r) => {
      const product = r.productId ? live.get(r.productId) : undefined;
      return {
        id: r.id, status: r.status, productName: r.productName, productSlug: r.productSlug, postedAt: r.postedAt,
        // Gone from the shelf since the morning: still shown, but flagged, and its picture is no longer made.
        available: Boolean(product),
        caption: product ? buildStatusCaption(product, ctx) : r.caption,
      };
    });
  }

  private async row(id: string) {
    const row = await this.prisma.socialPost.findFirst({ where: { id, channel: CHANNEL } });
    if (!row) throw new NotFoundException('That Status is not in the kit');
    return row;
  }

  /** The 1080x1920 picture for one item. */
  async image(id: string): Promise<Buffer> {
    const row = await this.row(id);
    const product = (await this.candidates()).find((p) => p.id === row.productId);
    if (!product) throw new NotFoundException('That product is no longer in stock with a photo. Swap it for another.');
    const { facts } = await this.context();
    return renderStatusImage(product, await fetchPhoto(product.imageUrl), { whatsapp: facts.whatsapp, site: facts.site });
  }

  /** Replaces one item with the next product in line. */
  async swap(id: string) {
    const row = await this.row(id);
    if (row.status === 'POSTED') return this.today();
    const day = row.slotKey.split('#')[0];
    const others = await this.prisma.socialPost.findMany({ where: { channel: CHANNEL, slotKey: { startsWith: `${day}#` } }, select: { productId: true } });
    const product = await this.choose(new Set(others.map((o) => o.productId).filter((p): p is string => Boolean(p))));
    if (!product) return this.today();
    const { ctx } = await this.context();
    await this.prisma.socialPost.update({
      where: { id },
      data: { productId: product.id, productName: product.name, productSlug: product.slug, imageUrl: product.imageUrl, caption: buildStatusCaption(product, ctx), status: 'READY' },
    });
    return this.today();
  }

  /** Staff posted it on WhatsApp: it goes to the back of the line, and tomorrow's kit will not repeat it. */
  async markPosted(id: string, by: string) {
    const row = await this.row(id);
    if (row.status !== 'POSTED') await this.prisma.socialPost.update({ where: { id }, data: { status: 'POSTED', postedAt: new Date(), triggeredBy: by } });
    return this.today();
  }
}
