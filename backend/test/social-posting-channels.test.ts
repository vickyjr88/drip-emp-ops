import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { SocialPostingService } from '../src/social-posting/social-posting.service';
import { PostableProduct } from '../src/social-posting/social-post';
import { checkState } from '../src/social-posting/channels/tiktok-client';

/**
 * Instagram, X and TikTok through the posting service, against a real scratch database (KITS_TEST_DATABASE_URL) and fakes of the three
 * platforms (and of the shop's picture host). Nothing here talks to a real platform.
 */
const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;

const product = (over: Partial<PostableProduct> = {}): PostableProduct => ({
  id: 'TP_1', slug: 'nike-air-force-1', name: 'Nike Air Force 1 White', brand: 'Nike', categoryName: 'Sneakers',
  imageUrl: 'https://cdn.dripemporium.store/af1.png', priceFrom: 4200, priceTo: 4200, offer: null,
  sizesInStock: ['42', '40', '41'], stockUnits: 9, createdAt: new Date('2026-10-01T00:00:00Z'), ...over,
});
const NINE = new Date('2026-11-08T06:05:00Z'); // 09:05 Nairobi

type Seen = { host: string; path: string; method: string; body: any; form: URLSearchParams | null; query: URLSearchParams };
type Reply = { status: number; data: any } | null | Promise<{ status: number; data: any } | null>;

const ENV = [
  'FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN',
  'X_ACCESS_TOKEN_SECRET', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'PUBLIC_API_ORIGIN', 'SOCIAL_POSTING', 'INSTAGRAM_PUBLISH_WAIT_MS', 'INSTAGRAM_POLL_MS',
  'TIKTOK_PUBLISH_WAIT_MS', 'TIKTOK_POLL_MS', 'FACEBOOK_REPLY_WHATSAPP', 'FACEBOOK_REPLY_LOCATION', 'FACEBOOK_REPLY_SITE_URL', 'THREADS_ACCESS_TOKEN',
];

