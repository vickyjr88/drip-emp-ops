import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import sharp from 'sharp';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SHARE_CHANNELS, affiliateKitSize, affiliateLink, buildAffiliateCaption, isAffiliate, pickDaily } from '../src/share-kit/share-kit';
import { ShareKitService } from '../src/share-kit/share-kit.service';
import { STATUS_HEIGHT, STATUS_WIDTH, statusOverlay } from '../src/social-posting/status-image';
import { PostableProduct } from '../src/social-posting/social-post';

const NOW = new Date('2026-11-20T09:00:00Z');
const product = (n: number, over: Partial<PostableProduct> = {}): PostableProduct => ({
  id: `P${String(n).padStart(3, '0')}`, slug: `shoe-${n}`, name: `Shoe ${n}`, brand: 'Nike', categoryName: 'Sneakers',
  imageUrl: `https://cdn.example.test/p${n}.jpg`, priceFrom: 4200, priceTo: 4200, offer: null,
  sizesInStock: ['EUR 40', 'EUR 41', 'EUR 42'], stockUnits: 9, createdAt: new Date('2026-09-01T00:00:00Z'), ...over,
});
const catalogue = Array.from({ length: 30 }, (_, i) => product(i + 1));

const saved = { ...process.env };
afterEach(() => { for (const k of ['AFFILIATE_KIT_COUNT']) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

// --- the rules --------------------------------------------------------------------------------------------------------------

test('an affiliate is a reseller or wholesale customer with a code; nobody else is', () => {
  assert.equal(isAffiliate({ priceTier: 'RESELLER', referralCode: 'kZ3F9pQd' }), true);
  assert.equal(isAffiliate({ priceTier: 'WHOLESALE', referralCode: 'abc' }), true);
  assert.equal(isAffiliate({ priceTier: 'RETAIL', referralCode: 'abc' }), false);
  assert.equal(isAffiliate({ priceTier: 'RESELLER', referralCode: null }), false);
  assert.equal(isAffiliate({ priceTier: 'RESELLER', referralCode: '' }), false);
  for (const nobody of [null, undefined, {}]) assert.equal(isAffiliate(nobody as any), false);
});

test('the kit is six products unless set, and only whole numbers from 1 to 12 are taken', () => {
  assert.equal(affiliateKitSize({}), 6);
  assert.equal(affiliateKitSize({ AFFILIATE_KIT_COUNT: '3' }), 3);
  assert.equal(affiliateKitSize({ AFFILIATE_KIT_COUNT: '12' }), 12);
  for (const bad of ['0', '13', '-2', '2.5', 'many', '']) assert.equal(affiliateKitSize({ AFFILIATE_KIT_COUNT: bad }), 6, bad);
});

test('the link is the product page with the affiliate\'s code and a tag for where it was shared', () => {
  assert.equal(affiliateLink('https://dripemporium.store/', 'nike-af1', 'kZ3F9pQd'), 'https://dripemporium.store/shop/nike-af1?ref=kZ3F9pQd&utm_source=whatsapp&utm_medium=social&utm_campaign=affiliate');
  assert.match(affiliateLink('https://x.test', 'a', 'k', 'facebook'), /utm_source=facebook&utm_medium=social&utm_campaign=affiliate$/);
  assert.match(affiliateLink('https://x.test', 'a', 'a b&c'), /ref=a%20b%26c&/, 'a code is never allowed to break out of its parameter');
  assert.deepEqual(SHARE_CHANNELS, ['whatsapp', 'facebook', 'instagram', 'tiktok', 'x', 'telegram', 'link']);
});

test('the text says what it is, what it costs, what is in stock, and carries the link on its own line', () => {
  const link = 'https://dripemporium.store/shop/shoe-1?ref=K&utm_source=whatsapp&utm_medium=social&utm_campaign=affiliate';
  assert.equal(buildAffiliateCaption(product(1), link), `Shoe 1\n💰 KES 4,200\n📏 EUR 40–42\n\n🛒 Order here:\n${link}`);
  assert.match(buildAffiliateCaption(product(1, { offer: { price: 3500, was: 4500 } }), link), /🔥 KES 3,500 \(was KES 4,500\)/);
  assert.match(buildAffiliateCaption(product(1, { priceTo: 6000 }), link), /💰 From KES 4,200/);
  assert.ok(!buildAffiliateCaption(product(1, { sizesInStock: [] }), link).includes('📏'));
});

test('the day\'s products: the right number, no repeats, the same for everyone on a day, different on another, and drawn from the better sellers', () => {
  const a = pickDaily(catalogue, '2026-11-20', 6, NOW);
  assert.equal(a.length, 6);
  assert.equal(new Set(a.map((p) => p.id)).size, 6);
  assert.deepEqual(pickDaily([...catalogue].reverse(), '2026-11-20', 6, NOW).map((p) => p.id), a.map((p) => p.id), 'the order products arrive in does not matter');
  assert.notDeepEqual(pickDaily(catalogue, '2026-11-21', 6, NOW).map((p) => p.id), a.map((p) => p.id));
  assert.equal(pickDaily(catalogue.slice(0, 3), '2026-11-20', 6, NOW).length, 3, 'a small shelf gives what there is');
  assert.deepEqual(pickDaily([], '2026-11-20', 6, NOW), []);

  // Poor sellers (one size, almost no stock) are never in the pool while there are plenty of better ones.
  const poor = Array.from({ length: 10 }, (_, i) => product(100 + i, { sizesInStock: ['EUR 40'], stockUnits: 1 }));
  for (let d = 1; d <= 20; d++) {
    const ids = pickDaily([...poor, ...catalogue], `2026-12-${String(d).padStart(2, '0')}`, 6, NOW).map((p) => p.id);
    assert.ok(ids.every((id) => !id.startsWith('P1')), `day ${d}: ${ids.join(',')}`);
  }
});

test('the affiliate picture points at the link in the text and does not carry the shop\'s own chat number', () => {
  const facts = { whatsapp: 'https://wa.me/254113206481', site: 'https://dripemporium.store' };
  const shop = statusOverlay(product(1), facts);
  const affiliate = statusOverlay(product(1), { ...facts, mode: 'affiliate' });
  assert.notEqual(shop, affiliate);
  assert.match(affiliate, new RegExp(`width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}"`));
  assert.ok(!affiliate.includes('NaN'));
  // The shop's picture has a second part on its last line (the WhatsApp number); the affiliate's has only the address.
  assert.ok(shop.length > affiliate.length);
  assert.equal(statusOverlay(product(1), { ...facts, mode: 'shop' }), shop, 'shop is the default');
});

// --- the service ----------------------------------------------------------------------------------------------------------------

async function service() {
  const jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#884422' } }).jpeg().toBuffer();
  const realFetch = global.fetch;
  global.fetch = (async (input: any) => (String(input).startsWith('https://cdn.example.test/') ? new Response(jpeg, { status: 200 }) : realFetch(input))) as any;
  const storefront = { postableProducts: async () => catalogue.map((p) => ({ ...p })) } as any;
  const pages = { findOne: async () => { throw new Error('no site content in a test'); } } as any;
  return { svc: new ShareKitService(storefront, pages, {} as any), restore: () => { global.fetch = realFetch; } };
}

const affiliate = { id: 'c1', firstName: 'Wanjiru', priceTier: 'RESELLER', referralCode: 'kZ3F9pQd' };

test('an affiliate gets today\'s kit, every link carrying their own code; a shopper or a customer with no code is refused', async () => {
  const { svc, restore } = await service();
  try {
    const kit = await svc.today(affiliate, NOW);
    assert.equal(kit.day, '2026-11-20');
    assert.equal(kit.items.length, 6);
    for (const item of kit.items) {
      assert.match(item.link, /\/shop\/shoe-\d+\?ref=kZ3F9pQd&utm_source=whatsapp&utm_medium=social&utm_campaign=affiliate$/);
      assert.ok(item.caption.endsWith(item.link), 'the link is the last line of the text');
      assert.ok(item.caption.startsWith(item.name));
    }
    // Another affiliate sees the same products, with their own code.
    const other = await svc.today({ id: 'c2', priceTier: 'WHOLESALE', referralCode: 'zzTop123' }, NOW);
    assert.deepEqual(other.items.map((i) => i.slug), kit.items.map((i) => i.slug));
    assert.ok(other.items.every((i) => i.link.includes('ref=zzTop123') && !i.link.includes('kZ3F9pQd')));

    await assert.rejects(() => svc.today({ id: 'c3', priceTier: 'RETAIL', referralCode: null }, NOW), ForbiddenException);
    await assert.rejects(() => svc.today({ id: 'c4', priceTier: 'RESELLER', referralCode: null }, NOW), ForbiddenException);
  } finally { restore(); }
});

test('an affiliate can have the picture for any product in stock with a photo; anything else is not found, and a shopper is refused', async () => {
  const { svc, restore } = await service();
  try {
    const picture = await svc.picture(affiliate, 'shoe-7');
    const meta = await sharp(picture).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', STATUS_WIDTH, STATUS_HEIGHT]);
    await assert.rejects(() => svc.picture(affiliate, 'not-a-product'), NotFoundException);
    await assert.rejects(() => svc.picture({ id: 'c3', priceTier: 'RETAIL', referralCode: null }, 'shoe-7'), ForbiddenException);
  } finally { restore(); }
});
