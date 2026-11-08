import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { WhatsappContactsService } from '../src/whatsapp-outreach/whatsapp-contacts.service';
import { WhatsappSequenceService } from '../src/whatsapp-outreach/whatsapp-sequence.service';
import { WhatsappWebhookController } from '../src/whatsapp-outreach/whatsapp-webhook.controller';
import { WhatsAppOutreachService } from '../src/whatsapp-outreach/whatsapp-outreach.service';
import {
  NOTICE_TEXT, classifyKeyword, inSendWindow, parseWebhook, pickDelivery, sequenceDelaysHours, startOfNairobiDay, verifySignature,
} from '../src/whatsapp-outreach/whatsapp-subscription';

// --- pure rules ------------------------------------------------------------------------------------------------------

test('STOP is the whole message, in any case or punctuation; a sentence that merely contains it is not an opt-out', () => {
  for (const text of ['STOP', 'stop', ' Stop. ', 'STOP!!', 'Unsubscribe', 'opt out', 'Opt-out', 'STOP ALL']) assert.equal(classifyKeyword(text), 'STOP', text);
  for (const text of ['please do not stop the delivery', 'stop calling me about the order', 'cancel', 'cancel my order', 'hello', '', null, undefined]) assert.equal(classifyKeyword(text as any), null, String(text));
  for (const text of ['START', 'start', 'Subscribe.']) assert.equal(classifyKeyword(text), 'START', text);
});

const payload = (over: any = {}) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: {
    contacts: [{ wa_id: '254712345678', profile: { name: 'Wanjiru K' } }],
    messages: [{ id: 'wamid.A', from: '254712345678', type: 'text', timestamp: '1793900000', text: { body: 'Hi, is the Puma Roma available?' },
      referral: { source_id: '1203', headline: 'Puma Roma, KSh 4,200', ctwa_clid: 'abc123', source_type: 'ad' } }],
    statuses: [{ id: 'wamid.B', status: 'failed', timestamp: '1793900100', recipient_id: '254771114712', errors: [{ code: 131026, title: 'Message undeliverable' }] }],
    ...over,
  } }] }],
});

test('a webhook body gives the messages (name, text, ad) and the delivery reports (with the reason)', () => {
  const { messages, statuses } = parseWebhook(payload());
  assert.deepEqual(messages.map((m) => [m.id, m.from, m.name, m.text, m.referral]), [['wamid.A', '254712345678', 'Wanjiru K', 'Hi, is the Puma Roma available?', { sourceId: '1203', headline: 'Puma Roma, KSh 4,200', clickId: 'abc123' }]]);
  assert.deepEqual(statuses.map((s) => [s.id, s.status, s.recipient, s.errorCode, s.errorTitle]), [['wamid.B', 'failed', '254771114712', '131026', 'Message undeliverable']]);
  for (const bad of [null, {}, { entry: 'x' }, { entry: [{ changes: [{ field: 'other', value: {} }] }] }]) assert.deepEqual(parseWebhook(bad), { messages: [], statuses: [] });
});

