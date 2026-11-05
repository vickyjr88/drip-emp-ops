import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  brandDescription, brandFaqs, brandIntro, brandTitle, LISTING_INTRO, listingDescription, listingFaqs, listingTitle, watchDescription,
  watchFaqs, watchListSchema, watchProductSchema, watchTitle,
} from '../../web/app/lib/watch-seo';
import { brandSlug, watchBrandPath, watchPath } from '../../web/app/lib/watches';
import { watchFeedRows } from '../../web/app/lib/watch-feed';
import { breadcrumbSchema, faqSchema } from '../../web/app/lib/kit-seo';

const watch = (over: any = {}): any => ({
  id: 'w1', slug: 'bagolee-chronograph-black', name: 'Bagolee Chronograph Black', brand: 'Bagolee', description: 'A black chronograph.',
  imageUrls: ['https://api.test/media/w.jpg'], priceFrom: 4500, priceTo: 4500, anyInStock: true, sizesInStock: [], options: [],
  variants: [{ id: 'v1', sku: 'BAG-1', name: 'Standard', size: null, priceKes: 4500, inStock: true, canOrder: true }], ...over,
});
const abs = (p: string) => `https://dripemporium.store${p}`;
const CLAIMS = /\b(genuine|authentic|original|official|licen[cs]ed|warranty|guarantee[d]?)\b/i;

test('titles and descriptions fit a search result and carry the price', () => {
  const list = [watch(), watch({ priceFrom: 3000 })];
  const brands = [{ name: 'Bagolee', slug: 'bagolee', count: 2 }];
  for (const text of [listingTitle(list), brandTitle('Bagolee', list), watchTitle(watch())]) assert.ok(text.length <= 70, `${text} (${text.length})`);
  for (const text of [listingDescription(list, brands), brandDescription('Bagolee', list), watchDescription(watch())]) assert.ok(text.length <= 165, `${text.length}: ${text}`);
  assert.match(listingTitle(list), /From KSh 3,000/);
  assert.match(watchTitle(watch()), /Price in Kenya: KSh 4,500/);
  assert.equal(listingTitle([]).includes('KSh'), false);
  assert.match(watchDescription(watch({ anyInStock: false })), /Message us to order/);
});

test('nothing claims a brand is genuine or authentic, or promises a warranty the shop has not stated', () => {
  const copy = [
    listingTitle([watch()]), listingDescription([watch()], []), LISTING_INTRO, brandTitle('Bagolee', [watch()]), brandDescription('Bagolee', [watch()]),
    brandIntro('Bagolee', [watch()]), watchTitle(watch()), watchDescription(watch()),
    ...listingFaqs().flatMap((f) => [f.question, f.answer]), ...brandFaqs('Bagolee', [watch()]).flatMap((f) => [f.question, f.answer]), ...watchFaqs(watch()).flatMap((f) => [f.question, f.answer]),
  ];
  for (const text of copy) assert.equal(CLAIMS.test(text), false, text);
});

test('a watch has no size: the only mention of one is to say so', () => {
  const answers = [...listingFaqs(), ...watchFaqs(watch()), ...watchFaqs(watch({ options: [{ id: 'a', name: 'Black strap' }, { id: 'b', name: 'Brown strap' }] }))];
  for (const faq of answers.filter((f) => /size/i.test(f.question + f.answer))) {
    assert.match(faq.answer, /\bNo\b/, `a size mention must be a denial: ${faq.answer}`);
  }
  assert.match(watchFaqs(watch({ options: [{ id: 'a', name: 'Black strap' }, { id: 'b', name: 'Brown strap' }] })).at(-1)!.answer, /Black strap or Brown strap/);
  assert.match(watchFaqs(watch()).at(-1)!.answer, /nothing to choose/);
});

test('structured data: product, list, FAQ and breadcrumb', () => {
  const product = watchProductSchema(watch(), abs) as any;
  assert.equal(product.category, 'Watches');
  assert.equal(product.brand.name, 'Bagolee');
  assert.equal(product.offers.priceCurrency, 'KES');
  assert.equal(product.offers.availability, 'https://schema.org/InStock');
  assert.equal((watchProductSchema(watch({ anyInStock: false }), abs) as any).offers.availability, 'https://schema.org/PreOrder');
  assert.equal(JSON.stringify(product).toLowerCase().includes('size'), false, 'no size in the product data');
  const list = watchListSchema([watch()], abs, 'Watches');
  assert.equal(list.itemListElement[0].url, abs('/watches/bagolee-chronograph-black'));
  assert.ok(faqSchema(listingFaqs()).mainEntity.length >= 5);
  assert.equal(breadcrumbSchema([{ name: 'Home', url: abs('/') }, { name: 'Watches', url: abs('/watches') }]).itemListElement.length, 2);
});

test('brand addresses are the same on the server and in the pages', async () => {
  // The brand list comes from the API with its own slug, and pages build links with brandSlug(): they must agree.
  const { WatchesService } = await import('../src/watches/watches.service');
  const slugs = ['Bagolee', 'Casio G-Shock', 'Tommy Hilfiger', 'D&G', 'Michael  Kors', ' Fossil '];
  const fake: any = { product: { groupBy: async () => slugs.map((brand) => ({ brand, _count: { _all: 1 } })) } };
  const service = new WatchesService(fake, {} as any);
  const fromServer = (await service.brands()).map((b) => b.slug).sort();
  assert.deepEqual(fromServer, slugs.map(brandSlug).sort());
  assert.equal(brandSlug('D&G'), 'd-and-g');
  assert.equal(watchBrandPath('casio-g-shock'), '/watches/brand/casio-g-shock');
  assert.equal(watchPath('x'), '/watches/x');
});

test('the feed: one row per option, no size, a picture required, availability that tells the truth', () => {
  const rows = watchFeedRows([
    watch(),
    watch({ id: 'w2', slug: 'duo', name: 'Duo', options: [{ id: 'a', name: 'Black' }, { id: 'b', name: 'Brown' }], variants: [
      { id: 'a', sku: 'D-BLK', name: 'Black', size: null, priceKes: 6000, inStock: true }, { id: 'b', sku: 'D-BRN', name: 'Brown', size: null, priceKes: 6000, inStock: false } ] }),
    watch({ id: 'w3', slug: 'nopic', imageUrls: [] }),
  ], 'https://dripemporium.store');
  assert.equal(rows.length, 3, 'a watch with no picture is left out');
  assert.deepEqual(rows.slice(1).map((r) => [r.title, r.availability]), [['Duo - Black', 'in stock'], ['Duo - Brown', 'available for order']]);
  assert.equal(rows[0].title, 'Bagolee Chronograph Black', 'a single watch has no option in its title');
  assert.ok(rows.every((r) => r.customLabel0 === 'WATCH' && r.googleCategory.endsWith('Watches') && !('size' in r)));
  assert.equal(CLAIMS.test(rows[0].description), false);
});
