import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { FacebookCommentsService } from '../src/facebook-comments/facebook-comments.service';
import { FacebookWebhookController } from '../src/facebook-comments/facebook-webhook.controller';
import {
  DEFAULT_PRIVATE_TEXT, fillTemplate, isReplyToComment, isTransientFacebookError, looksLikeSpam, parseFeedWebhook,
} from '../src/facebook-comments/facebook-comments';

// --- pure rules ------------------------------------------------------------------------------------------------------

const feed = (value: any, pageId = '111') => ({ object: 'page', entry: [{ id: pageId, time: 1793900000, changes: [{ field: 'feed', value }] }] });
const comment = (over: any = {}) => ({ item: 'comment', verb: 'add', comment_id: '111_900_1', post_id: '111_900', parent_id: '111_900', created_time: 1793900000, message: 'How much is the Puma Roma?', from: { id: '555', name: 'Wanjiru Kamau' }, ...over });

test('only new comments are taken from a Page webhook; edits, reactions, posts and other objects are ignored', () => {
  const got = parseFeedWebhook(feed(comment()));
  assert.deepEqual(got.map((c) => [c.commentId, c.postId, c.pageId, c.fromId, c.fromName, c.message]), [['111_900_1', '111_900', '111', '555', 'Wanjiru Kamau', 'How much is the Puma Roma?']]);
  assert.equal(got[0].createdAt!.getTime(), 1793900000 * 1000);
  for (const ignored of [comment({ verb: 'edited' }), comment({ verb: 'remove' }), comment({ item: 'reaction' }), comment({ item: 'status' }), comment({ comment_id: undefined })]) assert.deepEqual(parseFeedWebhook(feed(ignored)), []);
  for (const bad of [null, {}, { object: 'whatsapp_business_account', entry: [] }, { object: 'page', entry: 'x' }, { object: 'page', entry: [{ changes: [{ field: 'mention', value: comment() }] }] }]) assert.deepEqual(parseFeedWebhook(bad), []);
});

test('replies to other comments and comments with links are recognised; the text is filled with the name and links', () => {
  assert.equal(isReplyToComment({ postId: '111_900', parentId: '111_900' }), false);
  assert.equal(isReplyToComment({ postId: '111_900', parentId: '111_900_5' }), true);
  for (const spam of ['check https://x.com/win', 'visit www.deals.co.ke', 'shop at best-shoes.com/offer']) assert.equal(looksLikeSpam(spam), true, spam);
  for (const fine of ['How much is it?', 'size 42 pls', 'Price? 0712345678', null]) assert.equal(looksLikeSpam(fine as any), false, String(fine));
  const text = fillTemplate(DEFAULT_PRIVATE_TEXT, { name: 'Wanjiru Kamau', whatsapp: 'https://wa.me/254113206481', page: 'https://www.facebook.com/dripemporium' });
  assert.match(text, /^Hi Wanjiru! /);
  assert.match(text, /https:\/\/wa\.me\/254113206481/);
  assert.match(text, /facebook\.com\/dripemporium$/);
  assert.match(fillTemplate('Hi {name}!', { name: null }), /^Hi there!$/);
  assert.equal(fillTemplate('Shop: {site} at {location}', { site: 'https://dripemporium.store', location: 'F53' }), 'Shop: https://dripemporium.store at F53');
  assert.equal(isTransientFacebookError(2, 500), true);
  assert.equal(isTransientFacebookError(4, 400), true);
  assert.equal(isTransientFacebookError(200, 403), false);
  assert.equal(isTransientFacebookError(10900, 400), false);
});

// --- against a real database (KITS_TEST_DATABASE_URL, a scratch database) and a fake Facebook -------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const PAGE = '111';

type Call = { path: string; body: any };

