/**
 * Brand and model landing pages ("Nike sneakers in Nairobi", "Air Force 1 price in Kenya").
 *
 * People search by brand and model far more than by our category names, and the answer they want is a price in
 * shillings and a place to buy. These pages are built from the live catalogue, so the price range, sizes and stock
 * counts in their copy are always the real ones and can never drift out of date; the only hand-written text is a
 * short factual line per model.
 *
 * Pure functions over a product list, so the page, the sitemap and /llms.txt all agree on which pages exist.
 */
import { formatKes, type ShopProduct } from './shop';
import { STORE_ADDRESS, STORE_HOURS } from './site';

export type CollectionKind = 'brand' | 'collection';

export type Collection = {
  kind: CollectionKind;
  slug: string;
  /** "Nike" for a brand, "Nike Air Force 1" for a model. */
  name: string;
  /** What the products are, plural and lower case: "sneakers", "watches". */
  noun: string;
  products: ShopProduct[];
  /** A short factual line about the model (models only). */
  blurb?: string;
  /** How shoppers say it in the plural ("Nike Dunks"), used where it reads more naturally than the model name. */
  alias?: string;
};

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * No brand landing page for these names. Some products in the catalogue are described as "styled after" a luxury brand
 * (a watch "styled after the classic Rolex look"), and a page titled "Rolex watches in Nairobi" with a price of a few
 * thousand shillings would tell searchers they can buy the real thing for that. The products stay on the site under
 * their own names; they just do not get a page that trades on the brand.
 */
export const NO_BRAND_PAGE = new Set([
  'rolex', 'hublot', 'patekphilippe', 'patek-philippe', 'seiko', 'omega', 'cartier', 'versace', 'dior', 'berluti',
  'gucci', 'prada', 'balenciaga', 'louis-vuitton', 'lv', 'fendi', 'burberry', 'chanel', 'hermes', 'off-white',
]);

/** A page is worth indexing once it has enough products to be a real collection rather than a thin page. */
export const MIN_BRAND_PRODUCTS = 3;
export const MIN_MODEL_PRODUCTS = 2;

type Series = { slug: string; name: string; match: RegExp; blurb: string; /** How shoppers say it in the plural, for the "which … do you stock" question. */ alias?: string };

// Matched against the product name. Only facts that are safe to state: the year a model first appeared.
const SERIES: Series[] = [
  { slug: 'air-force-1', name: 'Nike Air Force 1', match: /air\s?force\s?1\b|airforce\s?1\b|\baf1\b/i, blurb: 'The Air Force 1 first appeared in 1982 and has stayed a streetwear staple ever since, in everything from all-white to custom colourways.' },
  { slug: 'air-max', name: 'Nike Air Max', match: /air\s?max/i, blurb: 'Nike introduced visible Air cushioning in the Air Max line in 1987; the 90, 95 and 97 are among its best-known shapes.' },
  { slug: 'jordan-4', name: 'Air Jordan 4', match: /jordan\s?4\b/i, blurb: 'The Air Jordan 4 was first released in 1989 and is recognisable by its mesh side panels and lace wings.' },
  { slug: 'nike-dunk', name: 'Nike Dunk', alias: 'Nike Dunks', match: /\bdunk/i, blurb: 'The Dunk started life as a basketball shoe in 1985 and became a skate and streetwear favourite.' },
  { slug: 'nike-tn', name: 'Nike Air Max TN (Tuned Air)', match: /\btn\b/i, blurb: 'The Air Max Plus, known as the TN for its Tuned Air units, arrived in 1998 with a wavy, layered upper.' },
  { slug: 'nike-shox', name: 'Nike Shox', match: /shox/i, blurb: 'Nike Shox put spring-like cushioning columns in the heel and launched in 2000.' },
  { slug: 'nocta-glide', name: 'Nike NOCTA Glide', match: /nocta/i, blurb: 'NOCTA is Nike\'s line with the artist Drake, launched in 2020; the Glide is its sculpted, futuristic runner.' },
  { slug: 'adidas-samba', name: 'Adidas Samba', alias: 'Adidas Sambas', match: /samba/i, blurb: 'The Samba dates back to 1949, built as a football shoe for icy pitches, and keeps its slim profile and gum sole.' },
  { slug: 'adidas-stan-smith', name: 'Adidas Stan Smith', match: /stan\s?smith/i, blurb: 'The Stan Smith is a minimalist tennis shoe, named after the player in 1971, with perforated stripes and a clean leather upper.' },
  { slug: 'adidas-campus', name: 'Adidas Campus', match: /campus/i, blurb: 'The Campus is a suede low-top from the 1970s with a retro basketball look.' },
];

