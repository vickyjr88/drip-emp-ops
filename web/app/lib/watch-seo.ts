/**
 * Titles, descriptions, on-page copy, questions and structured data for the Watches pages, in one place so the wording is
 * consistent and testable (backend/test/watches-seo.test.ts). Copy never claims a brand's authenticity or a warranty the
 * shop has not stated: it says what is sold, the price, where to see it and how to order.
 */

import type { WatchBrand, WatchProduct } from './watches';
import { watchPath } from './watches';
import type { FaqItem } from './kit-seo';

const kes = (value: number) => (Number.isFinite(value) && value > 0 ? `KSh ${Math.round(value).toLocaleString('en-KE')}` : '');
const fromPrice = (watches: Array<{ priceFrom: number }>) => {
  const prices = watches.map((w) => w.priceFrom).filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : 0;
};
const clip = (text: string, max = 158) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\-–]$/, '')}…`;
};

export function listingTitle(watches: WatchProduct[]): string {
  const price = kes(fromPrice(watches));
  return price ? `Watches in Nairobi, Kenya: From ${price}` : 'Watches in Nairobi, Kenya';
}

export function listingDescription(watches: WatchProduct[], brands: WatchBrand[]): string {
  const price = kes(fromPrice(watches));
  const names = brands.slice(0, 3).map((b) => b.name).join(', ');
  return clip(`Watches in Nairobi${price ? ` from ${price}` : ''}${names ? `: ${names}` : ''}. See them in person at Dubai Merchants Mall, Ronald Ngala Street, or order with delivery across Kenya.`);
}

export const LISTING_INTRO = 'Watches at Drip Emporium, Nairobi. Browse the range, see any watch in person at Dubai Merchants Mall on Ronald Ngala Street, or order online and have it delivered anywhere in Kenya.';

export function listingFaqs(): FaqItem[] {
  return [
    { question: 'Where can I buy a watch in Nairobi?', answer: 'At Drip Emporium, Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD (open every day 08:00 to 20:00), or online with delivery across Kenya.' },
    { question: 'Can I see a watch before I buy it?', answer: 'Yes. Visit the shop at Dubai Merchants Mall to see any watch in person, or message us on WhatsApp and we will answer questions and send more photos.' },
    { question: 'Do you deliver watches across Kenya?', answer: 'Yes. We deliver from Nairobi across Kenya. The delivery cost depends on the destination and is confirmed after you order.' },
    { question: 'How do I order a watch?', answer: 'Add it to your cart and pay online, or message us on WhatsApp with the watch you want.' },
    { question: 'Do watches come in sizes?', answer: 'No. A watch is not sized like a shoe or a shirt. Where a model comes in more than one version, such as a different strap colour, you pick it on the watch page.' },
  ];
}

export function brandTitle(brand: string, watches: WatchProduct[]): string {
  const price = kes(fromPrice(watches));
  return price ? `${brand} Watches in Kenya: From ${price}` : `${brand} Watches in Kenya`;
}
export function brandDescription(brand: string, watches: WatchProduct[]): string {
  const price = kes(fromPrice(watches));
  return clip(`${brand} watches in Nairobi, Kenya${price ? ` from ${price}` : ''}. ${watches.length} ${watches.length === 1 ? 'model' : 'models'} to see in person or order with delivery across Kenya.`);
}
export function brandIntro(brand: string, watches: WatchProduct[]): string {
  const price = kes(fromPrice(watches));
  return `${brand} watches at Drip Emporium, Nairobi. ${watches.length ? `We have ${watches.length} ${watches.length === 1 ? 'model' : 'models'}${price ? `, from ${price}` : ''}.` : ''} See them in person at Dubai Merchants Mall, or order with delivery across Kenya.`;
}
export function brandFaqs(brand: string, watches: WatchProduct[]): FaqItem[] {
  const price = kes(fromPrice(watches));
  return [
    { question: `How much is a ${brand} watch in Kenya?`, answer: price ? `${brand} watches at Drip Emporium start from ${price}. Each watch page shows its price.` : `Message us for today's prices on ${brand} watches.` },
    { question: `Where can I see ${brand} watches in Nairobi?`, answer: 'At Drip Emporium, Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD, open every day 08:00 to 20:00.' },
    { question: `Do you deliver ${brand} watches outside Nairobi?`, answer: 'Yes. We deliver across Kenya; the cost depends on the destination and is confirmed after you order.' },
  ];
}

export function watchTitle(watch: WatchProduct): string {
  const price = kes(watch.priceFrom);
  return price ? `${watch.name} Price in Kenya: ${price}` : `${watch.name} in Kenya`;
}
export function watchDescription(watch: WatchProduct): string {
  const price = kes(watch.priceFrom);
  const brand = watch.brand && !watch.name.toLowerCase().includes(watch.brand.toLowerCase()) ? ` by ${watch.brand}` : '';
  const stock = watch.anyInStock ? 'In stock.' : 'Message us to order yours.';
  return clip(`${watch.name}${brand}${price ? `: ${price}` : ''} in Kenya. ${stock} See it at Dubai Merchants Mall, Ronald Ngala Street, Nairobi, or order with delivery across Kenya.`);
}
export function watchFaqs(watch: WatchProduct): FaqItem[] {
  const price = kes(watch.priceFrom);
  return [
    { question: `How much is the ${watch.name} in Kenya?`, answer: price ? `The ${watch.name} is ${price} at Drip Emporium.` : `Message us for today's price on the ${watch.name}.` },
    { question: 'Can I see it before I buy?', answer: 'Yes. Visit Drip Emporium at Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi (open every day 08:00 to 20:00), or message us on WhatsApp for more photos.' },
    { question: 'Do you deliver across Kenya?', answer: 'Yes. We deliver from Nairobi across Kenya; the cost depends on the destination and is confirmed after you order.' },
    { question: 'Does it come in a size?', answer: 'No, a watch has no size. ' + (watch.options.length ? `It comes in ${watch.options.map((o) => o.name).join(' or ')}: choose one on this page.` : 'There is nothing to choose: add it to your cart.') },
  ];
}

export function watchProductSchema(watch: WatchProduct, absolute: (path: string) => string) {
  const url = absolute(watchPath(watch.slug));
  return {
    '@type': 'Product',
    '@id': `${url}#product`,
    url,
    name: watch.name,
    ...(watch.variants[0]?.sku ? { sku: watch.variants[0].sku } : {}),
    category: 'Watches',
    ...(watch.brand ? { brand: { '@type': 'Brand', name: watch.brand } } : {}),
    ...(watch.imageUrls.length ? { image: watch.imageUrls } : {}),
    ...(watch.description ? { description: watch.description } : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'KES',
      lowPrice: watch.priceFrom,
      highPrice: watch.priceTo,
      offerCount: watch.variants.length,
      availability: watch.anyInStock ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
      url,
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': `${absolute('/')}#organization` },
    },
  };
}

export function watchListSchema(watches: WatchProduct[], absolute: (path: string) => string, name: string) {
  return {
    '@type': 'ItemList',
    name,
    numberOfItems: watches.length,
    itemListElement: watches.slice(0, 50).map((w, i) => ({ '@type': 'ListItem', position: i + 1, url: absolute(watchPath(w.slug)), name: w.name })),
  };
}
