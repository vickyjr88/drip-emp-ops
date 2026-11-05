import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  breadcrumbSchema, clubDescription, clubFaqs, clubHeading, clubIntro, clubTitle, clip, designApplicationSchema, designFaqs, designHowTo,
  designTitle, DESIGN_DESCRIPTION, faqSchema, itemListSchema, kitDescription, kitFaqs, kitProductSchema, kitTitle, leagueDescription,
  leagueFaqs, leagueIntro, leagueTitle, listingDescription, listingFaqs, listingTitle,
} from '../../web/app/lib/kit-seo';
import { KIT_GUIDES } from '../../web/app/lib/kit-guides';
import { LEAGUES, clubPath, kitPath, leaguePath } from '../../web/app/lib/kits';
import { colourName, kitFeedRows } from '../../web/app/lib/kit-feed';
import { shirtSvg } from '../../web/app/components/kit-shirt-svg';
import { SHAPES } from '../../web/app/components/kit-geometry';

const config: any = {
  enabled: true,
  pricing: { nameFeeKes: 500, numberFeeKes: 300, nameAndNumberFeeKes: 700, artworkFeeKes: 700, textFeeKes: 400 },
  leadTime: 'Made to order. Delivered in 1 to 3 days, including printing and sourcing the shirt if we do not have it in stock.',
  returnsNote: 'Personalised items are printed just for you, so they cannot be returned or exchanged unless they arrive faulty or misprinted.',
  fanVersionNote: 'Fan-version shirts in club colours. Independent product, not endorsed by or affiliated with any club, league or kit maker.',
  listing: { heading: 'Football Jerseys & Custom T-Shirts in Nairobi, Kenya', intro: '' },
  designCenter: { heading: 'Design your own jersey or T-shirt', intro: '' },
};

const colors = { primary: '#ef0107', secondary: '#ffffff', trim: '#ffffff', pattern: 'solid', sleeves: 'secondary' } as const;
const kit = (over: any = {}): any => ({
  id: 'k1', slug: 'manchester-united-home-jersey-2025-26-fan-version', name: 'Manchester United Home Jersey 2025/26 (Fan Version)', description: 'Fan-version shirt.',
  imageUrls: [], variants: [{ id: 'v1', sku: 'MUN-M', name: 'M', size: 'M', priceKes: 3500, inStock: false, canOrder: true }], priceFrom: 3500, priceTo: 3500,
  sizesInStock: [], anyInStock: false,
  kit: { kind: 'JERSEY', club: { slug: 'manchester-united', name: 'Manchester United', league: 'EPL' }, season: '2025/26', edition: 'HOME', templateKey: 'jersey-short', colors, allowName: true, allowNumber: true, allowArtwork: false, photoFront: null, photoBack: null, printAreas: null, fontKeys: [] },
  ...over,
});
const tee = () => kit({ name: 'Custom Crew-neck T-Shirt', slug: 'custom-crew-neck-t-shirt', priceFrom: 1500, kit: { ...kit().kit, kind: 'TSHIRT', club: null, templateKey: 'tee-crew', allowName: false, allowNumber: false, allowArtwork: true } });
const club = { slug: 'manchester-united', name: 'Manchester United', aliases: ['man u', 'man utd', 'united'], league: 'EPL' };
const abs = (p: string) => `https://dripemporium.store${p}`;

/** Words that would claim the shirts are the real thing. Allowed only where the sentence denies it ("not official"). */
const CLAIMS = /\b(official|authentic|genuine|original|licen[cs]ed)\b/i;

test('titles stay within what a search result shows, and carry the price where there is one', () => {
  const long = kit();
  assert.ok(kitTitle(long).length <= 70, kitTitle(long));
  assert.match(kitTitle(long), /Price in Kenya: KSh 3,500/);
  assert.ok(kitTitle(tee()).length <= 66);
  for (const title of [clubTitle(club, [kit()]), leagueTitle(LEAGUES[0], [kit()]), listingTitle(config), designTitle(config)]) {
    assert.ok(title.length <= 72, `${title} (${title.length})`);
  }
  assert.equal(kitTitle(kit({ priceFrom: 0 })).includes('KSh'), false);
});

test('descriptions fit a search snippet and are never cut mid-word', () => {
  const texts = [kitDescription(kit(), config), kitDescription(tee(), config), clubDescription(club, [kit()]), leagueDescription(LEAGUES[0], [club, club, club, club, club], [kit()]), listingDescription([kit()]), DESIGN_DESCRIPTION];
  for (const text of texts) assert.ok(text.length <= 165, `${text.length}: ${text}`);
  assert.equal(clip('word '.repeat(60)).endsWith('…'), true);
  assert.equal(clip('short'), 'short');
});