/** The most common value, so one stray spelling does not rename a whole brand. */
function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/** "sneakers", "watches": the category most of these products sit in, lower case. */
function nounFor(products: ShopProduct[]): string {
  const names = products.map((p) => p.category?.name?.trim()).filter((n): n is string => Boolean(n));
  return names.length ? mostCommon(names).toLowerCase() : 'shoes';
}

/** Every brand and model collection the catalogue supports (including ones too small to index). */
export function buildCollections(products: ShopProduct[]): Collection[] {
  const collections: Collection[] = [];

  const byBrand = new Map<string, ShopProduct[]>();
  for (const product of products) {
    const brand = product.brand?.trim();
    if (!brand) continue;
    const slug = slugify(brand);
    if (!slug || NO_BRAND_PAGE.has(slug)) continue;
    byBrand.set(slug, [...(byBrand.get(slug) ?? []), product]);
  }
  byBrand.forEach((list, slug) => {
    collections.push({ kind: 'brand', slug, name: mostCommon(list.map((p) => p.brand!.trim())), noun: nounFor(list), products: list });
  });

  for (const series of SERIES) {
    const list = products.filter((p) => series.match.test(p.name));
    if (list.length) collections.push({ kind: 'collection', slug: series.slug, name: series.name, noun: nounFor(list), products: list, blurb: series.blurb, alias: series.alias });
  }

  return collections;
}

export const isIndexable = (c: Collection) => c.products.length >= (c.kind === 'brand' ? MIN_BRAND_PRODUCTS : MIN_MODEL_PRODUCTS);

export const collectionPath = (c: Pick<Collection, 'kind' | 'slug'>) =>
  c.kind === 'brand' ? `/shop/brand/${c.slug}` : `/shop/collection/${c.slug}`;

/** Title-case the noun for headings: "sneakers" -> "Sneakers". */
const titleCase = (text: string) => text.replace(/(^|\s)(\S)/g, (_, space, ch) => space + ch.toUpperCase());

export type Facts = {
  count: number;
  minPrice: number | null;
  maxPrice: number | null;
  /** "EUR 36 to 46" style range, or null when the products carry no numeric sizes (watches). */
  sizeRange: string | null;
  sizes: number[];
  inStockStyles: number;
};

export function collectionFacts(c: Collection): Facts {
  const prices = c.products.flatMap((p) => [p.priceFrom, p.priceTo]).filter((n) => Number.isFinite(n) && n > 0);
  const sizes = Array.from(
    new Set(
      c.products
        .flatMap((p) => p.variants.map((v) => (v.size ?? '').replace(/^EUR\s*/i, '').trim()))
        .filter((s) => /^\d{2}(\.\d)?$/.test(s))
        .map(Number),
    ),
  ).sort((a, b) => a - b);
  return {
    count: c.products.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    sizeRange: sizes.length ? `EUR ${sizes[0]} to ${sizes[sizes.length - 1]}` : null,
    sizes,
    inStockStyles: c.products.filter((p) => p.anyInStock).length,
  };
}

/** Page heading and search title: brands answer "X in Nairobi", models answer "X price in Kenya". */
export function collectionHeading(c: Collection): string {
  return c.kind === 'brand' ? `${c.name} ${titleCase(c.noun)} in Nairobi, Kenya` : `${c.name} Price in Kenya`;
}

/**
 * The search-result title. Models lead with the question shoppers type ("how much is the Adidas Samba") and carry the
 * starting price, which is what makes a result get clicked; brands keep the heading.
 */
export function collectionTitle(c: Collection): string {
  if (c.kind === 'brand') return collectionHeading(c);
  const { minPrice } = collectionFacts(c);
  return minPrice === null ? collectionHeading(c) : `${c.name} Price in Kenya: From ${formatKes(minPrice)}`;
}

const priceRange = (f: Facts) =>
  f.minPrice === null ? null : f.maxPrice !== null && f.maxPrice > f.minPrice ? `${formatKes(f.minPrice)} to ${formatKes(f.maxPrice)}` : formatKes(f.minPrice);

