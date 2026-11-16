import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PageContentService } from '../page-content/page-content.service';
import { StorefrontService } from '../storefront/storefront.service';
import { shopFacts } from '../facebook-comments/shop-facts';
import { PostableProduct, isPostable, nairobiParts } from '../social-posting/social-post';
import { fetchPhoto, renderStatusImage } from '../social-posting/status-image';
import { affiliateKitSize, affiliateLink, buildAffiliateCaption, isAffiliate, pickDaily } from './share-kit';

const CACHE_MS = 60_000;

export type ShareCustomer = { id: string; firstName?: string; priceTier?: string | null; referralCode?: string | null };

/**
 * What an affiliate shares: a few products each day with a ready 9:16 picture and the text and link that go with it. Like the shop's own WhatsApp
 * Status kit, nothing is posted for them (WhatsApp has no way to do that); they share from their phone in a few seconds. Unlike it, nothing is stored:
 * the day's products are worked out from the date, so every affiliate sees the same kit and there is nothing to keep per person.
 */
@Injectable()
export class ShareKitService {
  private readonly logger = new Logger(ShareKitService.name);
  private cache: { at: number; products: PostableProduct[] } | null = null;

  constructor(
    private readonly storefront: StorefrontService,
    private readonly pages: PageContentService,
  ) {}

  private async candidates(): Promise<PostableProduct[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.products;
    const products = (await this.storefront.postableProducts()).filter(isPostable) as PostableProduct[];
    this.cache = { at: Date.now(), products };
    return products;
  }

  private async facts() {
    return shopFacts(this.pages, process.env.FACEBOOK_PAGE_ID || '', this.logger);
  }

  private requireAffiliate(customer: ShareCustomer) {
    if (!isAffiliate(customer)) throw new ForbiddenException('The share kit is for affiliates. Apply under Affiliate program in your account.');
    return customer as { id: string; priceTier: string; referralCode: string };
  }

  /** Today's kit for an affiliate: each product with its caption (carrying their link) and the path to its picture. */
  async today(customer: ShareCustomer, now = new Date()) {
    const affiliate = this.requireAffiliate(customer);
    const { site } = await this.facts();
    const day = nairobiParts(now).day;
    const picks = pickDaily(await this.candidates(), day, affiliateKitSize(), now);
    return {
      day,
      items: picks.map((p) => {
        const link = affiliateLink(site, p.slug, affiliate.referralCode, 'whatsapp');
        return {
          slug: p.slug, name: p.name, brand: p.brand, priceFrom: p.priceFrom, priceTo: p.priceTo, offer: p.offer,
          sizes: p.sizesInStock, link, caption: buildAffiliateCaption(p, link),
        };
      }),
    };
  }

  /** The 1080x1920 picture for one product (any product that is in stock with a photo, not only today's), for an affiliate. */
  async picture(customer: ShareCustomer, slug: string): Promise<Buffer> {
    this.requireAffiliate(customer);
    const product = (await this.candidates()).find((p) => p.slug === slug);
    if (!product) throw new NotFoundException('That product is not in stock with a photo, so there is no picture for it.');
    const { whatsapp, site } = await this.facts();
    return renderStatusImage(product, await fetchPhoto(product.imageUrl), { whatsapp, site, mode: 'affiliate' });
  }
}