test('nothing on a kit page claims the shirt is official, authentic, original or licensed', () => {
  const copy = [
    kitTitle(kit()), kitDescription(kit(), config), clubTitle(club, [kit()]), clubDescription(club, [kit()]), clubHeading(club), clubIntro(club, [kit()], LEAGUES[0]),
    leagueTitle(LEAGUES[0], []), leagueDescription(LEAGUES[0], [club], []), leagueIntro(LEAGUES[0], [club]), listingTitle(config), listingDescription([kit()]),
    designTitle(config), DESIGN_DESCRIPTION,
    // The comparison guide is about the difference between fan versions and official shirts, so it names both; the guide
    // test below checks that it says plainly which one we sell.
    ...KIT_GUIDES.filter((g) => g.slug !== 'fan-version-vs-official-football-jerseys').flatMap((g) => [g.title, g.description]),
  ];
  for (const text of copy) assert.equal(CLAIMS.test(text), false, `claims authenticity: ${text}`);
  // Questions may use the word, but the answer must deny it.
  const faqs = [...kitFaqs(kit(), config), ...clubFaqs(club, [kit()], config), ...leagueFaqs(LEAGUES[0], config), ...listingFaqs(config), ...designFaqs(config)];
  for (const faq of faqs.filter((f) => CLAIMS.test(f.question) && /official|original/i.test(f.question))) {
    assert.match(faq.answer, /\b(No\b|not endorsed|independent product)/i, faq.question);
  }
});