async function world(set: Record<string, string>, responder: (c: Seen) => Reply = () => null) {
  for (const k of ENV) delete process.env[k];
  Object.assign(process.env, { PUBLIC_API_ORIGIN: 'https://api.dripemporium.store', FACEBOOK_REPLY_WHATSAPP: '254113206481', FACEBOOK_REPLY_LOCATION: 'Dubai Merchants Mall', FACEBOOK_REPLY_SITE_URL: 'https://dripemporium.store', INSTAGRAM_PUBLISH_WAIT_MS: '200', INSTAGRAM_POLL_MS: '5', TIKTOK_PUBLISH_WAIT_MS: '200', TIKTOK_POLL_MS: '5' }, set);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => { await prisma.socialPost.deleteMany({}); await prisma.socialSetting.deleteMany({}); await prisma.socialCredential.deleteMany({}); };
  await cleanup();
  const png = await sharp({ create: { width: 900, height: 1400, channels: 3, background: { r: 20, g: 90, b: 200 } } }).png().toBuffer();
  const seen: Seen[] = [];
  const realFetch = globalThis.fetch;
  let n = 0;
  (globalThis as any).fetch = async (input: any, init: any) => {
    const u = new URL(String(input));
    if (u.host === 'cdn.dripemporium.store') return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
    const raw = init?.body ? String(init.body) : '';
    const isForm = String(init?.headers?.['Content-Type'] ?? '').includes('x-www-form-urlencoded');
    const call: Seen = { host: u.host, path: u.pathname.replace(/^\/v[\d.]+\//, '/'), method: init?.method ?? 'GET', body: raw && !isForm ? JSON.parse(raw) : null, form: isForm ? new URLSearchParams(raw) : null, query: u.searchParams };
    seen.push(call);
    const reply = (await responder(call)) ?? defaults(call, () => ++n);
    return new Response(JSON.stringify(reply.data), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  };
  const products = [product(), product({ id: 'TP_2', slug: 'puma-roma', name: 'Puma Roma Black', brand: 'Puma' }), product({ id: 'TP_3', slug: 'adidas-gazelle', name: 'Adidas Gazelle Navy', brand: 'Adidas' })];
  const service = new SocialPostingService(prisma as any, { postableProducts: async () => products } as any, { findOne: async () => ({ content: {} }) } as any);
  const on = (patch: Record<string, unknown>) => service.updateSettings({ times: ['09:00'], ...patch } as any, 'test');
  const done = async () => { (globalThis as any).fetch = realFetch; await cleanup(); await prisma.$disconnect(); for (const k of ENV) delete process.env[k]; };
  return { prisma, service, seen, on, done, png };
}

/** The platforms' ordinary good answers. */
function defaults(c: Seen, next: () => number): { status: number; data: any } {
  if (c.host === 'graph.facebook.com') {
    if (c.path === '/111') return { status: 200, data: { instagram_business_account: { id: '1784', username: 'dripemporium' } } };
    if (c.path === '/1784/media') return { status: 200, data: { id: 'c1' } };
    if (c.path === '/c1') return { status: 200, data: { status_code: 'FINISHED' } };
    if (c.path === '/1784/media_publish') return { status: 200, data: { id: 'ig_media_1' } };
    if (c.path === '/ig_media_1') return { status: 200, data: { permalink: 'https://www.instagram.com/p/xyz/' } };
    if (c.path === '/111/photos') return { status: 200, data: { post_id: `111_${1000 + next()}` } };
  }
  if (c.host === 'api.x.com') {
    if (c.path === '/2/media/upload') return { status: 200, data: { data: { id: 'media-1' } } };
    if (c.path === '/2/tweets' && c.method === 'POST') return { status: 201, data: { data: { id: '5550001', text: 't' } } };
    if (c.path.startsWith('/2/tweets/') && c.method === 'DELETE') return { status: 200, data: { data: { deleted: true } } };
  }
  if (c.host === 'open.tiktokapis.com') {
    if (c.path === '/oauth/token/') return { status: 200, data: { access_token: 'tt-access', refresh_token: 'tt-refresh', expires_in: 7200, refresh_expires_in: 15_552_000, open_id: 'open-1', token_type: 'Bearer' } };
    if (c.path === '/user/info/') return { status: 200, data: { data: { user: { display_name: 'Drip Emporium' } }, error: { code: 'ok' } } };
    if (c.path === '/post/publish/content/init/') return { status: 200, data: { data: { publish_id: 'pub-1' }, error: { code: 'ok' } } };
    if (c.path === '/post/publish/status/fetch/') return { status: 200, data: { data: { status: 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } } };
  }
  return { status: 404, data: { error: { code: 100, message: `unexpected ${c.host}${c.path}` } } };
}

const X_KEYS = { X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_TOKEN_SECRET: 'ts' };
const IG_KEYS = { FACEBOOK_PAGE_ID: '111', FACEBOOK_PAGE_ACCESS_TOKEN: 'page-token' };
const TT_KEYS = { TIKTOK_CLIENT_KEY: 'ck', TIKTOK_CLIENT_SECRET: 'cs' };
const connectTikTok = async (w: Awaited<ReturnType<typeof world>>) => {
  const started = w.service.tiktokConnectUrl('staff@dripemporium.store') as { url: string };
  return w.service.completeTikTokConnect('CODE', new URL(started.url).searchParams.get('state')!);
};

db('X: nothing is posted while off; on, a due slot uploads a JPEG and posts once with the link, and the post can be taken down', async () => {
  const w = await world(X_KEYS);
  try {
    assert.equal((await w.service.tick(NINE)).posted, 0);
    await w.on({ xEnabled: true });
    assert.equal((await w.service.tick(NINE)).posted, 1);
    assert.equal((await w.service.tick(NINE)).posted, 0, 'the same slot is not posted twice');
    const upload = w.seen.find((c) => c.path === '/2/media/upload')!;
    const jpeg = Buffer.from(upload.body.media, 'base64');
    assert.deepEqual([jpeg[0], jpeg[1]], [0xff, 0xd8], 'a PNG product photo is converted to JPEG before it is sent');
    const tweet = w.seen.find((c) => c.path === '/2/tweets')!;
    assert.deepEqual(tweet.body.media, { media_ids: ['media-1'] });
    assert.match(tweet.body.text, /utm_source=x&utm_medium=social&utm_campaign=autopost/);
    const row = await w.prisma.socialPost.findFirstOrThrow({ where: { channel: 'X' } });
    assert.deepEqual([row.status, row.externalId, row.permalink], ['POSTED', '5550001', 'https://x.com/i/web/status/5550001']);

    const removed = await w.service.remove(row.id);
    assert.equal(removed.removed, true);
    assert.equal((await w.prisma.socialPost.findUniqueOrThrow({ where: { id: row.id } })).status, 'REMOVED');
  } finally { await w.done(); }
});

db('X: no credit left fails with that message and is not retried', async () => {
  const w = await world(X_KEYS, (c) => (c.path === '/2/tweets' ? { status: 402, data: { title: 'CreditsDepleted', detail: 'no credits' } } : null));
  try {
    await w.on({ xEnabled: true });
    assert.equal((await w.service.tick(NINE)).failed, 1);
    const row = await w.prisma.socialPost.findFirstOrThrow({ where: { channel: 'X' } });
    assert.equal(row.status, 'FAILED');
    assert.match(row.detail!, /no credit left/i);
    assert.equal((await w.service.tick(new Date(NINE.getTime() + 30 * 60_000))).failed, 0, 'not tried again');
  } finally { await w.done(); }
});

db('Instagram: uses the Page token, posts the shop\'s own JPEG address, and shows the account it found', async () => {
  const w = await world(IG_KEYS);
  try {
    const status = await w.service.status();
    assert.equal((status as any).instagram.configured, true);
    assert.equal((status as any).instagram.account, '@dripemporium');

    await w.on({ instagramEnabled: true });
    assert.equal((await w.service.tick(NINE)).posted, 1);
    const row = await w.prisma.socialPost.findFirstOrThrow({ where: { channel: 'INSTAGRAM' } });
    assert.deepEqual([row.status, row.externalId, row.permalink], ['POSTED', 'ig_media_1', 'https://www.instagram.com/p/xyz/']);
    const made = w.seen.find((c) => c.path === '/1784/media')!;
    assert.equal(made.body.image_url, `https://api.dripemporium.store/social-posting/media/${row.id}.jpg`, 'Instagram is given the converted copy, not the PNG');
    assert.doesNotMatch(made.body.caption, /https?:\/\//, 'no link that cannot be clicked');

    const taken = await w.service.remove(row.id);
    assert.equal(taken.removed, false);
    assert.match(taken.detail!, /delete it in the Instagram app/);
  } finally { await w.done(); }
});

db('Instagram: a token without the permission is refused with what to do about it', async () => {
  const w = await world(IG_KEYS, (c) => (c.path === '/1784/media' ? { status: 400, data: { error: { code: 10, message: '(#10) Application does not have permission' } } } : null));
  try {
    await w.on({ instagramEnabled: true });
    assert.equal((await w.service.tick(NINE)).failed, 1);
    assert.match((await w.prisma.socialPost.findFirstOrThrow({ where: { channel: 'INSTAGRAM' } })).detail!, /instagram_content_publish/);
  } finally { await w.done(); }
});

db('the picture address is public, serves a JPEG for a real post only, and refuses anything else', async () => {
  const w = await world(IG_KEYS);
  try {
    await w.on({ instagramEnabled: true });
    await w.service.tick(NINE);
    const row = await w.prisma.socialPost.findFirstOrThrow({ where: { channel: 'INSTAGRAM' } });
    const jpeg = await w.service.mediaFor(`${row.id}.jpg`);
    const meta = await sharp(jpeg).metadata();
    assert.equal(meta.format, 'jpeg');
    assert.ok(meta.width! / meta.height! >= 0.8 - 0.01, 'a tall photo is put into the allowed shape');
    for (const bad of ['nothing.jpg', '../etc/passwd', `${row.id}.png`, `${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}.jpg`, '']) {
      await assert.rejects(() => w.service.mediaFor(bad), NotFoundException, bad);
    }
  } finally { await w.done(); }
});

db('TikTok: not connected means no posting; signing in saves the login; posting sends the photo to the inbox from the shop\'s address', async () => {
  const w = await world(TT_KEYS);
  try {
    const before = await w.service.postNow('staff', undefined, 'TIKTOK');
    assert.equal((before as any).status, 'FAILED');
    assert.match((before as any).detail, /not connected/i);

    const link = w.service.tiktokConnectUrl('staff@dripemporium.store') as { url: string };
    const parsed = new URL(link.url);
    assert.equal(parsed.searchParams.get('client_key'), 'ck');
    assert.equal(parsed.searchParams.get('redirect_uri'), 'https://api.dripemporium.store/social-posting/connect/tiktok/callback');
    assert.deepEqual(checkState(process.env.JWT_SECRET || 'super-secret-key-change-me', parsed.searchParams.get('state')!), { by: 'staff@dripemporium.store' });

    assert.deepEqual(await w.service.completeTikTokConnect('CODE', parsed.searchParams.get('state')!), { ok: true });
    const saved = await w.prisma.socialCredential.findUniqueOrThrow({ where: { channel: 'TIKTOK' } });
    assert.deepEqual([saved.accessToken, saved.refreshToken, saved.username, saved.userId], ['tt-access', 'tt-refresh', 'Drip Emporium', 'open-1']);
    const status: any = await w.service.status();
    assert.equal(status.tiktok.configured, true);
    assert.equal(status.tiktok.account, 'Drip Emporium');
    assert.equal(status.tiktok.mode, 'INBOX');

    await w.on({ tiktokEnabled: true });
    assert.equal((await w.service.tick(NINE)).posted, 1);
    const row = await w.prisma.socialPost.findFirstOrThrow({ where: { channel: 'TIKTOK' } });
    assert.equal(row.status, 'POSTED');
    assert.match(row.detail!, /TikTok inbox/);
    const init = w.seen.find((c) => c.path === '/post/publish/content/init/')!;
    assert.equal(init.body.post_mode, 'MEDIA_UPLOAD');
    assert.equal(init.body.source_info.photo_images[0], `https://api.dripemporium.store/social-posting/media/${row.id}.jpg`);
    assert.equal(init.body.post_info.title, 'Nike Air Force 1 White');

    const taken = await w.service.remove(row.id);
    assert.equal(taken.removed, false);
    assert.match(taken.detail!, /TikTok app/);
  } finally { await w.done(); }
});

db('TikTok: a sign-in with a forged, expired or missing state is refused and saves nothing', async () => {
  const w = await world(TT_KEYS);
  try {
    for (const state of ['', 'x.y', 'forged']) {
      const out = await w.service.completeTikTokConnect('CODE', state);
      assert.equal(out.ok, false, state);
    }
    const valid = new URL((w.service.tiktokConnectUrl('s') as { url: string }).url).searchParams.get('state')!;
    assert.equal((await w.service.completeTikTokConnect(undefined, valid)).ok, false, 'no code');
    assert.equal(await w.prisma.socialCredential.count(), 0);
    assert.deepEqual(await w.service.postNow('s', undefined, 'TIKTOK').then((r: any) => r.status), 'FAILED');
  } finally { await w.done(); }
});

db('TikTok: an expired access token is renewed before posting, and the replacement refresh token is the one kept', async () => {
  const w = await world(TT_KEYS, (c) => (c.form?.get('grant_type') === 'refresh_token'
    ? { status: 200, data: { access_token: 'tt-access-2', refresh_token: 'tt-refresh-2', expires_in: 7200, refresh_expires_in: 15_552_000, open_id: 'open-1' } }
    : null));
  try {
    assert.deepEqual(await connectTikTok(w), { ok: true });
    await w.prisma.socialCredential.update({ where: { channel: 'TIKTOK' }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const access = await w.service.tiktokAccess();
    assert.deepEqual(access, { token: 'tt-access-2', username: 'Drip Emporium' });
    const row = await w.prisma.socialCredential.findUniqueOrThrow({ where: { channel: 'TIKTOK' } });
    assert.deepEqual([row.accessToken, row.refreshToken], ['tt-access-2', 'tt-refresh-2']);
    assert.equal(w.seen.find((c) => c.form?.get('grant_type') === 'refresh_token')!.form!.get('refresh_token'), 'tt-refresh');
    // Still fresh: no second renewal.
    await w.service.tiktokAccess();
    assert.equal(w.seen.filter((c) => c.form?.get('grant_type') === 'refresh_token').length, 1);
  } finally { await w.done(); }
});

db('TikTok: when the other backend slot renews first and this renewal is refused, the newer login it saved is used', async () => {
  let w!: Awaited<ReturnType<typeof world>>;
  w = await world(TT_KEYS, async (c) => {
    if (c.form?.get('grant_type') !== 'refresh_token') return null;
    // The other slot got there first: it has saved a new login, and TikTok has already cancelled the old refresh token.
    await w.prisma.socialCredential.update({ where: { channel: 'TIKTOK' }, data: { accessToken: 'from-other-slot', refreshToken: 'ref-from-other-slot', expiresAt: new Date(Date.now() + 7_200_000) } });
    return { status: 400, data: { error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' } };
  });
  try {
    await connectTikTok(w);
    await w.prisma.socialCredential.update({ where: { channel: 'TIKTOK' }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    assert.deepEqual(await w.service.tiktokAccess(), { token: 'from-other-slot', username: 'Drip Emporium' });
    assert.equal((await w.prisma.socialCredential.findUniqueOrThrow({ where: { channel: 'TIKTOK' } })).error, null, 'it is not reported as broken');
  } finally { await w.done(); }
});

db('TikTok: a refused renewal with nothing newer is reported as needing a new sign-in, and posting says so', async () => {
  const w = await world(TT_KEYS, (c) => (c.form?.get('grant_type') === 'refresh_token' ? { status: 400, data: { error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' } } : null));
  try {
    await connectTikTok(w);
    await w.prisma.socialCredential.update({ where: { channel: 'TIKTOK' }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const out: any = await w.service.tiktokAccess();
    assert.match(out.error, /Connect TikTok again/);
    assert.match((await w.prisma.socialCredential.findUniqueOrThrow({ where: { channel: 'TIKTOK' } })).error!, /Connect TikTok again/);
  } finally { await w.done(); }
});

db('TikTok: disconnecting removes the login and switches TikTok off', async () => {
  const w = await world(TT_KEYS);
  try {
    await connectTikTok(w);
    await w.on({ tiktokEnabled: true });
    const status: any = await w.service.disconnectTikTok('staff');
    assert.equal(await w.prisma.socialCredential.count(), 0);
    assert.equal(status.tiktok.enabled, false);
    assert.equal(status.tiktok.configured, false);
  } finally { await w.done(); }
});

db('the channels are independent: each is on or off by itself, and an unconfigured one never posts', async () => {
  const w = await world({ ...X_KEYS, ...IG_KEYS });
  try {
    await w.on({ xEnabled: true, instagramEnabled: true, threadsEnabled: true, tiktokEnabled: true, facebookEnabled: false });
    const result = await w.service.tick(NINE);
    assert.equal(result.posted, 2, 'X and Instagram post; Threads and TikTok are enabled but not set up; Facebook is off');
    const channels = (await w.prisma.socialPost.findMany({ select: { channel: true } })).map((r) => r.channel).sort();
    assert.deepEqual(channels, ['INSTAGRAM', 'X']);

    process.env.SOCIAL_POSTING = 'false';
    assert.equal((await w.service.tick(new Date(NINE.getTime() + 24 * 3_600_000))).posted, 0);
    assert.equal(((await w.service.postNow('s', undefined, 'X')) as any).status, 'FAILED');
  } finally { await w.done(); }
});

db('the previews show a caption for every channel, each in its own shape', async () => {
  const w = await world({});
  try {
    const preview: any = await w.service.preview();
    assert.deepEqual(Object.keys(preview.previews).sort(), ['FACEBOOK', 'INSTAGRAM', 'THREADS', 'TIKTOK', 'X']);
    assert.match(preview.previews.X.caption, /utm_source=x/);
    assert.doesNotMatch(preview.previews.INSTAGRAM.caption, /https?:\/\//);
    assert.match(preview.previews.TIKTOK.caption, /^Nike Air Force 1 White\n\n/);
    assert.equal(w.seen.length, 0, 'previewing posts nothing and calls nothing');
  } finally { await w.done(); }
});
