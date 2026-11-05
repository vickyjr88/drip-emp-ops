import { SITE_URL } from './site';
import { KitProduct, leagueByKey } from './kits';

/**
 * Rows for the Kits product feeds (Meta, Google, X catalogue format). One row per size, built from the kits line only:
 * the shoe feeds never see a kit and this feed never sees a shoe. A kit with no staff photo uses the drawn-shirt PNG
 * from /kits/image/<slug>, so every kit can be listed.
 */

export type KitFeedRow = {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  availability: 'in stock' | 'out of stock' | 'available for order';
  price: string;
  condition: 'new';
  brand: string;
  mpn: string;
  itemGroupId: string;
  productType: string;
  googleCategory: string;
  size: string;
  color: string;
  gender: 'unisex';
  ageGroup: 'adult';
  customLabel0: string;
  customLabel1: string;
};


const NAMED: Array<[string, [number, number, number]]> = [
  ['White', [245, 245, 242]], ['Black', [17, 17, 17]], ['Grey', [150, 153, 158]], ['Red', [200, 16, 46]], ['Dark Red', [110, 20, 40]],
  ['Blue', [0, 80, 180]], ['Navy', [24, 40, 86]], ['Sky Blue', [110, 171, 221]], ['Green', [0, 128, 60]], ['Yellow', [250, 215, 0]],
  ['Orange', [255, 102, 0]], ['Purple', [90, 40, 130]], ['Brown', [110, 70, 40]], ['Pink', [240, 130, 170]],
];

/** The nearest everyday colour name for a hex colour: Google and Meta want "Red", not "#c8102e". */
export function colourName(hex: string): string {
  const v = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  if (rgb.some((c) => Number.isNaN(c))) return 'Multicolor';
  let best = NAMED[0];
  let bestDistance = Infinity;
  for (const entry of NAMED) {
    const d = entry[1].reduce((sum, c, i) => sum + (c - rgb[i]) ** 2, 0);
    if (d < bestDistance) { best = entry; bestDistance = d; }
  }
  return best[0];
}

export function kitFeedRows(products: KitProduct[]): KitFeedRow[] {
  const rows: KitFeedRow[] = [];
  for (const product of products) {
    const { kit } = product;
    const link = `${SITE_URL}/kits/${product.slug}`;
    const image = product.imageUrls[0] || `${SITE_URL}/kits/image/${product.slug}`;
    const league = kit.club ? leagueByKey(kit.club.league) : undefined;
    const productType = ['Kits', kit.kind === 'JERSEY' ? 'Football jerseys' : 'T-shirts', league?.name, kit.club?.name].filter(Boolean).join(' > ');
    const description = `${product.description || product.name} Fan-version shirt in club colours: not endorsed by or affiliated with any club, league or kit maker. Add your own name and number at ${SITE_URL}/design.`;

    for (const variant of product.variants) {
      rows.push({
        id: variant.sku,
        title: variant.size ? `${product.name} - ${variant.size}` : product.name,
        description,
        link,
        imageLink: image,
        // A shirt that is not on the shelf is made to order: still purchasable, so still listed as available.
        availability: variant.inStock ? 'in stock' : 'available for order',
        price: `${variant.priceKes.toFixed(2)} KES`,
        condition: 'new',
        brand: 'Drip Emporium',
        mpn: variant.sku,
        itemGroupId: product.id,
        productType,
        googleCategory: kit.kind === 'JERSEY' ? 'Apparel & Accessories > Clothing > Activewear > Sports Jerseys' : 'Apparel & Accessories > Clothing > Shirts & Tops',
        size: variant.size ?? '',
        color: kit.colors.pattern === 'solid' || kit.colors.pattern === 'pinstripe' ? colourName(kit.colors.primary) : `${colourName(kit.colors.primary)}/${colourName(kit.colors.secondary)}`,
        gender: 'unisex',
        ageGroup: 'adult',
        customLabel0: 'KIT',
        customLabel1: league?.short ?? (kit.kind === 'TSHIRT' ? 'Custom T-shirt' : 'Jersey'),
      });
    }
  }
  return rows;
}

