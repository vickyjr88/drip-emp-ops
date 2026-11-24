import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INSTAGRAM_LIMIT, PostableProduct, TIKTOK_TITLE_LIMIT, X_LIMIT, buildInstagramCaption, buildTikTokCaption, buildXCaption, splitTikTokCaption, xLength,
} from '../src/social-posting/social-post';
import { InstagramClient, instagramFailure } from '../src/social-posting/channels/instagram-client';
import { TikTokClient, authorizeUrl, checkState, signState, tiktokFailure } from '../src/social-posting/channels/tiktok-client';

const product = (over: Partial<PostableProduct> = {}): PostableProduct => ({
  id: 'TP_1', slug: 'nike-air-force-1', name: 'Nike Air Force 1 White', brand: 'Nike', categoryName: 'Sneakers',
  imageUrl: 'https://cdn.dripemporium.store/af1.jpg', priceFrom: 4200, priceTo: 4200, offer: null,
  sizesInStock: ['42', '40', '41'], stockUnits: 9, createdAt: new Date('2026-10-01T00:00:00Z'), ...over,
});
const ctx = { origin: 'https://dripemporium.store', whatsapp: 'https://wa.me/254113206481', location: 'Dubai Merchants Mall shop F53, Ronald Ngala Street, Nairobi' };
const LONG = { name: 'Nike Air Force 1 Low Retro Premium Limited Edition Triple White With Gum Sole And Reflective Detail '.repeat(4), sizesInStock: Array.from({ length: 14 }, (_, i) => String(36 + i)) };

// --- captions ------------------------------------------------------------------------------------------------------------------