export function collectionDescription(c: Collection): string {
  const f = collectionFacts(c);
  const price = priceRange(f);
  const subject = c.kind === 'brand' ? `${c.name} ${c.noun}` : `${c.name} shoes`;
  return [
    `${subject}: ${f.count} style${f.count === 1 ? '' : 's'}${price ? ` from ${formatKes(f.minPrice!)}` : ''} at Drip Emporium, Dubai Merchants Mall, Ronald Ngala Street, Nairobi.`,
    f.sizeRange ? `Sizes ${f.sizeRange}.` : '',
    'Delivery across Kenya.',
  ].filter(Boolean).join(' ');
}

/** The opening paragraph: the direct answer (price, where, how) before anything else. */
export function collectionIntro(c: Collection): string {
  const f = collectionFacts(c);
  const price = priceRange(f);
  const subject = c.kind === 'brand' ? `${c.name} ${c.noun}` : c.name;
  return [
    `Drip Emporium stocks ${f.count} ${subject} style${f.count === 1 ? '' : 's'} in Nairobi${price ? `, priced at ${price}` : ''}.`,
    f.inStockStyles > 0
      ? `${f.inStockStyles} of ${f.count} ${f.count === 1 ? 'is' : 'are'} on the shelf in at least one size right now, and any other listed size can be ordered for you.`
      : 'Every listed size can be ordered for you.',
    `Visit the shop at ${STORE_ADDRESS} (${STORE_HOURS.toLowerCase()}) or order online with delivery across Kenya.`,
  ].join(' ');
}

export type Faq = { question: string; answer: string };

/** Questions shoppers actually ask, answered from the live facts. Shown on the page and marked up as FAQPage. */
export function collectionFaqs(c: Collection): Faq[] {
  const f = collectionFacts(c);
  const price = priceRange(f);
  const subject = c.kind === 'brand' ? `${c.name} ${c.noun}` : c.name;
  const faqs: Faq[] = [];

  if (price) {
    // Shoppers type "how much is the Adidas Samba" for a model and "how much are Nike sneakers" for a brand.
    faqs.push({
      question: c.kind === 'collection' ? `How much is the ${c.name} in Kenya?` : `How much are ${subject} in Kenya?`,
      answer: `At Drip Emporium, ${c.kind === 'collection' ? `the ${c.name} costs` : `${subject} cost`} from ${formatKes(f.minPrice!)}${f.maxPrice! > f.minPrice! ? ` up to ${formatKes(f.maxPrice!)}` : ''}, in Kenyan shillings, depending on the colourway. The prices on this page are live and change with the catalogue.`,
    });
  }
  // Lists what is actually here, which is the other thing people ask once they have the price.
  const named = c.products.slice(0, 8).map((p) => `${p.name} (${p.priceFrom === p.priceTo ? formatKes(p.priceFrom) : `from ${formatKes(p.priceFrom)}`})`);
  if (named.length) {
    faqs.push({
      question: c.alias ? `Which ${c.alias} do you stock?` : `Which ${subject} styles do you stock?`,
      answer: `${named.join(', ')}${c.products.length > named.length ? `, and ${c.products.length - named.length} more` : ''}. ${
        f.inStockStyles > 0 ? `${f.inStockStyles} of ${f.count} ${f.count === 1 ? 'is' : 'are'} on the shelf in at least one size right now.` : 'None are on the shelf in every size right now; message us on WhatsApp and we will tell you how quickly we can get your size.'
      }`,
    });
  }
  faqs.push({
    question: `Where can I buy ${subject} in Nairobi?`,
    answer: `Visit Drip Emporium at ${STORE_ADDRESS}. We are open ${STORE_HOURS.toLowerCase()}. You can also order online and we will arrange delivery.`,
  });
  faqs.push({
    question: `Do you deliver ${subject} outside Nairobi?`,
    answer: 'Yes, countrywide across Kenya. Delivery is not charged at checkout because the cost depends on where the parcel is going: place your order and we will call you to arrange delivery and confirm the cost.',
  });
  if (f.sizeRange) {
    faqs.push({
      question: `What sizes do your ${subject} come in?`,
      answer: `Across our ${subject} the sizes run ${f.sizeRange}, though the range varies by style. Each product page lists the sizes that pair actually comes in. If your size is not listed, message us on WhatsApp and we will tell you honestly whether we can get it.`,
    });
  }
  faqs.push({
    question: `Can I try ${subject} on before paying?`,
    answer: 'At the shop, yes. Come in, try them on, and pay only if they fit.',
  });
  return faqs;
}
