import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { CLUB_SEEDS, DEFAULT_PRINT_PRICING, KIT_FONTS, KIT_TEMPLATES, editionsFor } from '../src/kits/kit-catalogue';
import {
  cleanDesign, cleanName, cleanNumber, describeDesign, isBlockedText, isPersonalised, printFee,
} from '../src/kits/kit-design';
import { KitsEnabledGuard, KitsFlagService } from '../src/kits/kits.flag';
import { KitsService, parsePrintPricing } from '../src/kits/kits.service';
import { RateLimiter } from '../src/kits/kit-rate-limit';
import { StorefrontService } from '../src/storefront/storefront.service';
import { PageContentService } from '../src/page-content/page-content.service';

// ---------------------------------------------------------------------------
// Pure rules: no database needed
// ---------------------------------------------------------------------------

const colors = { primary: '#ef0107', secondary: '#ffffff', trim: '#ffffff', pattern: 'solid', sleeves: 'secondary' } as const;
const rules = { allowName: true, allowNumber: true, allowArtwork: false, templateKey: 'jersey-short' };
const base = { v: 1, templateKey: 'jersey-short', colors };
const ART = 'https://api.dripemporium.store/media/0f8fad5b-d9cb-469f-a165-70867728950e.png';

test('names are upper-cased, trimmed and limited to 12 letters', () => {
  assert.equal(cleanName('  saka '), 'SAKA');
  assert.equal(cleanName("o'neil-jones"), "O'NEIL-JONES");
  assert.throws(() => cleanName('ABCDEFGHIJKLM'), /12 characters/);
  assert.throws(() => cleanName(''), /Type a name/);
  assert.throws(() => cleanName('R2D2'), /letters/);
  assert.throws(() => cleanName('<script>'), /letters/);
});

test('numbers are 0 to 99', () => {
  assert.equal(cleanNumber('07'), '7');
  assert.equal(cleanNumber('99'), '99');
  assert.equal(cleanNumber('0'), '0');
  assert.throws(() => cleanNumber('100'), /0 to 99/);
  assert.throws(() => cleanNumber('-1'), /0 to 99/);
  assert.throws(() => cleanNumber('7a'), /0 to 99/);
});

test('blocked words are caught through spacing and look-alike characters', () => {
  assert.equal(isBlockedText('Sh1t'), true);
  assert.equal(isBlockedText('f u c k'), true);
  assert.equal(isBlockedText('Saka'), false);
  assert.equal(isBlockedText('Scunthorpe'), true, 'an over-broad match is accepted: staff review the queue, and a refused name can be retyped');
  assert.throws(() => cleanName('Hitler'), /cannot be printed/);
});

test('print fee: name, number, bundle, text and artwork', () => {
  const pricing = { ...DEFAULT_PRINT_PRICING };
  const spec = (over: object) => cleanDesign({ ...base, ...over }, { ...rules, allowArtwork: true });
  const name = { text: 'Saka', fontKey: 'condensed', color: '#ffffff' };
  const number = { value: '7', fontKey: 'condensed', color: '#ffffff' };
  assert.equal(printFee(spec({}), pricing), 0);
  assert.equal(printFee(spec({ name }), pricing), pricing.nameFeeKes);
  assert.equal(printFee(spec({ number }), pricing), pricing.numberFeeKes);
  assert.equal(printFee(spec({ name, number }), pricing), pricing.nameAndNumberFeeKes, 'the bundle replaces the two separate fees');
  const item = { id: 'a', kind: 'artwork', side: 'front', artworkUrl: ART, x: 0.5, y: 0.5, scale: 0.5, rotation: 0 };
  const text = { id: 'b', kind: 'text', side: 'front', text: 'Hello', fontKey: 'heavy', color: '#000000', x: 0.5, y: 0.5, scale: 0.5, rotation: 0 };
  assert.equal(printFee(spec({ items: [item, text] }), pricing), pricing.artworkFeeKes + pricing.textFeeKes);
  assert.equal(printFee(spec({ name, number, items: [item] }), pricing), pricing.nameAndNumberFeeKes + pricing.artworkFeeKes);
});

