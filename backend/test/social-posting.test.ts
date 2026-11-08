import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { SocialPostingService } from '../src/social-posting/social-posting.service';
import {
  PostableProduct, buildCaption, cleanTimes, dueSlots, isPostable, nextSlot, pickProduct, postLink,
} from '../src/social-posting/social-post';

const DAY = 86_400_000;
const product = (over: Partial<PostableProduct> = {}): PostableProduct => ({
  id: 'TP_1', slug: 'nike-air-force-1', name: 'Nike Air Force 1 White', brand: 'Nike', categoryName: 'Sneakers',
  imageUrl: 'https://cdn.dripemporium.store/af1.jpg', priceFrom: 4200, priceTo: 4200, offer: null,
  sizesInStock: ['42', '40', '41'], stockUnits: 9, createdAt: new Date('2026-10-01T00:00:00Z'), ...over,
});
const ctx = { origin: 'https://dripemporium.store', whatsapp: 'https://wa.me/254113206481', location: 'Dubai Merchants Mall shop F53, Ronald Ngala Street, Nairobi' };

// --- the post -------------------------------------------------------------------------------------------------------------

test('the post carries the name, price, sizes in order, a tagged link, WhatsApp, the location and hashtags', () => {
  const text = buildCaption(product(), ctx, '2026-11-08');
  assert.match(text, /Nike Air Force 1 White/);
  assert.match(text, /💰 KES 4,200/);
  assert.match(text, /Sizes available: 40, 41, 42/);
  assert.match(text, /https:\/\/dripemporium\.store\/shop\/nike-air-force-1\?utm_source=facebook&utm_medium=social&utm_campaign=autopost/);
  assert.match(text, /https:\/\/wa\.me\/254113206481/);
  assert.match(text, /📍 Dubai Merchants Mall/);
  assert.match(text, /#DripEmporium #NairobiShoes #Nike$/);
  assert.equal(buildCaption(product(), ctx, '2026-11-08'), text); // the same product and day always reads the same
  assert.equal(postLink('https://dripemporium.store/', 'x', 'threads'), 'https://dripemporium.store/shop/x?utm_source=threads&utm_medium=social&utm_campaign=autopost');
});

test('an offer shows both prices, a range says "From", and a product with no sizes has no size line', () => {
  assert.match(buildCaption(product({ offer: { price: 3500, was: 4500 } }), ctx, 'd'), /🔥 KES 3,500 \(was KES 4,500\)/);
  assert.match(buildCaption(product({ priceFrom: 3000, priceTo: 5000 }), ctx, 'd'), /💰 From KES 3,000/);
  assert.doesNotMatch(buildCaption(product({ sizesInStock: [], brand: null }), ctx, 'd'), /Sizes available|#undefined|# /);
  const many = buildCaption(product({ sizesInStock: Array.from({ length: 14 }, (_, i) => String(36 + i)) }), ctx, 'd');
  assert.match(many, /36, 37, 38, 39, 40, 41, 42, 43, 44, 45 and more/);
  const openings = new Set(Array.from({ length: 30 }, (_, i) => buildCaption(product({ id: `P${i}` }), ctx, 'd').split('\n')[0]));
  assert.ok(openings.size > 3, 'the openings vary between products');
});

test('only a product a shopper could buy, with an https photo and a price, is good enough to post unattended', () => {
  assert.equal(isPostable(product()), true);
  for (const bad of [null, product({ name: 'ab' }), product({ imageUrl: '' }), product({ imageUrl: 'http://x/y.jpg' }), product({ priceFrom: 0 }), product({ slug: '' })]) assert.equal(isPostable(bad as any), false);
  assert.equal(isPostable({ ...product(), imageUrl: null }), false);
});

// --- when -----------------------------------------------------------------------------------------------------------------

test('slots are Nairobi times; one is due from its time until 90 minutes after, and a missed one is dropped', () => {
  assert.deepEqual(cleanTimes(['19:00', '9:00', '09:00', 'noon', '13:00', '25:00']), ['09:00', '13:00', '19:00']);
  const times = ['09:00', '13:00', '19:00'];
  assert.deepEqual(dueSlots(new Date('2026-11-08T05:59:00Z'), times), []); // 08:59 EAT
  assert.deepEqual(dueSlots(new Date('2026-11-08T06:00:00Z'), times).map((s) => s.slotKey), ['2026-11-08@09:00']);
  assert.equal(dueSlots(new Date('2026-11-08T06:00:00Z'), times)[0].scheduledFor.toISOString(), '2026-11-08T06:00:00.000Z');
  assert.deepEqual(dueSlots(new Date('2026-11-08T07:30:00Z'), times).map((s) => s.slotKey), ['2026-11-08@09:00']); // 10:30, the last minute
  assert.deepEqual(dueSlots(new Date('2026-11-08T07:31:00Z'), times), []); // 10:31: dropped
  assert.deepEqual(dueSlots(new Date('2026-11-08T21:30:00Z'), times).map((s) => s.slotKey), []); // 00:30 next day, nothing
  assert.equal(nextSlot(new Date('2026-11-08T08:00:00Z'), times)!.toISOString(), '2026-11-08T10:00:00.000Z'); // 11:00 EAT -> 13:00
  assert.equal(nextSlot(new Date('2026-11-08T17:00:00Z'), times)!.toISOString(), '2026-11-09T06:00:00.000Z'); // after 19:00 -> tomorrow 09:00
  assert.equal(nextSlot(new Date(), []), null);
});

// --- which ----------------------------------------------------------------------------------------------------------------

test('never-posted products go first (best stocked first), then whichever was posted longest ago; the cooldown holds', () => {
  const now = new Date('2026-11-08T06:00:00Z');
  const a = product({ id: 'A', brand: 'Nike', sizesInStock: ['40'], stockUnits: 1 });
  const b = product({ id: 'B', brand: 'Adidas', sizesInStock: ['40', '41', '42', '43'], stockUnits: 12 });
  const c = product({ id: 'C', brand: 'Puma' });
  const last = new Map<string, Date>([['C', new Date(now.getTime() - 3 * DAY)]]);
  assert.equal(pickProduct({ candidates: [a, b, c], lastPosted: last, now, cooldownDays: 30 })!.id, 'B');
  assert.equal(pickProduct({ candidates: [a, c], lastPosted: last, now, cooldownDays: 30 })!.id, 'A'); // C is cooling down
  assert.equal(pickProduct({ candidates: [c], lastPosted: last, now, cooldownDays: 30 }), null); // posted 3 days ago: nothing to repeat yet
  const all = new Map<string, Date>([['A', new Date(now.getTime() - 40 * DAY)], ['B', new Date(now.getTime() - 35 * DAY)], ['C', new Date(now.getTime() - 31 * DAY)]]);
  assert.equal(pickProduct({ candidates: [a, b, c], lastPosted: all, now, cooldownDays: 30 })!.id, 'A'); // longest ago
});

test('a small shop repeats the product posted longest ago, but not within a week; two of one brand do not run back to back', () => {
  const now = new Date('2026-11-08T06:00:00Z');
  const only = product({ id: 'ONLY' });
  assert.equal(pickProduct({ candidates: [only], lastPosted: new Map([['ONLY', new Date(now.getTime() - 10 * DAY)]]), now, cooldownDays: 30 })!.id, 'ONLY');
  assert.equal(pickProduct({ candidates: [only], lastPosted: new Map([['ONLY', new Date(now.getTime() - 5 * DAY)]]), now, cooldownDays: 30 }), null);
  const n1 = product({ id: 'N1', brand: 'Nike' });
  const n2 = product({ id: 'N2', brand: 'Nike' });
  const p1 = product({ id: 'P1', brand: 'Puma', sizesInStock: ['40'], stockUnits: 1 });
  assert.equal(pickProduct({ candidates: [n1, n2, p1], lastPosted: new Map(), lastBrand: 'Nike', now, cooldownDays: 30 })!.id, 'P1');
  assert.equal(pickProduct({ candidates: [n1, n2], lastPosted: new Map(), lastBrand: 'Nike', now, cooldownDays: 30 })!.id, 'N1'); // no choice: still posts
});

// --- against a real database (KITS_TEST_DATABASE_URL, a scratch database) and a fake Facebook -------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
type Call = { path: string; method: string; body: any };

async function world(opts: { products?: any[]; responder?: (call: Call) => { status: number; data: any } | null } = {}) {
  process.env.FACEBOOK_PAGE_ID = '111';
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'page-token';
  process.env.FACEBOOK_REPLY_WHATSAPP = '254113206481';
  process.env.FACEBOOK_REPLY_LOCATION = ctx.location;
  process.env.FACEBOOK_REPLY_SITE_URL = ctx.origin;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => { await prisma.socialPost.deleteMany({}); await prisma.socialSetting.deleteMany({}); };
  await cleanup();
  const calls: Call[] = [];
  const realFetch = globalThis.fetch;
  let n = 0;
  (globalThis as any).fetch = async (input: any, init: any) => {
    const path = String(input).replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, '');
    const call = { path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : null };
    calls.push(call);
    const fixed = opts.responder ? opts.responder(call) : null;
    const reply = fixed ?? (call.method === 'DELETE' ? { status: 200, data: { success: true } } : { status: 200, data: { id: `ph_${++n}`, post_id: `111_${1000 + n}` } });
    return new Response(JSON.stringify(reply.data), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  };
  const products = opts.products ?? [product({ id: 'TP_1', brand: 'Nike' }), product({ id: 'TP_2', slug: 'puma-roma', name: 'Puma Roma Black', brand: 'Puma' }), product({ id: 'TP_3', slug: 'adidas-gazelle', name: 'Adidas Gazelle Navy', brand: 'Adidas' })];
  const storefront: any = { postableProducts: async () => products };
  const pages: any = { findOne: async () => ({ content: {} }) };
  const service = new SocialPostingService(prisma as any, storefront, pages);
  const photos = () => calls.filter((c) => c.path === '111/photos');
  const done = async () => { (globalThis as any).fetch = realFetch; await cleanup(); await prisma.$disconnect(); for (const k of ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_REPLY_WHATSAPP', 'FACEBOOK_REPLY_LOCATION', 'FACEBOOK_REPLY_SITE_URL', 'SOCIAL_POSTING']) delete process.env[k]; };
  return { prisma, service, calls, photos, done };
}

// 09:05 Nairobi on 8 Nov 2026
const NINE = new Date('2026-11-08T06:05:00Z');

db('nothing is posted while it is switched off; switched on, a due slot posts the product photo with its caption, once', async () => {
  const w = await world();
  try {
    assert.deepEqual(await w.service.tick(NINE), { posted: 0, skipped: 0, failed: 0 });
    assert.equal(w.calls.length, 0);
    await w.service.updateSettings({ facebookEnabled: true }, 'test');
    assert.equal((await w.service.tick(NINE)).posted, 1);
    assert.equal((await w.service.tick(NINE)).posted, 0); // the slot is taken; checking again changes nothing
    assert.equal(w.photos().length, 1);
    const post = w.photos()[0].body;
    assert.equal(post.published, true);
    assert.match(post.url, /^https:\/\//);
    assert.match(post.caption, /utm_source=facebook&utm_medium=social&utm_campaign=autopost/);
    const row = await w.prisma.socialPost.findFirstOrThrow({});
    assert.deepEqual([row.slotKey, row.status, row.triggeredBy, row.externalId], ['2026-11-08@09:00', 'POSTED', 'schedule', '111_1001']);
    assert.ok(row.postedAt && row.productId && row.caption === post.caption);
  } finally { await w.done(); }
});

db('three slots a day post three different products, and a slot long past is not posted late', async () => {
  const w = await world();
  try {
    await w.service.updateSettings({ facebookEnabled: true }, 'test');
    await w.service.tick(NINE);
    await w.service.tick(new Date('2026-11-08T10:10:00Z')); // 13:10
    await w.service.tick(new Date('2026-11-08T16:10:00Z')); // 19:10
    const ids = (await w.prisma.socialPost.findMany({ where: { status: 'POSTED' } })).map((r) => r.productId);
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    // Enabled late in the evening: the morning slots are gone, only the one still within its 90 minutes would post.
    await w.prisma.socialPost.deleteMany({});
    assert.equal((await w.service.tick(new Date('2026-11-08T14:00:00Z'))).posted, 0); // 17:00: 13:00 slot is 4 hours old
  } finally { await w.done(); }
});

db('with nothing to post the slot is recorded as skipped, with the reason', async () => {
  const w = await world({ products: [] });
  try {
    await w.service.updateSettings({ facebookEnabled: true }, 'test');
    assert.equal((await w.service.tick(NINE)).skipped, 1);
    const row = await w.prisma.socialPost.findFirstOrThrow({});
    assert.deepEqual([row.status, w.photos().length], ['SKIPPED', 0]);
    assert.match(row.detail!, /No product in stock/);
  } finally { await w.done(); }
});

db('when Facebook is unavailable the post is tried again a few minutes later, up to three times; a refusal is not retried', async () => {
  let down = true;
  const w = await world({ responder: (c) => (c.path === '111/photos' && down ? { status: 500, data: { error: { code: 2, message: 'Service unavailable' } } } : null) });
  try {
    await w.service.updateSettings({ facebookEnabled: true }, 'test');
    await w.service.tick(NINE);
    let row = await w.prisma.socialPost.findFirstOrThrow({});
    assert.deepEqual([row.status, row.attempts], ['RETRY', 1]);
    // The test runs at a pretend 09:05; the database stamps rows with the real clock, so put the row back to that time.
    await w.prisma.socialPost.update({ where: { id: row.id }, data: { createdAt: NINE, updatedAt: NINE } });
    await w.service.tick(new Date(NINE.getTime() + 60_000)); // too soon
    assert.equal(w.photos().length, 1);
    down = false;
    assert.equal((await w.service.tick(new Date(NINE.getTime() + 6 * 60_000))).posted, 1);
    row = await w.prisma.socialPost.findFirstOrThrow({});
    assert.deepEqual([row.status, row.attempts], ['POSTED', 2]);
    assert.equal(w.photos().length, 2);
    assert.equal(w.photos()[0].body.caption, w.photos()[1].body.caption); // the same post, not a new pick
  } finally { await w.done(); }

  const refused = await world({ responder: (c) => (c.path === '111/photos' ? { status: 403, data: { error: { code: 200, message: 'Requires pages_manage_posts' } } } : null) });
  try {
    await refused.service.updateSettings({ facebookEnabled: true }, 'test');
    assert.equal((await refused.service.tick(NINE)).failed, 1);
    const row = await refused.prisma.socialPost.findFirstOrThrow({});
    assert.deepEqual([row.status, row.detail], ['FAILED', '200: Requires pages_manage_posts']);
    await refused.service.tick(new Date(NINE.getTime() + 10 * 60_000));
    assert.equal(refused.photos().length, 1);
  } finally { await refused.done(); }
});

db('Post now works with the schedule off, can name a product, and a post can be taken down', async () => {
  const w = await world();
  try {
    const result: any = await w.service.postNow('staff@example.com', 'TP_2');
    assert.equal(result.status, 'POSTED');
    assert.match(w.photos()[0].body.caption, /Puma Roma Black/);
    const row = await w.prisma.socialPost.findFirstOrThrow({});
    assert.deepEqual([row.triggeredBy, row.slotKey.startsWith('manual@')], ['staff@example.com', true]);
    assert.deepEqual(await w.service.remove(row.id), { removed: true, detail: null });
    assert.deepEqual([w.calls.at(-1)!.method, w.calls.at(-1)!.path], ['DELETE', row.externalId]);
    assert.equal((await w.prisma.socialPost.findUniqueOrThrow({ where: { id: row.id } })).status, 'REMOVED');
    assert.equal((await w.service.remove(row.id)).removed, false); // already down
    const missing: any = await w.service.postNow('staff@example.com', 'TP_NOPE');
    assert.equal(missing.status, 'SKIPPED');
  } finally { await w.done(); }
});

db('SOCIAL_POSTING=false stops the schedule and manual posts, and the preview shows the next post without posting', async () => {
  const w = await world();
  try {
    await w.service.updateSettings({ facebookEnabled: true, times: ['10:00', '9:00', 'bad'], cooldownDays: 14 }, 'test');
    assert.deepEqual((await w.service.getSettings()).times, ['09:00', '10:00']);
    const preview = await w.service.preview();
    assert.ok(preview.product && /utm_campaign=autopost/.test(preview.caption!));
    assert.equal(w.calls.length, 0);
    assert.equal(await w.prisma.socialPost.count(), 0);
    process.env.SOCIAL_POSTING = 'false';
    assert.equal((await w.service.tick(NINE)).posted, 0);
    assert.equal((await w.service.postNow('x') as any).status, 'FAILED');
    assert.equal(w.calls.length, 0);
    assert.equal((await w.service.status()).allowed, false);
  } finally { await w.done(); }
});
