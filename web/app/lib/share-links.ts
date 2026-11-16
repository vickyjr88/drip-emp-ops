/**
 * Links for sharing a product, and the address each social channel needs to open its own share screen. Pure (no browser, no React), so it can be
 * tested, and used by the Share page for customers and affiliates alike.
 *
 * An affiliate's link carries their referral code (`?ref=`), which the storefront keeps and attaches to any order or WhatsApp lead that follows, so a sale
 * is credited to them even when it closes later in a chat. A customer's link has no code: it is just a tagged address. Either way the utm tags say where it
 * was shared, so Insights can count the visits by channel.
 */

/** Where a share goes. `share` is the phone's own share sheet (which reaches Instagram, TikTok, Messages and the rest); `link` is a copied address. */
export type ShareChannel = 'whatsapp' | 'facebook' | 'x' | 'telegram' | 'share' | 'link';

/** An absolute product address with the sharer's code (an affiliate) and a tag for the channel. */
export function buildShareLink(base: string, options: { code?: string | null; channel: ShareChannel }): string {
  const url = new URL(base);
  if (options.code) url.searchParams.set('ref', options.code);
  url.searchParams.set('utm_source', options.channel);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', options.code ? 'affiliate' : 'customer-share');
  return url.toString();
}

/** What a message says: the product, its price, the link. */
export function shareMessage(input: { name: string; priceText: string; link: string }): string {
  return `${input.name}\n${input.priceText}\n\n🛒 ${input.link}`;
}

/**
 * The address that opens a channel's own share screen with the message ready, or null for a channel that has none (the phone's share sheet and a
 * copied link are done in the browser). `text` is the words without the link; the link is added where the channel wants it.
 */
export function channelHref(channel: ShareChannel, input: { link: string; text: string }): string | null {
  const link = encodeURIComponent(input.link);
  const text = encodeURIComponent(input.text);
  switch (channel) {
    case 'whatsapp': return `https://wa.me/?text=${encodeURIComponent(`${input.text}\n\n🛒 ${input.link}`)}`;
    case 'facebook': return `https://www.facebook.com/sharer/sharer.php?u=${link}`;
    case 'x': return `https://twitter.com/intent/tweet?text=${text}&url=${link}`;
    case 'telegram': return `https://t.me/share/url?url=${link}&text=${text}`;
    default: return null;
  }
}

/** A picture's file name: the product's address name, nothing a file system would object to. */
export const pictureFileName = (slug: string) => `status-${slug.replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'product'}.jpg`;