test('a design is refused when the shirt does not allow it', () => {
  assert.throws(() => cleanDesign({ ...base, name: { text: 'Saka', fontKey: 'condensed', color: '#ffffff' } }, { ...rules, allowName: false }), /name cannot/);
  assert.throws(() => cleanDesign({ ...base, number: { value: '7', fontKey: 'condensed', color: '#ffffff' } }, { ...rules, allowNumber: false }), /number cannot/);
  const item = { id: 'a', kind: 'artwork', side: 'front', artworkUrl: ART, x: 0.5, y: 0.5, scale: 0.5, rotation: 0 };
  assert.throws(() => cleanDesign({ ...base, items: [item] }, rules), /cannot be added/);
  assert.throws(() => cleanDesign({ ...base, templateKey: 'tee-crew' }, rules), /different shirt/);
  assert.throws(() => cleanDesign({ ...base, templateKey: 'nope' }, rules), /Unknown shirt/);
  assert.throws(() => cleanDesign({ ...base, v: 2 }, rules), /supported format/);
});

test('fonts, colours and artwork addresses are checked', () => {
  const ok = { text: 'Saka', fontKey: 'condensed', color: '#ffffff' };
  assert.throws(() => cleanDesign({ ...base, name: { ...ok, fontKey: 'comic-sans' } }, rules), /font/);
  assert.throws(() => cleanDesign({ ...base, name: { ...ok, color: 'white' } }, rules), /colour/);
  assert.throws(() => cleanDesign({ ...base, colors: { ...colors, pattern: 'plaid' } }, rules), /pattern/);
  const art = (artworkUrl: string) => ({ id: 'a', kind: 'artwork', side: 'front', artworkUrl, x: 0.5, y: 0.5, scale: 0.5, rotation: 0 });
  const withArt = { ...rules, allowArtwork: true };
  assert.throws(() => cleanDesign({ ...base, items: [art('https://evil.example/x.png')] }, withArt), /uploaded here/);
  assert.throws(() => cleanDesign({ ...base, items: [art('javascript:alert(1)')] }, withArt), /uploaded here/);
  assert.ok(cleanDesign({ ...base, items: [art(ART)] }, withArt));
});

test('item position, size and count are bounded', () => {
  const withArt = { ...rules, allowArtwork: true };
  const text = (over: object) => ({ id: 'b', kind: 'text', side: 'back', text: 'Hi', fontKey: 'tall', color: '#000000', x: 0.5, y: 0.5, scale: 0.5, rotation: 0, ...over });
  assert.throws(() => cleanDesign({ ...base, items: [text({ x: 1.5 })] }, withArt), /out of range/);
  assert.throws(() => cleanDesign({ ...base, items: [text({ scale: 0.01 })] }, withArt), /out of range/);
  assert.throws(() => cleanDesign({ ...base, items: [text({ text: 'x'.repeat(25) })] }, withArt), /24 characters/);
  assert.throws(() => cleanDesign({ ...base, items: Array.from({ length: 7 }, (_, i) => text({ id: `t${i}` })) }, withArt), /up to 6/);
});

test('the stored design is the cleaned copy, not the raw request', () => {
  const spec = cleanDesign({ ...base, name: { text: '  saka ', fontKey: 'condensed', color: '#FFFFFF', extra: 'ignored' }, hacked: true } as any, rules);
  assert.equal(spec.name!.text, 'SAKA');
  assert.equal(spec.name!.color, '#ffffff');
  assert.equal((spec as any).hacked, undefined);
  assert.equal(isPersonalised(spec), true);
  assert.equal(isPersonalised(cleanDesign(base, rules)), false);
  assert.match(describeDesign(spec), /Name "SAKA"/);
});

