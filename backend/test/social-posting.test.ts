import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { SocialPostingService } from '../src/social-posting/social-posting.service';
import {
  PostableProduct, THREADS_LIMIT, buildCaption, buildThreadsCaption, cleanTimes, dueSlots, isPostable, nextSlot, pickProduct, postLink,
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

// --- Threads --------------------------------------------------------------------------------------------------------------

test('the Threads post fits 500 characters whatever the product: the location and sizes go first, then the name is cut, never the link or price', () => {
  const short = buildThreadsCaption(product(), ctx, 'd');
  assert.ok(Array.from(short).length <= THREADS_LIMIT);
  assert.match(short, /utm_source=threads&utm_medium=social&utm_campaign=autopost/);
  assert.match(short, /💰 KES 4,200 · 📏 40, 41, 42/);
  assert.match(short, /📍 Dubai Merchants Mall/);

  const long = buildThreadsCaption(product({ name: 'Nike Air Force 1 Low Retro Premium Limited Edition Triple White With Gum Sole And Reflective Detail '.repeat(5), sizesInStock: Array.from({ length: 14 }, (_, i) => String(36 + i)) }), { ...ctx, location: 'A very long address '.repeat(12) }, 'd');
  assert.ok(Array.from(long).length <= THREADS_LIMIT, `${Array.from(long).length} characters`);
  assert.match(long, /KES 4,200/);
  assert.match(long, /\/shop\/nike-air-force-1\?utm_source=threads/);
  assert.match(long, /…/);
});

type ThreadsCall = { method: string; path: string; body: any; query: URLSearchParams };

async function threadsWorld(responder: (call: ThreadsCall) => { status: number; data: any } | null = () => null, products?: any[]) {
  process.env.THREADS_ACCESS_TOKEN = 'threads-env-token';
  process.env.THREADS_PUBLISH_WAIT_MS = '200';
  process.env.THREADS_POLL_MS = '5';
  const w = await world({ products });
  const threadsCalls: ThreadsCall[] = [];
  const outer = globalThis.fetch;
  let seq = 0;
  (globalThis as any).fetch = async (input: any, init: any) => {
    const u = String(input);
    if (!u.startsWith('https://graph.threads.net/v1.0/')) return outer(input, init);
    const parsed = new URL(u);
    const call: ThreadsCall = { method: init?.method ?? 'GET', path: parsed.pathname.replace('/v1.0/', ''), body: init?.body ? JSON.parse(init.body) : null, query: parsed.searchParams };
    threadsCalls.push(call);
    const fixed = responder(call);
    let reply = fixed;
    if (!reply) {
      if (call.path === 'me') reply = { status: 200, data: { id: '9001', username: 'dripemporium' } };
      else if (call.path === 'refresh_access_token') reply = { status: 200, data: { access_token: 'threads-renewed', token_type: 'bearer', expires_in: 5_184_000 } };
      else if (call.path === '9001/threads') reply = { status: 200, data: { id: `c_${++seq}` } };
      else if (/^c_\d+$/.test(call.path)) reply = { status: 200, data: { status: 'FINISHED' } };
      else if (call.path === '9001/threads_publish') reply = { status: 200, data: { id: `t_${seq}` } };
      else if (/^t_\d+$/.test(call.path) && call.method === 'GET') reply = { status: 200, data: { permalink: `https://www.threads.net/@dripemporium/post/${call.path}` } };
      else if (/^t_\d+$/.test(call.path) && call.method === 'DELETE') reply = { status: 200, data: { success: true } };
      else reply = { status: 404, data: { error: { code: 100, message: 'unknown' } } };
    }
    return new Response(JSON.stringify(reply.data), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  };
  const done = async () => { await w.prisma.socialCredential.deleteMany({}); await w.done(); delete process.env.THREADS_ACCESS_TOKEN; delete process.env.THREADS_PUBLISH_WAIT_MS; delete process.env.THREADS_POLL_MS; delete process.env.THREADS_USER_ID; };
  return { ...w, threadsCalls, done };
}

db('a due slot posts to Threads: the item is made with the picture and text, published once Threads has it, and the link is kept', async () => {
  const w = await threadsWorld();
  try {
    await w.service.updateSettings({ threadsEnabled: true }, 'test');
    assert.equal((await w.service.tick(NINE)).posted, 1);
    assert.equal(w.photos().length, 0); // Facebook is off: nothing goes there
    const made = w.threadsCalls.find((c) => c.path === '9001/threads')!;
    assert.equal(made.body.media_type, 'IMAGE');
    assert.match(made.body.image_url, /^https:\/\//);
    assert.match(made.body.text, /utm_source=threads/);
    assert.equal(made.body.access_token, 'threads-renewed'); // the renewed login, once the app has renewed it
    assert.ok(w.threadsCalls.every((c) => !c.path.includes('threads-env-token')));
    const published = w.threadsCalls.find((c) => c.path === '9001/threads_publish')!;
    assert.equal(published.body.creation_id, 'c_1');
    const row = await w.prisma.socialPost.findFirstOrThrow({});
    assert.deepEqual([row.channel, row.status, row.externalId, row.permalink], ['THREADS', 'POSTED', 't_1', 'https://www.threads.net/@dripemporium/post/t_1']);
    assert.equal((await w.service.tick(NINE)).posted, 0); // the slot is taken
  } finally { await w.done(); }
});

db('each channel is on or off by itself and keeps its own rotation; both on posts both', async () => {
  const w = await threadsWorld();
  try {
    await w.service.updateSettings({ facebookEnabled: true, threadsEnabled: true }, 'test');
    assert.equal((await w.service.tick(NINE)).posted, 2);
    const rows = await w.prisma.socialPost.findMany({ orderBy: { channel: 'asc' } });
    assert.deepEqual(rows.map((r) => [r.channel, r.slotKey, r.status]), [['FACEBOOK', '2026-11-08@09:00', 'POSTED'], ['THREADS', '2026-11-08@09:00', 'POSTED']]);
    const status = await w.service.status();
    assert.deepEqual([status.facebook.posted, status.threads.posted, status.facebook.enabled, status.threads.configured], [1, 1, true, true]);
    await w.service.updateSettings({ facebookEnabled: false }, 'test');
    await w.service.tick(new Date('2026-11-08T10:10:00Z')); // 13:10: only Threads is on
    assert.equal((await w.prisma.socialPost.count({ where: { channel: 'FACEBOOK' } })), 1);
    assert.equal((await w.prisma.socialPost.count({ where: { channel: 'THREADS' } })), 2);
  } finally { await w.done(); }
});

db('Threads: a picture it cannot use fails at once, one it is slow to prepare is tried again, and a refusal is shown', async () => {
  let state = 'ERROR';
  const w = await threadsWorld((c) => (/^c_\d+$/.test(c.path) ? { status: 200, data: state === 'ERROR' ? { status: 'ERROR', error_message: 'Unsupported image' } : { status: state } } : null));
  try {
    await w.service.updateSettings({ threadsEnabled: true }, 'test');
    assert.equal((await w.service.tick(NINE)).failed, 1);
    let row = await w.prisma.socialPost.findFirstOrThrow({});
    assert.deepEqual([row.status, row.detail], ['FAILED', 'Threads could not use the picture: Unsupported image']);
    assert.equal(w.threadsCalls.filter((c) => c.path === '9001/threads_publish').length, 0);

    await w.prisma.socialPost.deleteMany({});
    state = 'IN_PROGRESS';
    await w.service.tick(NINE);
    row = await w.prisma.socialPost.findFirstOrThrow({});
    assert.deepEqual([row.status, row.attempts], ['RETRY', 1]);
    await w.prisma.socialPost.update({ where: { id: row.id }, data: { createdAt: NINE, updatedAt: NINE } });
    state = 'FINISHED';
    assert.equal((await w.service.tick(new Date(NINE.getTime() + 6 * 60_000))).posted, 1);
    assert.equal((await w.prisma.socialPost.findFirstOrThrow({})).status, 'POSTED');
  } finally { await w.done(); }

  const refused = await threadsWorld((c) => (c.path === '9001/threads' ? { status: 400, data: { error: { code: 10, message: 'Application does not have permission for this action' } } } : null));
  try {
    await refused.service.updateSettings({ threadsEnabled: true }, 'test');
    assert.equal((await refused.service.tick(NINE)).failed, 1);
    assert.equal((await refused.prisma.socialPost.findFirstOrThrow({})).detail, '10: Application does not have permission for this action');
  } finally { await refused.done(); }
});

db('the Threads login is renewed before it ends and kept; a new token in the server settings replaces the kept one', async () => {
  const w = await threadsWorld();
  try {
    await w.service.maintainThreadsLogin(NINE);
    let row = await w.prisma.socialCredential.findUniqueOrThrow({ where: { channel: 'THREADS' } });
    assert.deepEqual([row.accessToken, row.userId, row.error], ['threads-renewed', '9001', null]);
    assert.equal(row.expiresAt!.getTime(), NINE.getTime() + 5_184_000_000);
    const refreshes = () => w.threadsCalls.filter((c) => c.path === 'refresh_access_token').length;
    assert.equal(refreshes(), 1);

    await w.service.maintainThreadsLogin(new Date(NINE.getTime() + 2 * 3_600_000)); // 59 days left: nothing to do
    assert.equal(refreshes(), 1);
    await w.service.maintainThreadsLogin(new Date(NINE.getTime() + 45 * 86_400_000)); // 15 days left: renewed
    assert.equal(refreshes(), 2);

    process.env.THREADS_ACCESS_TOKEN = 'a-brand-new-token';
    (w.service as any).lastRenewTry = 0;
    await w.service.maintainThreadsLogin(NINE);
    assert.equal(w.threadsCalls.at(-1)!.query.get('access_token'), 'a-brand-new-token'); // not the kept one
    row = await w.prisma.socialCredential.findUniqueOrThrow({ where: { channel: 'THREADS' } });
    assert.equal(row.accessToken, 'threads-renewed');
  } finally { await w.done(); }

  const noRenew = await threadsWorld((c) => (c.path === 'refresh_access_token' ? { status: 400, data: { error: { code: 190, message: 'Token must be at least 24 hours old' } } } : null));
  try {
    await noRenew.service.maintainThreadsLogin(NINE);
    const row = await noRenew.prisma.socialCredential.findUniqueOrThrow({ where: { channel: 'THREADS' } });
    assert.deepEqual([row.accessToken, row.userId, row.expiresAt], ['threads-env-token', '9001', null]); // still usable
    assert.match(row.error!, /Renewal: 190/);
    await noRenew.service.updateSettings({ threadsEnabled: true }, 'test');
    assert.equal((await noRenew.service.tick(NINE)).posted, 1); // posting does not depend on the renewal
  } finally { await noRenew.done(); }
});

db('a Threads post can be taken down, and the screen says when the Threads login ends', async () => {
  const w = await threadsWorld();
  try {
    const result: any = await w.service.postNow('staff@example.com', 'TP_3', 'THREADS');
    assert.equal(result.status, 'POSTED');
    const row = await w.prisma.socialPost.findFirstOrThrow({});
    assert.equal(row.channel, 'THREADS');
    assert.deepEqual(await w.service.remove(row.id), { removed: true, detail: null });
    assert.equal(w.threadsCalls.at(-1)!.method, 'DELETE');
    assert.equal((await w.prisma.socialPost.findUniqueOrThrow({ where: { id: row.id } })).status, 'REMOVED');
    const status = await w.service.status();
    assert.ok(status.threads.tokenExpiresAt);
    assert.equal(status.threads.removed, 1);
  } finally { await w.done(); }

  const none = await world();
  try {
    assert.equal(((await none.service.postNow('x', undefined, 'THREADS')) as any).status, 'FAILED');
    assert.equal((await none.service.status()).threads.configured, false);
  } finally { await none.done(); }
});