test('Instagram: no clickable link is promised, the address is plain, the number is dialable, and the limits hold', () => {
  const text = buildInstagramCaption(product(), ctx, 'd');
  assert.doesNotMatch(text, /https?:\/\//);
  assert.match(text, /dripemporium\.store\/shop\/nike-air-force-1/);
  assert.match(text, /WhatsApp: 0113 206 481/);
  assert.match(text, /KES 4,200/);
  assert.match(text, /#DripEmporium/);
  const huge = buildInstagramCaption(product({ ...LONG }), { ...ctx, location: 'x'.repeat(3000) }, 'd');
  assert.ok(Array.from(huge).length <= INSTAGRAM_LIMIT);
  assert.ok((text.match(/#\w+/g) ?? []).length <= 30);
});

test('X: links count as 23 whatever their length, emoji as 2, and the post fits whatever the product', () => {
  assert.equal(xLength('see https://dripemporium.store/shop/a-very-long-slug-indeed?utm_source=x&utm_medium=social now'), 'see '.length + 23 + ' now'.length);
  assert.equal(xLength('🔥'), 2);
  for (const over of [{}, { ...LONG }, { offer: { price: 3500, was: 4500 } }]) {
    const text = buildXCaption(product(over as any), { ...ctx, location: 'A very long address '.repeat(10) }, 'd');
    assert.ok(xLength(text) <= X_LIMIT, `${xLength(text)} for ${JSON.stringify(Object.keys(over))}`);
    assert.match(text, /KES [\d,]+/);
    assert.match(text, /\/shop\/nike-air-force-1\?utm_source=x&utm_medium=social&utm_campaign=autopost/);
  }
  assert.match(buildXCaption(product({ ...LONG }), ctx, 'd'), /…/);
});

test('TikTok: the first line is a title of at most 90 characters, the rest the description with the plain address', () => {
  const caption = buildTikTokCaption(product(), ctx, 'd');
  const { title, description } = splitTikTokCaption(caption);
  assert.equal(title, 'Nike Air Force 1 White');
  assert.match(description, /KES 4,200/);
  assert.match(description, /dripemporium\.store\/shop\/nike-air-force-1/);
  assert.doesNotMatch(description, /https?:\/\//);
  const long = splitTikTokCaption(buildTikTokCaption(product({ ...LONG }), ctx, 'd'));
  assert.ok(Array.from(long.title).length <= TIKTOK_TITLE_LIMIT);
  assert.match(long.title, /…$/);
});

// --- Instagram -------------------------------------------------------------------------------------------------------------------

type Reply = { status: number; data: any } | null;
const instagram = (responder: (url: URL, init: RequestInit) => Reply, extra: Record<string, unknown> = {}) => {
  const calls: Array<{ path: string; method: string; body: any; query: URLSearchParams }> = [];
  const call = async (url: string, init: RequestInit) => {
    const u = new URL(url);
    calls.push({ path: u.pathname.replace(/^\/v[\d.]+\//, ''), method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : null, query: u.searchParams });
    return responder(u, init);
  };
  const client = new InstagramClient({ version: 'v21.0', token: 'tok', pageId: '111', waitMs: 100, pollMs: 2, ...extra } as any, call);
  return { client, calls };
};
const happy = (u: URL): Reply => {
  const path = u.pathname.replace(/^\/v[\d.]+\//, '');
  if (path === '111') return { status: 200, data: { instagram_business_account: { id: '1784', username: 'dripemporium' } } };
  if (path === '1784/media') return { status: 200, data: { id: 'c1' } };
  if (path === 'c1') return { status: 200, data: { status_code: 'FINISHED' } };
  if (path === '1784/media_publish') return { status: 200, data: { id: 'm1' } };
  if (path === 'm1') return { status: 200, data: { permalink: 'https://www.instagram.com/p/abc/' } };
  return { status: 404, data: {} };
};

test('Instagram: the account is found from the Page, the picture and caption become a container, then it is published', async () => {
  const { client, calls } = instagram(happy);
  const out = await client.publish('https://api.dripemporium.store/social-posting/media/x.jpg', 'Nike');
  assert.deepEqual(out, { ok: true, id: 'm1', permalink: 'https://www.instagram.com/p/abc/' });
  const made = calls.find((c) => c.path === '1784/media')!;
  assert.deepEqual(made.body, { image_url: 'https://api.dripemporium.store/social-posting/media/x.jpg', caption: 'Nike' });
  assert.deepEqual(calls.find((c) => c.path === '1784/media_publish')!.body, { creation_id: 'c1' });
  // The account is remembered: a second post does not look it up again.
  await client.publish('https://x/y.jpg', 'again');
  assert.equal(calls.filter((c) => c.path === '111').length, 1);
});

test('Instagram: an account id set directly is used without any lookup', async () => {
  const { client, calls } = instagram(happy, { accountId: '1784' });
  await client.publish('https://x/y.jpg', 'c');
  assert.equal(calls.some((c) => c.path === '111'), false);
});

test('Instagram: a Page with no linked account says so, and a refusal for permission explains the fix', async () => {
  const none = instagram(() => ({ status: 200, data: {} }));
  const a = await none.client.publish('https://x/y.jpg', 'c');
  assert.equal(a.ok, false);
  assert.match((a as any).error, /No Instagram professional account/);
  assert.equal((a as any).transient, false);
  const f = instagramFailure({ status: 400, data: { error: { code: 10, message: '(#10) Application does not have permission for this action' } } });
  assert.match(f.error, /instagram_content_publish/);
  assert.equal(f.transient, false);
});

test('Instagram: a picture it cannot use fails at once; one it is slow to prepare is tried again', async () => {
  const bad = instagram((u) => (u.pathname.endsWith('/c1') ? { status: 200, data: { status_code: 'ERROR' } } : happy(u)));
  const a = await bad.client.publish('https://x/y.jpg', 'c');
  assert.equal(a.ok, false);
  assert.equal((a as any).transient, false);
  assert.match((a as any).error, /JPEG/);
  const slow = instagram((u) => (u.pathname.endsWith('/c1') ? { status: 200, data: { status_code: 'IN_PROGRESS' } } : happy(u)), { waitMs: 30, pollMs: 5 });
  const b = await slow.client.publish('https://x/y.jpg', 'c');
  assert.equal(b.ok, false);
  assert.equal((b as any).transient, true);
  assert.equal(slow.calls.some((c) => c.path.endsWith('media_publish')), false, 'never publishes an unfinished container');
});

// --- TikTok ----------------------------------------------------------------------------------------------------------------------

test('TikTok: the sign-in address carries the app, the permissions, the return address and a state', () => {
  const url = new URL(authorizeUrl('ck', 'https://api.dripemporium.store/social-posting/connect/tiktok/callback', 'STATE'));
  assert.equal(url.origin + url.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
  assert.equal(url.searchParams.get('client_key'), 'ck');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'user.info.basic,video.publish,video.upload');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://api.dripemporium.store/social-posting/connect/tiktok/callback');
  assert.equal(url.searchParams.get('state'), 'STATE');
});

test('TikTok: the state proves who started the sign-in, expires, and cannot be altered or made with another secret', () => {
  const state = signState('secret', 'staff@dripemporium.store', 1_000_000);
  assert.deepEqual(checkState('secret', state, 1_000_000 + 60_000), { by: 'staff@dripemporium.store' });
  assert.equal(checkState('secret', state, 1_000_000 + 16 * 60_000), null, 'older than 15 minutes');
  assert.equal(checkState('other', state, 1_000_000), null, 'another secret');
  const [body, sig] = state.split('.');
  assert.equal(checkState('secret', `${Buffer.from(JSON.stringify({ by: 'attacker', at: 1_000_000, n: 'x' })).toString('base64url')}.${sig}`, 1_000_000), null, 'a changed body');
  assert.equal(checkState('secret', `${body}.`, 1_000_000), null);
  assert.equal(checkState('secret', '', 1_000_000), null);
  assert.equal(checkState('secret', undefined as any, 1_000_000), null);
});

type TCall = { url: string; method: string; body: any; form: URLSearchParams | null; auth: string | undefined };
const tiktok = (responder: (c: TCall) => Reply, over: Record<string, unknown> = {}) => {
  const calls: TCall[] = [];
  const call = async (url: string, init: RequestInit) => {
    const raw = init.body ? String(init.body) : '';
    const isForm = (init.headers as any)?.['Content-Type']?.includes('x-www-form-urlencoded');
    const c: TCall = { url, method: String(init.method), body: raw && !isForm ? JSON.parse(raw) : null, form: isForm ? new URLSearchParams(raw) : null, auth: (init.headers as any)?.Authorization };
    calls.push(c);
    return responder(c);
  };
  return { client: new TikTokClient({ clientKey: 'ck', clientSecret: 'cs', redirectUri: 'https://api/cb', waitMs: 60, pollMs: 2, ...over }, call), calls };
};
const tokenReply = { status: 200, data: { access_token: 'acc1', refresh_token: 'ref1', expires_in: 7200, refresh_expires_in: 15_552_000, open_id: 'open-1', scope: 'video.publish', token_type: 'Bearer' } };

test('TikTok: the code is swapped for a login, and a renewal sends the newest refresh token and returns the replacement', async () => {
  const code = tiktok(() => tokenReply);
  const got = await code.client.exchangeCode('CODE', new Date('2026-11-25T00:00:00Z'));
  assert.ok(got.ok);
  if (got.ok) {
    assert.equal(got.tokens.accessToken, 'acc1');
    assert.equal(got.tokens.refreshToken, 'ref1');
    assert.equal(got.tokens.openId, 'open-1');
    assert.equal(got.tokens.expiresAt.toISOString(), '2026-11-25T02:00:00.000Z');
  }
  assert.equal(code.calls[0].form!.get('grant_type'), 'authorization_code');
  assert.equal(code.calls[0].form!.get('code'), 'CODE');
  assert.equal(code.calls[0].form!.get('redirect_uri'), 'https://api/cb');
  assert.equal(code.calls[0].form!.get('client_secret'), 'cs');

  const renew = tiktok(() => ({ status: 200, data: { ...tokenReply.data, access_token: 'acc2', refresh_token: 'ref2' } }));
  const r = await renew.client.refresh('ref1');
  assert.ok(r.ok && r.tokens.refreshToken === 'ref2');
  assert.equal(renew.calls[0].form!.get('grant_type'), 'refresh_token');
  assert.equal(renew.calls[0].form!.get('refresh_token'), 'ref1');

  const refused = await tiktok(() => ({ status: 400, data: { error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' } })).client.refresh('old');
  assert.ok(!refused.ok && refused.permanent, 'a refused refresh token cannot be fixed by waiting');
});

const okInit = { status: 200, data: { data: { publish_id: 'pub1' }, error: { code: 'ok' } } };
const statusIs = (status: string, extra: Record<string, unknown> = {}) => ({ status: 200, data: { data: { status, ...extra }, error: { code: 'ok' } } });

test('TikTok inbox mode: the picture is pulled from the address, sent to the inbox, and that is reported as done', async () => {
  const { client, calls } = tiktok((c) => (c.url.endsWith('/content/init/') ? okInit : statusIs('SEND_TO_USER_INBOX')));
  const out = await client.publishPhoto('acc', { imageUrl: 'https://api/m/x.jpg', title: 'Nike', description: 'KES 4,200', mode: 'INBOX' });
  assert.deepEqual(out, { ok: true, id: 'pub1', detail: 'In the TikTok inbox: open TikTok to finish and publish it' });
  const init = calls[0];
  assert.equal(init.auth, 'Bearer acc');
  assert.deepEqual(init.body, {
    media_type: 'PHOTO', post_mode: 'MEDIA_UPLOAD', post_info: { title: 'Nike', description: 'KES 4,200' },
    source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: ['https://api/m/x.jpg'] },
  });
  assert.equal(calls.some((c) => c.url.includes('creator_info')), false, 'no creator lookup is needed for the inbox');
});

test('TikTok direct mode: asks what the account allows, posts publicly, and keeps the public post id once it is known', async () => {
  const { client, calls } = tiktok((c) => {
    if (c.url.includes('creator_info')) return { status: 200, data: { data: { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'] }, error: { code: 'ok' } } };
    if (c.url.endsWith('/content/init/')) return okInit;
    return statusIs('PUBLISH_COMPLETE', { publicaly_available_post_id: [7312345] });
  });
  const out = await client.publishPhoto('acc', { imageUrl: 'https://api/m/x.jpg', title: 'Nike', description: 'd', mode: 'DIRECT', username: 'dripemporium' });
  assert.deepEqual(out, { ok: true, id: 'pub1', permalink: 'https://www.tiktok.com/@dripemporium/photo/7312345', detail: undefined });
  const init = calls.find((c) => c.url.endsWith('/content/init/'))!;
  assert.equal(init.body.post_mode, 'DIRECT_POST');
  assert.equal(init.body.post_info.privacy_level, 'PUBLIC_TO_EVERYONE');
});

test('TikTok direct mode: an account that only allows private posts is refused with the options named, before anything is posted', async () => {
  const { client, calls } = tiktok((c) => (c.url.includes('creator_info') ? { status: 200, data: { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } } } : okInit));
  const out = await client.publishPhoto('acc', { imageUrl: 'https://x/y.jpg', title: 't', description: 'd', mode: 'DIRECT' });
  assert.equal(out.ok, false);
  assert.match((out as any).error, /SELF_ONLY/);
  assert.equal(calls.some((c) => c.url.endsWith('/content/init/')), false);
});

test('TikTok: the reasons it can give are explained in words, and only the ones that could pass are retried', async () => {
  const unaudited = tiktokFailure({ status: 403, data: { error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'x' } } });
  assert.match(unaudited.error, /Send to my TikTok inbox/);
  assert.equal(unaudited.transient, false);
  assert.match(tiktokFailure({ status: 403, data: { error: { code: 'url_ownership_unverified' } } }).error, /developer portal/);
  assert.equal(tiktokFailure({ status: 429, data: { error: { code: 'rate_limit_exceeded' } } }).transient, true);
  assert.equal(tiktokFailure({ status: 500, data: { error: { code: 'internal_error' } } }).transient, true);
  assert.equal(tiktokFailure(null).transient, true);
  const fail = await tiktok((c) => (c.url.endsWith('/content/init/') ? okInit : statusIs('FAILED', { fail_reason: 'photo_pull_failed' }))).client.publishPhoto('a', { imageUrl: 'https://x/y.jpg', title: 't', description: 'd', mode: 'INBOX' });
  assert.equal(fail.ok, false);
  assert.equal((fail as any).transient, true);
  const banned = await tiktok((c) => (c.url.endsWith('/content/init/') ? okInit : statusIs('FAILED', { fail_reason: 'spam_risk_user_banned_from_posting' }))).client.publishPhoto('a', { imageUrl: 'https://x/y.jpg', title: 't', description: 'd', mode: 'INBOX' });
  assert.equal((banned as any).transient, false);
});

test('TikTok: still processing when the wait ends is recorded as sent, with the id to look for, not posted twice', async () => {
  const { client } = tiktok((c) => (c.url.endsWith('/content/init/') ? okInit : statusIs('PROCESSING_DOWNLOAD')), { waitMs: 20, pollMs: 5 });
  const out = await client.publishPhoto('a', { imageUrl: 'https://x/y.jpg', title: 't', description: 'd', mode: 'INBOX' });
  assert.equal(out.ok, true);
  assert.match((out as any).detail, /still processing/);
});