test('print fees typed in the CMS are read as whole shillings, with defaults for blanks and nonsense', () => {
  assert.deepEqual(parsePrintPricing({ print: { nameFee: '650', numberFee: ' 350 ', nameAndNumberFee: 'KES 900', artworkFee: '', textFee: 'abc' } }), {
    nameFeeKes: 650, numberFeeKes: 350, nameAndNumberFeeKes: 900, artworkFeeKes: DEFAULT_PRINT_PRICING.artworkFeeKes, textFeeKes: DEFAULT_PRINT_PRICING.textFeeKes,
  });
  assert.deepEqual(parsePrintPricing(undefined), DEFAULT_PRINT_PRICING);
  assert.equal(parsePrintPricing({ print: { nameFee: '-5' } }).nameFeeKes, DEFAULT_PRINT_PRICING.nameFeeKes);
});

test('the catalogue data is coherent: every club has colours, fonts exist, templates match their kind', () => {
  const slugs = new Set<string>();
  for (const club of CLUB_SEEDS) {
    assert.ok(!slugs.has(club.slug), `duplicate ${club.slug}`);
    slugs.add(club.slug);
    const e = editionsFor(club.home);
    for (const edition of [e.home, e.away, e.third]) {
      assert.match(edition.primary, /^#[0-9a-f]{6}$/i);
      assert.match(edition.secondary, /^#[0-9a-f]{6}$/i);
      assert.match(edition.trim, /^#[0-9a-f]{6}$/i);
    }
    assert.notEqual(e.away.primary, e.home.primary, `${club.slug}: the away shirt differs from home`);
  }
  assert.equal(CLUB_SEEDS.filter((c) => c.league === 'EPL').length >= 20, true);
  assert.equal(new Set(KIT_FONTS.map((f) => f.key)).size, KIT_FONTS.length);
  assert.ok(KIT_TEMPLATES.some((t) => t.kind === 'JERSEY') && KIT_TEMPLATES.some((t) => t.kind === 'TSHIRT'));
});

test('the rate limiter lets a few through and then refuses until the window passes', () => {
  const limiter = new RateLimiter(3, 1000);
  limiter.check('a', 0); limiter.check('a', 10); limiter.check('a', 20);
  assert.throws(() => limiter.check('a', 30), /Too many/);
  limiter.check('b', 30);
  limiter.check('a', 1100);
});

// ---------------------------------------------------------------------------
// Database tests: need KITS_TEST_DATABASE_URL (a SCRATCH database with every migration applied: these tests delete every kit in it)
// ---------------------------------------------------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;

async function setup() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const storefront = new StorefrontService(prisma as any);
  const pageContent = new PageContentService(prisma as any);
  const flag = new KitsFlagService(prisma as any);
  const uploaded: any[] = [];
  const media: any = { uploadProjectAsset: async (file: any) => { uploaded.push(file); return { url: 'https://api.test/media/0f8fad5b-d9cb-469f-a165-70867728950e.png' }; } };
  const service = new KitsService(prisma as any, storefront, pageContent, media, flag);
  // Orders from earlier runs hold the test variants, so they go first.
  // The database is a scratch one (see above), so every kit from an earlier run, or a demo, is cleared too: the club and
  // search assertions count kits.
  await prisma.orderLine.deleteMany({ where: { variant: { OR: [{ sku: { startsWith: 'KTEST' } }, { product: { line: 'KIT' } }] } } });
  await prisma.order.deleteMany({ where: { lines: { none: {} }, OR: [{ customerEmail: 'ktest-buyer@example.com' }, { createdBy: 'storefront' }] } });
  await prisma.kitDesign.deleteMany();
  await prisma.product.deleteMany({ where: { OR: [{ sku: { startsWith: 'KTEST' } }, { line: 'KIT' }] } });
  await service.ensureSeed();
  return { prisma, storefront, service, flag, pageContent, uploaded };
}

async function makeShoe(prisma: PrismaClient) {
  const category = await prisma.productCategory.upsert({ where: { slug: 'ktest-shoes' }, update: {}, create: { name: 'KTest Shoes', slug: 'ktest-shoes' } });
  return prisma.product.create({
    data: {
      sku: 'KTEST-SHOE', name: 'KTest Runner', slug: 'ktest-runner', brand: 'Nike', categoryId: category.id, isFeatured: true, imageUrls: ['https://api.test/media/shoe.jpg'],
      variants: { create: [{ sku: 'KTEST-SHOE-42', name: 'EUR 42', attributes: { size: 'EUR 42' }, priceKes: 5000 }] },
    },
  });
}

db('a kit never appears anywhere on the shoe side (the leak test)', async () => {
  const { prisma, storefront, service } = await setup();
  await makeShoe(prisma);
  const kit = await service.adminCreate({
    name: 'KTest Arsenal Home Jersey', kind: 'JERSEY', clubSlug: 'arsenal', edition: 'HOME', season: '2025/26', templateKey: 'jersey-short',
    skuPrefix: 'KTEST-ARS', imageUrls: ['https://api.test/media/x.jpg'],
    sizes: [{ size: 'M', priceKes: 3500 }, { size: 'L', priceKes: 3500 }],
  } as any);
  // Make the kit as tempting to the shoe code as possible.
  await prisma.product.update({ where: { id: kit.id }, data: { isFeatured: true, brand: 'Nike' } });

  const shopList = await storefront.list({});
  assert.ok(shopList.some((p) => p.slug === 'ktest-runner'), 'the shoe is listed');
  assert.equal(shopList.some((p) => p.slug === kit.slug), false, '/shop/products');
  assert.equal((await storefront.list({ search: 'Arsenal' })).some((p) => p.slug === kit.slug), false, 'search');
  assert.equal((await storefront.list({ search: 'arsnal jersy' })).some((p) => p.slug === kit.slug), false, 'fuzzy search');
  assert.equal((await storefront.list({ size: 'M' })).some((p) => p.slug === kit.slug), false, 'size filter');
  assert.equal((await storefront.list({ brand: 'Nike' })).some((p) => p.slug === kit.slug), false, 'brand filter');
  assert.equal((await storefront.featured(200)).some((p) => p.slug === kit.slug), false, 'featured rail');
  await assert.rejects(() => storefront.bySlug(kit.slug), /No product/);
  assert.equal((await storefront.categories()).some((c) => c.slug === 'kits'), false, 'the Kits category is not a shop category');
  assert.equal((await prisma.productCategory.findUnique({ where: { slug: 'kits' } }))!.isActive, false, 'and it is created inactive, so /shop/category/kits is not a page');
  assert.deepEqual(await storefront.list({ category: 'kits' }), [], 'a shop category query for it finds nothing');
  const filters = await storefront.filters();
  assert.equal(filters.sizes.includes('M'), false, 'the kit size is not a shop size filter');
  const csv = await storefront.catalogCsv();
  assert.equal(csv.includes('KTEST-ARS'), false, 'the Meta catalogue feed');
  assert.ok(csv.includes('KTEST-SHOE-42'));
  // And the reverse: the kits side lists the kit and not the shoe.
  const kits = await service.list({});
  assert.ok(kits.some((p) => p.slug === kit.slug));
  assert.equal(kits.some((p) => p.slug === 'ktest-runner'), false);
  await assert.rejects(() => service.bySlug('ktest-runner'), /No kit/);
  await prisma.$disconnect();
});

db('the on/off switch starts off, is controlled from the database, and an env override forces it off', async () => {
  const { prisma, flag } = await setup();
  await prisma.kitSettings.deleteMany();
  delete process.env.KITS_ENABLED;
  const fresh = new KitsFlagService(prisma as any);
  assert.equal(await fresh.isEnabled(), false, 'off until an admin turns it on');
  const guard = new KitsEnabledGuard(fresh);
  await assert.rejects(() => guard.canActivate(), /Not Found/);

  assert.equal((await fresh.set(true, 'admin@x')).enabled, true);
  assert.equal(await guard.canActivate(), true);
  assert.equal((await fresh.status()).updatedBy, 'admin@x');

  process.env.KITS_ENABLED = 'false';
  assert.equal(await fresh.isEnabled(), false, 'the emergency override wins');
  assert.deepEqual([(await fresh.status()).switchedOn, (await fresh.status()).forcedOff, (await fresh.status()).enabled], [true, true, false]);
  delete process.env.KITS_ENABLED;

  assert.equal((await fresh.set(false, 'admin@x')).enabled, false);
  await assert.rejects(() => guard.canActivate(), /Not Found/);
  await prisma.$disconnect();
});

db('clubs are seeded once and searching understands nicknames', async () => {
  const { prisma, service } = await setup();
  const before = await prisma.kitClub.count();
  await service.ensureSeed();
  assert.equal(await prisma.kitClub.count(), before, 'seeding twice adds nothing');
  assert.ok(before >= 40);
  await service.adminCreate({ name: 'KTest Spurs Home', kind: 'JERSEY', clubSlug: 'tottenham-hotspur', edition: 'HOME', templateKey: 'jersey-short', skuPrefix: 'KTEST-TOT', sizes: [{ size: 'M', priceKes: 3000 }] } as any);
  await service.adminCreate({ name: 'KTest Man United Home', kind: 'JERSEY', clubSlug: 'manchester-united', edition: 'HOME', templateKey: 'jersey-short', skuPrefix: 'KTEST-MUN', sizes: [{ size: 'M', priceKes: 3000 }] } as any);
  assert.deepEqual((await service.list({ search: 'spurs' })).map((p) => p.sku ?? p.name), ['KTest Spurs Home']);
  assert.deepEqual((await service.list({ search: 'man u' })).map((p) => p.name), ['KTest Man United Home']);
  assert.equal((await service.list({ club: 'manchester-united' })).length, 1);
  assert.equal((await service.list({ league: 'EPL' })).length >= 2, true);
  assert.equal((await service.list({ size: 'XL' })).length, 0);
  const page = await service.clubPage('manchester-united');
  assert.equal(page.products.length, 1);
  assert.equal(page.products[0].kit.club!.slug, 'manchester-united');
  assert.equal(page.products[0].kit.colors.primary, '#da291c');
  await assert.rejects(() => service.clubPage('nope'), /No such club/);
  const withKits = (await service.clubs()).map((c) => c.slug);
  assert.ok(withKits.includes('tottenham-hotspur') && withKits.includes('manchester-united'), 'clubs with a kit on sale are listed');
  assert.equal(withKits.includes('barcelona'), false, 'a club with no kit on sale is not');
  assert.ok((await service.clubs({ all: true })).length >= 40);
  await prisma.$disconnect();
});

db('saving a design validates it for that shirt, prices it on the server and stores the cleaned copy', async () => {
  const { prisma, service } = await setup();
  const kit = await service.adminCreate({ name: 'KTest Design Jersey', kind: 'JERSEY', clubSlug: 'liverpool', edition: 'HOME', templateKey: 'jersey-short', skuPrefix: 'KTEST-DES', sizes: [{ size: 'M', priceKes: 3000 }] } as any);
  const spec = { v: 1, templateKey: 'jersey-short', colors, name: { text: 'salah', fontKey: 'tall', color: '#ffffff' }, number: { value: '11', fontKey: 'tall', color: '#ffffff' }, items: [], priceKes: 1 };
  const saved = await service.saveDesign(kit.slug, spec);
  assert.equal(saved.feeKes, DEFAULT_PRINT_PRICING.nameAndNumberFeeKes, 'the client\'s own price is ignored');
  assert.equal(saved.spec.name!.text, 'SALAH');
  assert.equal((saved.spec as any).priceKes, undefined);
  const again = await service.getDesign(saved.token);
  assert.equal(again.feeKes, saved.feeKes);
  assert.equal(again.productSlug, kit.slug);
  assert.ok(saved.token.length >= 16);

  await assert.rejects(() => service.saveDesign('ktest-runner', spec), /not available/);
  await assert.rejects(() => service.saveDesign(kit.slug, { ...spec, name: { text: 'x'.repeat(20), fontKey: 'tall', color: '#ffffff' } }), /12 characters/);
  await assert.rejects(() => service.getDesign('nope'), /not found/);

  // Staff change the fee in the CMS: the next quote uses it.
  await prisma.pageContent.upsert({ where: { slug: 'kits' }, update: { content: { print: { nameAndNumberFee: '1000' } } }, create: { slug: 'kits', content: { print: { nameAndNumberFee: '1000' } } } });
  assert.equal((await service.saveDesign(kit.slug, spec)).feeKes, 1000);
  await prisma.pageContent.deleteMany({ where: { slug: 'kits' } });
  await prisma.$disconnect();
});

db('a preview is attached once, and artwork must be a real picture', async () => {
  const { prisma, service, uploaded } = await setup();
  const sharp = (await import('sharp')).default;
  const kit = await service.adminCreate({ name: 'KTest Preview Jersey', kind: 'JERSEY', templateKey: 'jersey-short', skuPrefix: 'KTEST-PRV', sizes: [{ size: 'M', priceKes: 3000 }] } as any);
  const saved = await service.saveDesign(kit.slug, { v: 1, templateKey: 'jersey-short', colors, items: [] });
  const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#336699' } }).png().toBuffer();
  const out = await service.attachPreview(saved.token, { buffer: png });
  assert.match(out.previewUrl, /\/media\//);
  const stored = await sharp(uploaded[uploaded.length - 1].buffer).metadata();
  assert.ok((stored.width ?? 0) <= 1400, 'previews are bounded');
  await assert.rejects(() => service.attachPreview(saved.token, { buffer: png }), /already has a preview/);

  await assert.rejects(() => service.uploadArtwork({ buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>') }), /cannot read|PNG, JPEG/);
  await assert.rejects(() => service.uploadArtwork({ buffer: Buffer.from('not an image at all') }), /cannot read|PNG, JPEG/);
  const jpeg = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: '#aa3300' } }).jpeg().toBuffer();
  const art = await service.uploadArtwork({ buffer: jpeg });
  assert.ok(art.width <= 2400 && art.height <= 2400, 'artwork is bounded');
  assert.equal(uploaded[uploaded.length - 1].mimetype, 'image/png', 'artwork is always re-encoded to PNG');
  await prisma.$disconnect();
});

db('staff can create, edit and switch off a kit, and sizes can be supplier-sourced', async () => {
  const { prisma, service } = await setup();
  const kit = await service.adminCreate({
    name: 'KTest Plain Tee', kind: 'TSHIRT', templateKey: 'tee-crew', skuPrefix: 'KTEST-TEE',
    colors: { primary: '#161616', secondary: '#161616', trim: '#161616', pattern: 'solid', sleeves: 'primary' },
    sizes: [{ size: 'M', priceKes: 1500, costKes: 600 }, { size: 'L', priceKes: 1500, isDropShip: true }],
  } as any);
  assert.equal(kit.line, 'KIT');
  assert.equal(kit.kit!.allowArtwork, true, 'a T-shirt allows artwork by default');
  assert.equal(kit.kit!.allowNumber, false, 'a T-shirt does not take a jersey number by default');
  assert.deepEqual(kit.variants.map((v) => [v.sku, v.isDropShip]), [['KTEST-TEE-L', true], ['KTEST-TEE-M', false]]);
  await assert.rejects(() => service.adminCreate({ name: 'x', kind: 'TSHIRT', templateKey: 'jersey-short', skuPrefix: 'KTEST-BAD', sizes: [{ size: 'M', priceKes: 1 }] } as any), /for a jersey/);
  await assert.rejects(() => service.adminCreate({ name: 'x', kind: 'JERSEY', clubSlug: 'atlantis', templateKey: 'jersey-short', skuPrefix: 'KTEST-BAD', sizes: [{ size: 'M', priceKes: 1 }] } as any), /No club/);
  await assert.rejects(() => service.adminCreate({ name: 'dup', kind: 'TSHIRT', templateKey: 'tee-crew', skuPrefix: 'KTEST-TEE', sizes: [{ size: 'M', priceKes: 1 }] } as any), /already exists/);

  const edited = await service.adminUpdate(kit.id, { name: 'KTest Plain Tee Black', isActive: false });
  assert.equal(edited!.name, 'KTest Plain Tee Black');
  assert.equal((await service.list({})).some((p) => p.slug === kit.slug), false, 'an inactive kit is not listed');
  await assert.rejects(() => service.bySlug(kit.slug), /No kit/);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Checkout with a personalised shirt
// ---------------------------------------------------------------------------

async function checkoutHarness() {
  const ctx = await setup();
  const { CheckoutService } = await import('../src/checkout/checkout.service');
  const paystack: any = { configured: true, initialise: async (o: any) => ({ authorization_url: 'https://pay.test/x', reference: o.reference }) };
  const inventory: any = { record: async () => undefined };
  const stub: any = { notifySignup: () => undefined, syncSignup: () => undefined };
  const checkout = new CheckoutService(ctx.prisma as any, inventory, stub, paystack, stub, stub, stub, stub, stub, stub, ctx.service);
  await ctx.prisma.store.upsert({ where: { code: 'KTEST' }, update: { isActive: true }, create: { code: 'KTEST', name: 'KTest Store' } });
  const buyer = { firstName: 'Test', lastName: 'Buyer', email: 'ktest-buyer@example.com', phone: '+254712345678' };
  return { ...ctx, checkout, buyer };
}

db('checkout adds the print fee on the server and keeps a frozen copy for the print queue', async () => {
  const { prisma, service, flag, checkout, buyer } = await checkoutHarness();
  await flag.set(true, 'test');
  const kit = await service.adminCreate({ name: 'KTest Checkout Jersey', kind: 'JERSEY', clubSlug: 'chelsea', edition: 'HOME', templateKey: 'jersey-short', skuPrefix: 'KTEST-CHK', sizes: [{ size: 'M', priceKes: 3000 }] } as any);
  const variantId = kit.variants[0].id;
  const saved = await service.saveDesign(kit.slug, { v: 1, templateKey: 'jersey-short', colors, name: { text: 'palmer', fontKey: 'tall', color: '#ffffff' }, number: { value: '20', fontKey: 'tall', color: '#ffffff' }, items: [] });
  const fee = saved.feeKes;
  assert.equal(fee, DEFAULT_PRINT_PRICING.nameAndNumberFeeKes);

  // The request tries to name its own price; checkout does not look at it.
  const out = await checkout.start({ ...buyer, lines: [{ variantId, quantity: 2, designToken: saved.token, priceKes: 1 } as any] } as any, 'https://shop.test');
  assert.equal(out.total, (3000 + fee) * 2);

  const order = await prisma.order.findUnique({ where: { orderNumber: out.orderNumber }, include: { lines: true } });
  const line = order!.lines[0];
  assert.equal(Number(line.unitPrice), 3000 + fee);
  assert.equal(Number(line.listPrice), 3000 + fee, 'the fee is not a discount or a surcharge in the margin reports');
  assert.equal(Number(line.discount), 0);
  assert.equal(Number(line.printFee), fee * 2);
  assert.equal(line.printStatus, 'AWAITING_REVIEW');
  assert.equal((line.customisation as any).name.text, 'PALMER');
  assert.match(line.description, /personalised/);

  const queue = await service.printQueue();
  const row = queue.find((r) => r.id === line.id)!;
  assert.match(row.summary, /Name "PALMER"/);
  assert.equal(row.orderNumber, out.orderNumber);
  await service.setPrintStatus(line.id, 'APPROVED', 'checked');
  assert.equal((await service.printQueue('APPROVED')).filter((r) => r.id === line.id).length, 1);
  assert.equal((await service.printQueue('READY')).filter((r) => r.id === line.id).length, 0);
  await prisma.$disconnect();
});

db('checkout refuses a design for another shirt, an unknown design, a non-kit item, or any design while the line is off', async () => {
  const { prisma, service, flag, checkout, buyer } = await checkoutHarness();
  await flag.set(true, 'test');
  const one = await service.adminCreate({ name: 'KTest Shirt One', kind: 'JERSEY', templateKey: 'jersey-short', skuPrefix: 'KTEST-ONE', sizes: [{ size: 'M', priceKes: 3000 }] } as any);
  const two = await service.adminCreate({ name: 'KTest Shirt Two', kind: 'JERSEY', templateKey: 'jersey-short', skuPrefix: 'KTEST-TWO', sizes: [{ size: 'M', priceKes: 3000 }] } as any);
  const shoe = await makeShoe(prisma);
  const shoeVariant = (await prisma.productVariant.findFirst({ where: { productId: shoe.id } }))!;
  const design = await service.saveDesign(one.slug, { v: 1, templateKey: 'jersey-short', colors, name: { text: 'Saka', fontKey: 'tall', color: '#ffffff' } });
  const go = (variantId: string, designToken: string) => checkout.start({ ...buyer, lines: [{ variantId, quantity: 1, designToken }] } as any, 'https://shop.test');

  await assert.rejects(() => go(two.variants[0].id, design.token), /different shirt/);
  await assert.rejects(() => go(one.variants[0].id, 'no-such-token'), /not found/);
  await assert.rejects(() => go(shoeVariant.id, design.token), /cannot be personalised/);
  await flag.set(false, 'test');
  await assert.rejects(() => go(one.variants[0].id, design.token), /not available right now/);
  await prisma.$disconnect();
});

db('a plain kit with no design is an ordinary order line', async () => {
  const { prisma, service, flag, checkout, buyer } = await checkoutHarness();
  await flag.set(true, 'test');
  const kit = await service.adminCreate({ name: 'KTest Plain Buy', kind: 'TSHIRT', templateKey: 'tee-crew', skuPrefix: 'KTEST-PLN', sizes: [{ size: 'L', priceKes: 1500 }] } as any);
  const out = await checkout.start({ ...buyer, lines: [{ variantId: kit.variants[0].id, quantity: 1 }] } as any, 'https://shop.test');
  assert.equal(out.total, 1500);
  const line = (await prisma.order.findUnique({ where: { orderNumber: out.orderNumber }, include: { lines: true } }))!.lines[0];
  assert.deepEqual([line.designId, line.printStatus, Number(line.printFee)], [null, null, 0]);
  await prisma.$disconnect();
});

test('sizes sort S, M, L, XL, XXL, 3XL, not alphabetically', async () => {
  const { bySizeOrder } = await import('../src/kits/kits.service');
  const sizes = ['XL', '3XL', 'M', 'L', 'S', 'XXL', 'Kids'].map((size) => ({ size, name: size }));
  assert.deepEqual(sizes.sort(bySizeOrder).map((s) => s.size), ['S', 'M', 'L', 'XL', 'XXL', '3XL', 'Kids']);
});