async function world(responder: (call: Call) => { status: number; data: any } = () => ({ status: 200, data: {} })) {
  process.env.FACEBOOK_PAGE_ID = PAGE;
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'page-token';
  process.env.FACEBOOK_REPLY_WHATSAPP = '254113206481';
  process.env.FACEBOOK_PAGE_URL = 'https://www.facebook.com/dripemporium';
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = () => prisma.facebookCommentReply.deleteMany({ where: { commentId: { startsWith: 'T_' } } });
  await cleanup();
  const calls: Call[] = [];
  const realFetch = globalThis.fetch;
  let counter = 0;
  (globalThis as any).fetch = async (input: any, init: any) => {
    const path = String(input).replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, '');
    const call = { path, body: init?.body ? JSON.parse(init.body) : null };
    calls.push(call);
    const fixed = responder(call);
    const data = fixed.status === 200 && Object.keys(fixed.data).length === 0
      ? (path.endsWith('/messages') ? { recipient_id: 'PSID-1', message_id: `m_${++counter}` } : { id: `${call.path}_reply` })
      : fixed.data;
    return new Response(JSON.stringify(data), { status: fixed.status, headers: { 'Content-Type': 'application/json' } });
  };
  const pages: any = { findOne: async () => ({ content: {} }) };
  const service = new FacebookCommentsService(prisma as any, pages);
  const c = (id: string, over: any = {}) => ({ commentId: `T_${id}`, postId: 'T_POST', parentId: 'T_POST', pageId: PAGE, fromId: `U_${id}`, fromName: 'Wanjiru Kamau', message: 'How much?', createdAt: new Date(), ...over });
  const row = (id: string) => prisma.facebookCommentReply.findUniqueOrThrow({ where: { commentId: `T_${id}` } });
  const done = async () => { (globalThis as any).fetch = realFetch; await cleanup(); await prisma.$disconnect(); for (const k of ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_REPLY_WHATSAPP', 'FACEBOOK_PAGE_URL', 'FACEBOOK_COMMENT_REPLIES', 'FACEBOOK_PUBLIC_REPLY', 'FACEBOOK_REPLY_DAILY_CAP']) delete process.env[k]; };
  return { prisma, service, calls, c, row, done };
}

db('a comment gets one private reply to the commenter (with WhatsApp and the Page), then a public one; Facebook delivering it twice changes nothing', async () => {
  const w = await world();
  try {
    assert.equal(await w.service.handleComment(w.c('1')), 'SENT');
    assert.equal(await w.service.handleComment(w.c('1')), 'DUPLICATE');
    assert.equal(w.calls.length, 2);
    const [priv, pub] = w.calls;
    assert.equal(priv.path, `${PAGE}/messages`);
    assert.deepEqual(priv.body.recipient, { comment_id: 'T_1' });
    assert.match(priv.body.message.text, /^Hi Wanjiru! /);
    assert.match(priv.body.message.text, /https:\/\/wa\.me\/254113206481/);
    assert.match(priv.body.message.text, /facebook\.com\/dripemporium/);
    assert.equal(pub.path, 'T_1/comments');
    assert.match(pub.body.message, /sent you a message/);
    assert.match(pub.body.message, /Shop online: https:\/\/dripemporium\.store\n📍 Visit us: Dubai Merchants Mall shop F53, Ronald Ngala Street, Nairobi$/);
    const r = await w.row('1');
    assert.deepEqual([r.status, r.recipientId, r.attempts, r.detail], ['SENT', 'PSID-1', 1, null]);
    assert.ok(r.privateMessageId && r.publicReplyId && r.repliedAt);
  } finally { await w.done(); }
});

db('the Page\'s own comments, replies to comments, comments with links and a second comment from the same person are not answered', async () => {
  const w = await world();
  try {
    assert.equal(await w.service.handleComment(w.c('2', { fromId: PAGE })), 'IGNORED');
    assert.equal(await w.service.handleComment(w.c('3', { parentId: 'T_other_comment' })), 'SKIPPED');
    assert.equal(await w.service.handleComment(w.c('4', { message: 'win big https://scam.example/x' })), 'SKIPPED');
    assert.equal(w.calls.length, 0);
    assert.equal(await w.service.handleComment(w.c('5', { fromId: 'U_same' })), 'SENT');
    assert.equal(await w.service.handleComment(w.c('6', { fromId: 'U_same' })), 'SKIPPED');
    assert.equal(w.calls.length, 2);
    assert.equal((await w.row('6')).detail, 'Already messaged this person this week');
    assert.equal(await w.prisma.facebookCommentReply.count({ where: { commentId: 'T_2' } }), 0);
  } finally { await w.done(); }
});

db('the public reply is only made after the private one went, and can be switched off; the daily limit stops the rest', async () => {
  const failing = await world((call) => (call.path.endsWith('/messages') ? { status: 400, data: { error: { code: 200, message: 'Permissions error' } } } : { status: 200, data: {} }));
  try {
    assert.equal(await failing.service.handleComment(failing.c('7')), 'FAILED');
    assert.deepEqual(failing.calls.map((x) => x.path), [`${PAGE}/messages`]);
    assert.equal((await failing.row('7')).detail, '200: Permissions error');
  } finally { await failing.done(); }

  const quiet = await world();
  try {
    process.env.FACEBOOK_PUBLIC_REPLY = 'false';
    process.env.FACEBOOK_REPLY_DAILY_CAP = '1';
    assert.equal(await quiet.service.handleComment(quiet.c('8')), 'SENT');
    assert.deepEqual(quiet.calls.map((x) => x.path), [`${PAGE}/messages`]);
    const second = await quiet.service.handleComment(quiet.c('9'));
    // Other tests' rows share the table, so the cap may already be reached by someone else's; either way no second message goes.
    assert.equal(second, 'SKIPPED');
    assert.match((await quiet.row('9')).detail!, /Daily limit of 1 reached/);
    assert.equal(quiet.calls.length, 1);
  } finally { await quiet.done(); }
});

db('when Facebook is unavailable the reply is tried again a few minutes later, up to three times, and an answer it already sent is not sent twice', async () => {
  let mode: 'down' | 'up' | 'already' = 'down';
  const w = await world((call) => {
    if (!call.path.endsWith('/messages')) return { status: 200, data: {} };
    if (mode === 'down') return { status: 500, data: { error: { code: 2, message: 'Service temporarily unavailable' } } };
    if (mode === 'already') return { status: 400, data: { error: { code: 10900, message: 'Already replied' } } };
    return { status: 200, data: {} };
  });
  try {
    assert.equal(await w.service.handleComment(w.c('10')), 'RETRY');
    assert.equal((await w.row('10')).attempts, 1);
    assert.equal(await w.service.retryDue(new Date(Date.now() + 60_000)), 0); // too soon
    mode = 'up';
    assert.equal(await w.service.retryDue(new Date(Date.now() + 10 * 60_000)), 1);
    const r = await w.row('10');
    assert.deepEqual([r.status, r.attempts], ['SENT', 2]);

    mode = 'down';
    assert.equal(await w.service.handleComment(w.c('11')), 'RETRY');
    assert.equal(await w.service.retryDue(new Date(Date.now() + 10 * 60_000)), 1);
    assert.equal((await w.row('11')).status, 'RETRY'); // second failure, one try left
    assert.equal(await w.service.retryDue(new Date(Date.now() + 20 * 60_000)), 1);
    assert.deepEqual([(await w.row('11')).status, (await w.row('11')).attempts], ['FAILED', 3]);

    mode = 'already';
    assert.equal(await w.service.handleComment(w.c('12')), 'SKIPPED');
    assert.equal((await w.row('12')).detail, 'Already answered privately');

    // A reply left PENDING by a crash is picked up after ten minutes.
    await w.prisma.facebookCommentReply.create({ data: { commentId: 'T_13', fromId: 'U_13', fromName: 'A B', status: 'PENDING' } });
    mode = 'up';
    assert.equal(await w.service.retryDue(new Date(Date.now() + 2 * 60_000)), 0);
    assert.equal(await w.service.retryDue(new Date(Date.now() + 12 * 60_000)), 1);
    assert.equal((await w.row('13')).status, 'SENT');
  } finally { await w.done(); }
});

db('nothing is sent while it is switched off or the Page is not set up', async () => {
  const w = await world();
  try {
    process.env.FACEBOOK_COMMENT_REPLIES = 'false';
    assert.equal(await w.service.handleComment(w.c('14')), 'IGNORED');
    delete process.env.FACEBOOK_COMMENT_REPLIES;
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    assert.equal(await w.service.handleComment(w.c('15')), 'IGNORED');
    assert.equal(w.calls.length, 0);
    assert.equal(await w.prisma.facebookCommentReply.count({ where: { commentId: { in: ['T_14', 'T_15'] } } }), 0);
  } finally { await w.done(); }
});

// --- the webhook address ---------------------------------------------------------------------------------------------------

test('the webhook only exists at the secret address, answers the verification, and checks the signature when an app secret is set', async () => {
  const handled: string[] = [];
  const controller = new FacebookWebhookController({ handleComment: async (c: any) => { handled.push(c.commentId); } } as any);
  process.env.FACEBOOK_WEBHOOK_SECRET = 's3cret-address';
  try {
    assert.throws(() => controller.verify('wrong', 'subscribe', 's3cret-address', 'x'), NotFoundException);
    assert.throws(() => controller.verify('s3cret-address', 'subscribe', 'other', 'x'), UnauthorizedException);
    assert.equal(controller.verify('s3cret-address', 'subscribe', 's3cret-address', '12345'), '12345');
    const body = feed(comment());
    assert.deepEqual(await controller.receive('s3cret-address', body, { headers: {}, rawBody: Buffer.from('{}') }), { received: true });
    assert.deepEqual(handled, ['111_900_1']);
    await assert.rejects(() => controller.receive('wrong', body, { headers: {} }), NotFoundException);

    process.env.FACEBOOK_APP_SECRET = 'app-secret';
    const raw = Buffer.from(JSON.stringify(body));
    await assert.rejects(() => controller.receive('s3cret-address', body, { headers: {}, rawBody: raw }), UnauthorizedException);
    const sig = `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}`;
    await controller.receive('s3cret-address', body, { headers: { 'x-hub-signature-256': sig }, rawBody: raw });
    assert.equal(handled.length, 2);
  } finally { delete process.env.FACEBOOK_WEBHOOK_SECRET; delete process.env.FACEBOOK_APP_SECRET; }
});