test('the fan-version guide says what a fan version is, plainly', () => {
  const guide = KIT_GUIDES.find((g) => g.slug === 'fan-version-vs-official-football-jerseys')!;
  const text = JSON.stringify(guide);
  assert.match(text, /not endorsed by or affiliated with the club/i);
  assert.match(text, /does not carry the club's crest/i);
});

test('every guide has a unique address, a real date, sections and no unreplaced placeholders', () => {
  assert.equal(new Set(KIT_GUIDES.map((g) => g.slug)).size, KIT_GUIDES.length);
  for (const g of KIT_GUIDES) {
    assert.match(g.slug, /^[a-z0-9-]+$/);
    assert.ok(g.title.length <= 80 && g.description.length <= 170, g.slug);
    assert.ok(!Number.isNaN(Date.parse(g.updated)));
    assert.ok(g.sections.length >= 2 && g.sections.every((s) => s.paragraphs.length > 0));
    assert.equal(/TODO|lorem|\{\{/i.test(JSON.stringify(g)), false);
  }
  assert.ok(KIT_GUIDES.length >= 6);
});

test('the lead time, returns note and fees quoted in answers come from the editable settings', () => {
  const custom = { ...config, leadTime: 'Ready in 3 days.', returnsNote: 'No returns on personalised shirts.', pricing: { ...config.pricing, nameAndNumberFeeKes: 1234 } };
  const answers = listingFaqs(custom).map((f) => f.answer).join(' ');
  assert.match(answers, /Ready in 3 days/);
  assert.match(answers, /KSh 1,234/);
  assert.match(kitFaqs(kit(), custom).map((f) => f.answer).join(' '), /No returns on personalised shirts/);
});

test('questions fit the shirt: a T-shirt offers artwork, a jersey offers a name and number', () => {
  const jersey = kitFaqs(kit(), config).map((f) => f.question).join('|');
  assert.match(jersey, /name and number/i);
  assert.equal(/own design/i.test(jersey), false);
  const shirt = kitFaqs(tee(), config).map((f) => f.question).join('|');
  assert.match(shirt, /own design/i);
  assert.equal(/name and number/i.test(shirt), false);
});

test('structured data: FAQ, breadcrumb, list, product and the design center application', () => {
  const faq = faqSchema(kitFaqs(kit(), config));
  assert.equal(faq['@type'], 'FAQPage');
  assert.ok(faq.mainEntity.length >= 5 && faq.mainEntity.every((q: any) => q.name && q.acceptedAnswer.text));
  const crumbs = breadcrumbSchema([{ name: 'Home', url: abs('/') }, { name: 'Kits', url: abs('/kits') }]);
  assert.deepEqual(crumbs.itemListElement.map((c: any) => c.position), [1, 2]);
  const list = itemListSchema([kit()], abs, 'Kits');
  assert.equal(list.itemListElement[0].url, abs(kitPath('manchester-united-home-jersey-2025-26-fan-version')));
  const product = kitProductSchema(kit(), abs) as any;
  assert.equal(product.offers.availability, 'https://schema.org/PreOrder', 'a made-to-order shirt is not claimed to be in stock');
  assert.equal(product.offers.priceCurrency, 'KES');
  assert.equal(product.about.name, 'Manchester United');
  assert.deepEqual(product.image, [abs('/kits/image/manchester-united-home-jersey-2025-26-fan-version')], 'a kit with no photo still has an image');
  assert.equal(kitProductSchema(kit({ anyInStock: true }), abs).offers.availability, 'https://schema.org/InStock');
  assert.equal((designApplicationSchema(abs) as any)['@type'], 'WebApplication');
  assert.equal((designHowTo(abs) as any).step.length, 4);
});

test('page addresses are stable and unique', () => {
  assert.equal(clubPath('arsenal'), '/kits/club/arsenal');
  assert.equal(leaguePath('premier-league'), '/kits/league/premier-league');
  assert.equal(new Set(LEAGUES.map((l) => l.slug)).size, LEAGUES.length);
});

test('the feed: one row per size, colours as words, a picture for every kit, availability that tells the truth', () => {
  const rows = kitFeedRows([kit({ variants: [{ id: 'a', sku: 'A-S', name: 'S', size: 'S', priceKes: 3500, inStock: true }, { id: 'b', sku: 'A-M', name: 'M', size: 'M', priceKes: 3500, inStock: false }] }), tee()], 'https://dripemporium.store');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.slice(0, 2).map((r) => r.availability), ['in stock', 'available for order']);
  assert.ok(rows.every((r) => /^https?:\/\//.test(r.imageLink) && r.price.endsWith(' KES') && r.customLabel0 === 'KIT'));
  assert.equal(rows[0].color, 'Red');
  assert.match(rows[0].productType, /^Kits > Football jerseys > Premier League > Manchester United$/);
  assert.equal(CLAIMS.test(rows[0].description.replace(/not endorsed[^.]*\./i, '')), false);
  assert.equal(colourName('#6cabdd'), 'Sky Blue');
  assert.equal(colourName('#111111'), 'Black');
  assert.equal(colourName('#fdb913'), 'Yellow');
});

test('the drawn-shirt PNG source is valid SVG for every shape and pattern', () => {
  for (const key of Object.keys(SHAPES)) {
    for (const pattern of ['solid', 'stripes', 'hoops', 'halves', 'sash', 'pinstripe'] as const) {
      for (const side of ['front', 'back'] as const) {
        const svg = shirtSvg(key, { ...colors, pattern }, side);
        assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 400 440"/);
        assert.ok(svg.trim().endsWith('</svg>'));
        assert.equal(/undefined|NaN/.test(svg), false, `${key}/${pattern}/${side}`);
      }
    }
  }
});

test('a photo is fitted, never stretched, and areas marked on it land in the same place on the shirt drawing', async () => {
  const { photoBox, areasFromFractions, areasFor } = await import('../../web/app/components/kit-geometry');
  // The drawing is 400 x 440. A square photo is fitted to its width and centred; a tall one to its height.
  assert.deepEqual(photoBox(1), { x: 0, y: 20, w: 400, h: 400 });
  const tall = photoBox(0.5);
  assert.deepEqual([tall.x, tall.y, tall.h], [90, 0, 440]);
  assert.equal(Math.round(tall.w), 220);
  assert.deepEqual(photoBox(400 / 440), { x: 0, y: 0, w: 400, h: 440 }, 'a photo already the drawing\'s shape fills it');
  assert.deepEqual(photoBox(NaN), photoBox(400 / 440), 'a missing shape falls back to the drawing\'s');

  // An area marked over the middle of a square photo is the middle of the fitted photo, whatever its pixel size.
  const areas = areasFromFractions({ backNumber: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } }, 1, 'TSHIRT');
  assert.deepEqual(areas.backNumber, { x: 100, y: 120, w: 200, h: 200 });
  // Areas not marked fall back to the drawn shirt's own, so nothing is left without a place.
  assert.deepEqual(areas.frontCentre, areasFor('tee-crew').frontCentre);
  assert.deepEqual(areasFromFractions(null, 1, 'JERSEY').backName, areasFor('jersey-short').backName);
});
