import { createHash } from 'crypto';
import { PostableProduct, compactSizes, score } from '../social-posting/social-post';

/**
 * The affiliate share kit: which products, what they say, and the link that credits the affiliate. Pure, so it can be tested without a database.
 *
 * An affiliate is a reseller or wholesale customer who has a referral code (the same test the account page uses). Their link is the product's own
 * page with `?ref=<code>`, which the storefront keeps for 30 days and attaches to any order or WhatsApp lead that follows, so a sale is credited
 * even when it closes later in a chat. The utm tags say where the share was made, so Insights can count the visits by channel.
 */

export type ShareChannel = 'whatsapp' | 'facebook' | 'instagram' | 'tiktok' | 'x' | 'telegram' | 'link';
export const SHARE_CHANNELS: ShareChannel[] = ['whatsapp', 'facebook', 'instagram', 'tiktok', 'x', 'telegram', 'link'];

/** Products in each day's kit: 1 to 12 (AFFILIATE_KIT_COUNT), six by default. */
export function affiliateKitSize(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AFFILIATE_KIT_COUNT);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 6;
}

export function isAffiliate(customer: { priceTier?: string | null; referralCode?: string | null } | null | undefined): customer is { priceTier: string; referralCode: string } {
  return Boolean(customer && customer.priceTier && customer.priceTier !== 'RETAIL' && customer.referralCode);
}

/** A product page with the affiliate's code and a tag for where it was shared. */
export function affiliateLink(origin: string, slug: string, code: string, channel: ShareChannel = 'whatsapp'): string {
  return `${origin.replace(/\/+$/, '')}/shop/${slug}?ref=${encodeURIComponent(code)}&utm_source=${channel}&utm_medium=social&utm_campaign=affiliate`;
}

const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

/** The text that goes with a picture or a message: what it is, what it costs, what is in stock, and the link. */
export function buildAffiliateCaption(product: PostableProduct, link: string): string {
  const price = product.offer
    ? `🔥 ${kes(product.offer.price)} (was ${kes(product.offer.was)})`
    : product.priceFrom === product.priceTo || !product.priceTo ? `💰 ${kes(product.priceFrom)}` : `💰 From ${kes(product.priceFrom)}`;
  const sizes = compactSizes(product.sizesInStock);
  return [product.name, price, sizes ? `📏 ${sizes}` : null, '', '🛒 Order here:', link].filter((l) => l !== null).join('\n');
}

const rank = (day: string, id: string) => createHash('sha256').update(`${day}:${id}`).digest().readUInt32BE(0);

/**
 * Today's products. The best sellers' worth first (sizes to choose from, depth of stock, an offer, newness), a pool of twice the kit's size, then the
 * day's own order within it: the kit is different each day and the same for every affiliate on that day, so nothing needs to be stored per person.
 */
export function pickDaily(candidates: PostableProduct[], day: string, count: number, now: Date): PostableProduct[] {
  const pool = [...candidates].sort((a, b) => score(b, now) - score(a, now) || a.id.localeCompare(b.id)).slice(0, Math.max(count * 2, count));
  return pool.sort((a, b) => rank(day, a.id) - rank(day, b.id) || a.id.localeCompare(b.id)).slice(0, count);
}