test("Meta's signature is checked against the exact body, and a wrong or missing one fails", () => {
  const body = Buffer.from(JSON.stringify(payload()));
  const good = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`;
  assert.equal(verifySignature(body, good, 'app-secret'), true);
  assert.equal(verifySignature(body, good, 'other-secret'), false);
  assert.equal(verifySignature(Buffer.from(body.toString() + ' '), good, 'app-secret'), false);
  assert.equal(verifySignature(body, undefined, 'app-secret'), false);
  assert.equal(verifySignature(undefined, good, 'app-secret'), false);
});

test('delivery state: read beats delivered beats sent, and a late failure never overwrites a delivery', () => {
  assert.equal(pickDelivery(null, 'sent'), 'sent');
  assert.equal(pickDelivery('sent', 'delivered'), 'delivered');
  assert.equal(pickDelivery('read', 'delivered'), 'read');
  assert.equal(pickDelivery('delivered', 'failed'), 'delivered');
  assert.equal(pickDelivery('sent', 'failed'), 'failed');
  assert.equal(pickDelivery('failed', 'delivered'), 'delivered');
});

test('messages go out between 08:00 and 20:00 Nairobi time, the day counts from Nairobi midnight, and the spacing has a default', () => {
  assert.equal(inSendWindow(new Date('2026-11-08T04:59:00Z')), false); // 07:59 EAT
  assert.equal(inSendWindow(new Date('2026-11-08T05:00:00Z')), true);  // 08:00 EAT
  assert.equal(inSendWindow(new Date('2026-11-08T16:59:00Z')), true);  // 19:59 EAT
  assert.equal(inSendWindow(new Date('2026-11-08T17:00:00Z')), false); // 20:00 EAT
  assert.equal(startOfNairobiDay(new Date('2026-11-08T10:00:00Z')).toISOString(), '2026-11-07T21:00:00.000Z');
  assert.deepEqual(sequenceDelaysHours(undefined), [24, 48, 72]);
  assert.deepEqual(sequenceDelaysHours('1,2,3'), [1, 2, 3]);
  assert.deepEqual(sequenceDelaysHours('1,2'), [24, 48, 72]);
});

// --- against a real database (KITS_TEST_DATABASE_URL, a scratch database) -----------------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const PREFIX = '2547990';

async function world(opts: { sendText?: (to: string, body: string) => any; sendTemplate?: (to: string, params: string[], template?: string) => any } = {}) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => {
    await prisma.whatsappOutreach.deleteMany({ where: { phone: { startsWith: PREFIX } } });
    await prisma.whatsappContact.deleteMany({ where: { phone: { startsWith: PREFIX } } });
    await prisma.whatsappMessageStatus.deleteMany({ where: { messageId: { startsWith: 'wamid.TEST' } } });
    await prisma.dailyReportRun.deleteMany({ where: { reportDate: '2099-01-01' } });
    await prisma.customer.deleteMany({ where: { email: { startsWith: 'wa-test-' } } });
    await prisma.supplier.deleteMany({ where: { name: 'WA test supplier' } });
  };
  await cleanup();
  const texts: Array<{ to: string; body: string }> = [];
  const templates: Array<{ to: string; params: string[]; template?: string }> = [];
  const whatsapp: any = {
    isConfigured: true,
    normalisePhone: (p: string) => { const d = String(p).replace(/\D/g, ''); return d.length >= 9 ? d : null; },
    sendText: async (to: string, body: string) => { texts.push({ to, body }); return opts.sendText ? opts.sendText(to, body) : { delivered: true, messageId: `wamid.TEXT${texts.length}` }; },
    sendTemplate: async (to: string, params: string[], template?: string) => { templates.push({ to, params, template }); return opts.sendTemplate ? opts.sendTemplate(to, params, template) : { delivered: true, messageId: `wamid.TEST${templates.length}` }; },
  };
  const pages: any = { findOne: async () => ({ content: { community: { whatsappGroupUrl: 'https://chat.whatsapp.com/g', googleProfileUrl: 'https://g.page/r/x/review' } } }) };
  const outreach = new WhatsAppOutreachService(prisma as any, whatsapp, pages);
  const contacts = new WhatsappContactsService(prisma as any, whatsapp);
  const sequence = new WhatsappSequenceService(prisma as any, whatsapp, outreach);
  const message = (from: string, text: string | null, extra: any = {}) => ({ id: `wamid.IN${Math.random()}`, from, name: 'Wanjiru K', type: 'text', text, referral: null, timestamp: null, ...extra });
  return { prisma, whatsapp, outreach, contacts, sequence, texts, templates, message, cleanup };
}

const HOUR = 3_600_000;
const inWindow = () => { const d = new Date(); d.setUTCHours(8, 0, 0, 0); return d; }; // 11:00 Nairobi today

db('the first message from someone subscribes them: told once that updates are coming and how to stop, with the ad that brought them', async () => {
  const w = await world();
  try {
    const phone = `${PREFIX}00001`;
    const referral = { sourceId: '1203', headline: 'Puma Roma', clickId: 'abc' };
    assert.equal(await w.contacts.handleMessage(w.message(phone, 'Hi is it available?', { referral })), 'SUBSCRIBED');
    // Meta delivers the same event twice now and then; a second message is just seen. The notice is sent once.
    assert.equal(await w.contacts.handleMessage(w.message(phone, 'Hello?')), 'SEEN');
    assert.deepEqual(w.texts.map((t) => [t.to, t.body]), [[phone, NOTICE_TEXT]]);
    assert.match(NOTICE_TEXT, /Reply STOP/);
    const c = await w.prisma.whatsappContact.findUniqueOrThrow({ where: { phone } });
    assert.deepEqual([c.subscribed, c.name, c.adSourceId, c.adHeadline, c.adClickId, c.nextStep], [true, 'Wanjiru K', '1203', 'Puma Roma', 'abc', 0]);
    assert.ok(c.noticeSentAt);
    // The first onboarding message is a day away.
    const due = c.nextStepAt!.getTime() - Date.now();
    assert.ok(due > 23 * HOUR && due <= 24 * HOUR + 1000, `due in ${due}ms`);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('STOP unsubscribes at once, is confirmed, and nothing the shop sends reaches that number again, until START', async () => {
  const w = await world();
  try {
    const phone = `${PREFIX}00002`;
    await w.contacts.handleMessage(w.message(phone, 'Hi'));
    assert.equal(await w.contacts.handleMessage(w.message(phone, 'STOP')), 'STOPPED');
    assert.match(w.texts[w.texts.length - 1].body, /unsubscribed/);
    let c = await w.prisma.whatsappContact.findUniqueOrThrow({ where: { phone } });
    assert.deepEqual([c.subscribed, c.unsubscribedReason, c.nextStepAt], [false, 'STOP', null]);

    // Writing again does not resubscribe them or send the notice again.
    const before = w.texts.length;
    await w.contacts.handleMessage(w.message(phone, 'Is the Puma still there?'));
    assert.equal(w.texts.length, before);
    assert.equal((await w.prisma.whatsappContact.findUniqueOrThrow({ where: { phone } })).subscribed, false);

    // Every other way of sending is stopped too.
    assert.deepEqual(await w.outreach.sendToPhone({ kind: 'APP', phone, triggeredBy: 't' }), { outcome: 'SKIPPED', detail: 'Replied STOP' });
    assert.equal(w.templates.length, 0);
    const customer = await w.prisma.customer.create({ data: { firstName: 'Stop', lastName: 'Person', email: `wa-test-${Date.now()}@example.test`, phone: `+${phone}` } });
    const sent = await w.outreach.send({ kind: 'APP', customerIds: [customer.id], triggeredBy: 't' });
    assert.deepEqual([sent.sent, sent.skipped, sent.results[0].detail], [0, 1, 'Replied STOP']);

    assert.equal(await w.contacts.handleMessage(w.message(phone, 'START')), 'RESUBSCRIBED');
    c = await w.prisma.whatsappContact.findUniqueOrThrow({ where: { phone } });
    assert.deepEqual([c.subscribed, c.unsubscribedReason], [true, null]);
    assert.ok(c.nextStepAt);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a reseller, a wholesaler or a supplier who writes is recorded but never subscribed or messaged', async () => {
  const w = await world();
  try {
    const reseller = `${PREFIX}00003`;
    const supplier = `${PREFIX}00004`;
    await w.prisma.customer.create({ data: { firstName: 'Re', lastName: 'Seller', email: `wa-test-r${Date.now()}@example.test`, phone: `+${reseller}`, priceTier: 'RESELLER' } });
    await w.prisma.supplier.create({ data: { name: 'WA test supplier', phone: `0${supplier.slice(3)}` } });
    assert.equal(await w.contacts.handleMessage(w.message(reseller, 'Hi')), 'RECORDED_TRADE');
    assert.equal(await w.contacts.handleMessage(w.message(supplier, 'Hi')), 'RECORDED_TRADE');
    assert.equal(w.texts.length, 0);
    const rows = await w.prisma.whatsappContact.findMany({ where: { phone: { in: [reseller, supplier] } } });
    assert.deepEqual(rows.map((r) => [r.subscribed, r.unsubscribedReason]), [[false, 'TRADE'], [false, 'TRADE']]);
    // START does not turn a trade contact into a subscriber.
    assert.equal(await w.contacts.handleMessage(w.message(reseller, 'START')), 'IGNORED');
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('if the notice cannot be sent the person is not put through the sequence, and the next message tries again', async () => {
  let fail = true;
  const w = await world({ sendText: () => (fail ? { delivered: false, error: 'billing' } : { delivered: true, messageId: 'wamid.TEXT' }) });
  try {
    const phone = `${PREFIX}00005`;
    await w.contacts.handleMessage(w.message(phone, 'Hi'));
    let c = await w.prisma.whatsappContact.findUniqueOrThrow({ where: { phone } });
    assert.equal(c.noticeSentAt, null);
    await w.prisma.whatsappContact.update({ where: { phone }, data: { nextStepAt: new Date(Date.now() - 1000) } });
    assert.deepEqual(await w.sequence.tick(inWindow()), { sent: 0, failed: 0, skipped: 0 });
    assert.equal(w.templates.length, 0);

    fail = false;
    await w.contacts.handleMessage(w.message(phone, 'Hello again'));
    c = await w.prisma.whatsappContact.findUniqueOrThrow({ where: { phone } });
    assert.ok(c.noticeSentAt);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('the sequence sends the app, group and rating messages in turn, once each, only inside the send window and under the daily cap', async () => {
  const w = await world();
  try {
    const phone = `${PREFIX}00006`;
    await w.contacts.handleMessage(w.message(phone, 'Hi'));
    const make = async () => w.prisma.whatsappContact.update({ where: { phone }, data: { nextStepAt: new Date(Date.now() - 1000) } });
    await make();

    // Outside 08:00 to 20:00 Nairobi nothing is sent.
    const night = new Date(); night.setUTCHours(1, 0, 0, 0);
    assert.deepEqual(await w.sequence.tick(night), { sent: 0, failed: 0, skipped: 0 });
    // Two checks at once (the two backend slots) send it once.
    const results = await Promise.all([w.sequence.tick(inWindow()), w.sequence.tick(inWindow())]);
    assert.equal(results.reduce((n, r) => n + r.sent, 0), 1);
    assert.deepEqual(w.templates.map((t) => [t.template, t.params[1]]), [['drip_app_download', 'https://play.google.com/store/apps/details?id=com.dripemporium.app']]);
    let c = await w.prisma.whatsappContact.findUniqueOrThrow({ where: { phone } });
    assert.equal(c.nextStep, 1);
    assert.ok(c.nextStepAt!.getTime() > Date.now() + 47 * HOUR);

    await make(); await w.sequence.tick(inWindow());
    await make(); await w.sequence.tick(inWindow());
    assert.deepEqual(w.templates.map((t) => t.template), ['drip_app_download', 'drip_join_group', 'drip_rate_us']);
    c = await w.prisma.whatsappContact.findUniqueOrThrow({ where: { phone } });
    assert.deepEqual([c.nextStep, c.nextStepAt], [3, null]);
    // Finished: nothing more, ever.
    await w.sequence.tick(inWindow());
    assert.equal(w.templates.length, 3);

    // The daily cap holds the rest back.
    process.env.WHATSAPP_DAILY_SEND_CAP = '1';
    const other = `${PREFIX}00007`;
    await w.contacts.handleMessage(w.message(other, 'Hi'));
    await w.prisma.whatsappContact.update({ where: { phone: other }, data: { nextStepAt: new Date(Date.now() - 1000) } });
    assert.equal((await w.sequence.tick(inWindow())).sent, 0);
    delete process.env.WHATSAPP_DAILY_SEND_CAP;
  } finally { delete process.env.WHATSAPP_DAILY_SEND_CAP; await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a failing number is retried a few times and then given up on; someone who replies STOP while waiting is skipped', async () => {
  const w = await world({ sendTemplate: () => ({ delivered: false, error: 'not on WhatsApp' }) });
  try {
    const phone = `${PREFIX}00008`;
    await w.contacts.handleMessage(w.message(phone, 'Hi'));
    for (let i = 1; i <= 5; i++) {
      await w.prisma.whatsappContact.update({ where: { phone }, data: { nextStepAt: new Date(Date.now() - 1000) } });
      assert.equal((await w.sequence.tick(inWindow())).failed, 1);
    }
    const c = await w.prisma.whatsappContact.findUniqueOrThrow({ where: { phone } });
    assert.deepEqual([c.failures, c.nextStepAt, c.nextStep], [5, null, 0]);

    const stopper = `${PREFIX}00009`;
    await w.contacts.handleMessage(w.message(stopper, 'Hi'));
    await w.prisma.whatsappContact.update({ where: { phone: stopper }, data: { nextStepAt: new Date(Date.now() - 1000) } });
    await w.prisma.whatsappContact.update({ where: { phone: stopper }, data: { subscribed: true } });
    await w.contacts.handleMessage(w.message(stopper, 'STOP'));
    const before = w.templates.length;
    await w.sequence.tick(inWindow());
    assert.equal(w.templates.length, before);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db("Meta's delivery reports land on the daily report and outreach rows they belong to, whatever order they arrive in", async () => {
  const w = await world();
  try {
    await w.prisma.dailyReportRun.create({ data: { reportDate: '2099-01-01', channel: 'WHATSAPP', recipient: `${PREFIX}00010`, status: 'SENT', messageId: 'wamid.TESTREPORT' } });
    await w.prisma.whatsappOutreach.create({ data: { phone: `${PREFIX}00010`, kind: 'APP', template: 't', status: 'SENT', messageId: 'wamid.TESTOUT', triggeredBy: 't' } });
    const status = (id: string, s: string, extra: any = {}) => ({ id, status: s, recipient: `${PREFIX}00010`, timestamp: new Date(), errorCode: null, errorTitle: null, ...extra });
    // Read arrives before delivered; the row ends on read.
    await w.contacts.recordStatus(status('wamid.TESTREPORT', 'sent'));
    await w.contacts.recordStatus(status('wamid.TESTREPORT', 'read'));
    await w.contacts.recordStatus(status('wamid.TESTREPORT', 'delivered'));
    await w.contacts.recordStatus(status('wamid.TESTREPORT', 'delivered')); // a repeat is harmless
    assert.equal((await w.prisma.dailyReportRun.findFirstOrThrow({ where: { reportDate: '2099-01-01' } })).delivery, 'read');
    assert.equal(await w.prisma.whatsappMessageStatus.count({ where: { messageId: 'wamid.TESTREPORT' } }), 3);
    // A failure keeps its reason.
    await w.contacts.recordStatus(status('wamid.TESTOUT', 'failed', { errorCode: '131026', errorTitle: 'Message undeliverable' }));
    const out = await w.prisma.whatsappOutreach.findFirstOrThrow({ where: { messageId: 'wamid.TESTOUT' } });
    assert.deepEqual([out.delivery, out.deliveryError], ['failed', '131026: Message undeliverable']);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('the webhook address carries a secret: wrong or unset means no such endpoint, a missing signature is refused when an app secret is set, and a good event is handled', async () => {
  const w = await world();
  try {
    const controller = new WhatsappWebhookController(w.contacts);
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    delete process.env.WHATSAPP_APP_SECRET;
    assert.throws(() => controller.verify('anything', 'subscribe', 'anything', 'c'), NotFoundException);

    process.env.WHATSAPP_WEBHOOK_SECRET = 'long-random-secret';
    assert.throws(() => controller.verify('wrong', 'subscribe', 'wrong', 'c'), NotFoundException);
    assert.throws(() => controller.verify('long-random-secret', 'subscribe', 'not-the-token', 'c'), UnauthorizedException);
    assert.equal(controller.verify('long-random-secret', 'subscribe', 'long-random-secret', 'CHALLENGE'), 'CHALLENGE');
    await assert.rejects(() => controller.receive('wrong', payload(), { headers: {} }), NotFoundException);

    const phone = `${PREFIX}00011`;
    const body: any = payload();
    body.entry[0].changes[0].value.messages[0].from = phone;
    body.entry[0].changes[0].value.contacts[0].wa_id = phone;
    body.entry[0].changes[0].value.statuses = [];
    assert.deepEqual(await controller.receive('long-random-secret', body, { headers: {} }), { received: true });
    assert.ok(await w.prisma.whatsappContact.findUnique({ where: { phone } }));

    // With an app secret set, an event without Meta's signature is refused.
    process.env.WHATSAPP_APP_SECRET = 'app-secret';
    await assert.rejects(() => controller.receive('long-random-secret', body, { headers: {}, rawBody: Buffer.from(JSON.stringify(body)) }), UnauthorizedException);
    const raw = Buffer.from(JSON.stringify(body));
    const signature = `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}`;
    assert.deepEqual(await controller.receive('long-random-secret', body, { headers: { 'x-hub-signature-256': signature }, rawBody: raw }), { received: true });
  } finally {
    delete process.env.WHATSAPP_WEBHOOK_SECRET; delete process.env.WHATSAPP_APP_SECRET;
    await w.cleanup(); await w.prisma.$disconnect();
  }
});

// --- the WhatsApp report -------------------------------------------------------------------------------------------

import { WhatsappReportService } from '../src/insights/whatsapp-report.service';

db('the WhatsApp report counts chats, opt-outs, onboarding, delivery, failures, and the chats that became orders (matched across phone spellings)', async () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => {
    await prisma.whatsappOutreach.deleteMany({ where: { phone: { startsWith: PREFIX } } });
    await prisma.whatsappContact.deleteMany({ where: { phone: { startsWith: PREFIX } } });
    await prisma.whatsappMessageStatus.deleteMany({ where: { messageId: { startsWith: 'wamid.TESTREP' } } });
    await prisma.dailyReportRun.deleteMany({ where: { reportDate: '2099-01-02' } });
    await prisma.order.deleteMany({ where: { orderNumber: { startsWith: 'WAREP' } } });
    await prisma.store.deleteMany({ where: { code: 'WAREP' } });
  };
  await cleanup();
  try {
    const now = new Date();
    const hourLater = new Date(now.getTime() + HOUR);
    const mk = (n: number, over: any = {}) => prisma.whatsappContact.create({ data: { phone: `${PREFIX}0010${n}`, name: `P${n}`, noticeSentAt: now, ...over } });
    await mk(1, { adSourceId: 'AD1', adHeadline: 'Puma Roma' });
    await mk(2, { adSourceId: 'AD1', adHeadline: 'Puma Roma', subscribed: false, unsubscribedReason: 'STOP' });
    await mk(3, { nextStep: 3 });
    await mk(4, { subscribed: false, unsubscribedReason: 'TRADE' });
    await mk(5, { adSourceId: 'AD2', adHeadline: 'Air Max', noticeSentAt: null });

    const store = await prisma.store.create({ data: { code: 'WAREP', name: 'Report test' } });
    const order = (n: number, phone: string, over: any = {}) => prisma.order.create({
      data: { orderNumber: `WAREP-${n}`, storeId: store.id, customerPhone: phone, status: 'PAID', channel: 'WEBSITE', subtotal: 1, total: 1, placedAt: hourLater, ...over },
    });
    await order(1, '0799000101', { total: 5000 });                                   // 0xxx spelling, after the first message: counts
    await order(2, `+${PREFIX}00103`, { total: 3000, status: 'PENDING' });           // +254 spelling: counts
    await order(3, '0799000102', { total: 900, status: 'CANCELLED' });               // cancelled: never counts
    await order(4, '0799000104', { total: 700, placedAt: new Date(now.getTime() - 24 * HOUR) }); // before they ever wrote: not theirs

    const out = (kind: string, status: string, delivery: string | null, n: number) => prisma.whatsappOutreach.create({ data: { phone: `${PREFIX}0010${n}`, kind, template: 't', status, delivery, triggeredBy: 't', messageId: `wamid.TESTREP${kind}${n}` } });
    await out('APP', 'SENT', 'read', 1); await out('APP', 'SENT', 'delivered', 3); await out('APP', 'SENT', null, 5);
    await out('GROUP', 'SENT', 'failed', 1); await out('GROUP', 'FAILED', null, 2);
    await prisma.dailyReportRun.create({ data: { reportDate: '2099-01-02', channel: 'WHATSAPP', recipient: `${PREFIX}00109`, status: 'SENT', delivery: 'read' } });
    for (const id of ['wamid.TESTREP1', 'wamid.TESTREP2']) await prisma.whatsappMessageStatus.create({ data: { messageId: id, recipient: `${PREFIX}00101`, status: 'failed', errorCode: '131026', errorTitle: 'Message undeliverable', occurredAt: now } });

    const r = await new WhatsappReportService(prisma as any).report(new Date(now.getTime() - 24 * HOUR), new Date(now.getTime() + 2 * HOUR));

    const c = r.contacts;
    assert.deepEqual([c.total, c.newInPeriod, c.fromAds, c.subscribed, c.stopped, c.trade, c.notTold], [5, 5, 3, 3, 1, 1, 1]);
    assert.equal(c.stopRate, 0.25);
    assert.equal(c.daily.reduce((n, d) => n + d.chats, 0), 5);
    assert.deepEqual(r.onboarding, { waitingForApp: 2, waitingForGroup: 0, waitingForRating: 0, finished: 1, gaveUp: 0 });

    const app = r.messages.templates.find((t) => t.kind === 'APP')!;
    assert.deepEqual([app.sent, app.read, app.delivered, app.awaiting, app.notDelivered, app.failedToSend], [3, 1, 1, 1, 0, 0]);
    const group = r.messages.templates.find((t) => t.kind === 'GROUP')!;
    assert.deepEqual([group.sent, group.notDelivered, group.failedToSend], [1, 1, 1]);
    assert.deepEqual([r.messages.dailyReports.sent, r.messages.dailyReports.read], [1, 1]);
    // 4 messages have a delivery report; 3 of them arrived.
    assert.deepEqual([r.messages.checked, r.messages.arrivedRate], [4, 0.75]);
    assert.deepEqual(r.messages.topFailures, [{ reason: 'Message undeliverable', count: 2 }]);

    const ad1 = r.ads.find((a) => a.adSourceId === 'AD1')!;
    assert.deepEqual([ad1.headline, ad1.chats, ad1.stopped, ad1.orders, ad1.revenueKes], ['Puma Roma', 2, 1, 1, 5000]);
    assert.deepEqual(r.ads.find((a) => a.adSourceId === 'AD2')!.chats, 1);
    const organic = r.ads.find((a) => a.adSourceId === null)!;
    assert.deepEqual([organic.chats, organic.orders, organic.revenueKes], [2, 1, 3000]);
    assert.deepEqual(r.chatsToOrders, { chats: 5, buyers: 2, orders: 2, revenueKes: 8000 });
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
});
