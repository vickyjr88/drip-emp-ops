import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { WhatsAppService } from '../src/daily-report/whatsapp.service';
import { WhatsAppOutreachService } from '../src/whatsapp-outreach/whatsapp-outreach.service';
import {
  COOLDOWN_DAYS, MAX_ATTEMPTS, RETRY_AFTER_HOURS, nextAttemptAt, pairsPhrase, requestTiming, reviewRequestEmail, reviewRequestTemplate, reviewRequestsEnabled,
} from '../src/reviews/review-requests.rules';
import { ReviewRequestsService } from '../src/reviews/review-requests.service';
import { ReviewsService } from '../src/reviews/reviews.service';
import { orderNumberOfToken, reviewToken } from '../src/reviews/reviews.rules';

// --- the rules (no database) -------------------------------------------------------------------------------------------------

test('it is off unless switched on, and the settings fall back to sensible values when they are nonsense', () => {
  assert.equal(reviewRequestsEnabled({}), false);
  for (const v of ['false', '0', '', 'no', 'maybe']) assert.equal(reviewRequestsEnabled({ REVIEW_REQUESTS_ENABLED: v }), false, v);
  for (const v of ['true', 'TRUE', ' on ', 'yes', '1']) assert.equal(reviewRequestsEnabled({ REVIEW_REQUESTS_ENABLED: v }), true, v);
  assert.deepEqual(requestTiming({}), { delayHours: 24, maxAgeDays: 7 });
  assert.deepEqual(requestTiming({ REVIEW_REQUEST_DELAY_HOURS: '0', REVIEW_REQUEST_MAX_AGE_DAYS: '30' }), { delayHours: 0, maxAgeDays: 30 });
  for (const bad of ['-1', '2.5', 'soon', '', '721']) assert.equal(requestTiming({ REVIEW_REQUEST_DELAY_HOURS: bad }).delayHours, 24, bad);
  for (const bad of ['0', '-3', '91', 'week']) assert.equal(requestTiming({ REVIEW_REQUEST_MAX_AGE_DAYS: bad }).maxAgeDays, 7, bad);
  assert.equal(reviewRequestTemplate({}), 'drip_review_request');
  assert.equal(reviewRequestTemplate({ WHATSAPP_TEMPLATE_REVIEW_REQUEST: ' my_template ' }), 'my_template');
});

test('a failed channel is retried a few times, six hours apart, and then left alone', () => {
  const now = new Date('2026-11-20T09:00:00Z');
  assert.equal(nextAttemptAt(false, 1, now), null);
  assert.equal(nextAttemptAt(true, MAX_ATTEMPTS, now), null);
  assert.equal(nextAttemptAt(true, 1, now)?.getTime(), now.getTime() + RETRY_AFTER_HOURS * 3_600_000);
});

test('the pairs are named in a short phrase, and the email says what it should, with everything escaped', () => {
  assert.equal(pairsPhrase([]), 'your new pair');
  assert.equal(pairsPhrase(['Air Max']), 'Air Max');
  assert.equal(pairsPhrase(['Air Max', 'Roma', 'Air Max']), 'Air Max and Roma');
  assert.equal(pairsPhrase(['A', 'B', 'C', 'D']), 'A, B and 2 more');
  const mail = reviewRequestEmail({ firstName: 'Wanjiku', products: ['<b>Air</b> Max'], link: 'https://shop.test/review/DE-1.abc' });
  assert.match(mail.subject, /review/i);
  assert.ok(mail.html.includes('https://shop.test/review/DE-1.abc'));
  assert.ok(mail.html.includes('How are your pairs, Wanjiku?'));
  assert.ok(!mail.html.includes('<b>Air</b>'), 'product names are escaped');
  assert.ok(mail.html.includes('&lt;b&gt;Air&lt;/b&gt; Max'));
});

// --- the flows, against a real database (KITS_TEST_DATABASE_URL, a scratch database) -----------------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = (name: string, fn: () => Promise<void>) => test(name, { skip: url ? false : 'KITS_TEST_DATABASE_URL is not set' }, fn);

const saved = { ...process.env };
afterEach(() => {
  for (const key of ['REVIEW_REQUESTS_ENABLED', 'REVIEW_REQUEST_DELAY_HOURS', 'REVIEW_REQUEST_MAX_AGE_DAYS', 'WHATSAPP_DAILY_SEND_CAP', 'STOREFRONT_ORIGIN', 'REVIEW_TOKEN_SECRET']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});

/** Midday in Nairobi, inside the send window. */
const NOON = new Date('2026-11-20T09:00:00Z');
const hoursBefore = (hours: number, from = NOON) => new Date(from.getTime() - hours * 3_600_000);

async function harness() {
  process.env.REVIEW_REQUESTS_ENABLED = 'true';
  process.env.STOREFRONT_ORIGIN = 'https://shop.test';
  process.env.REVIEW_TOKEN_SECRET = 'test-secret';
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tag = `rq${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const category = await prisma.productCategory.upsert({ where: { slug: 'rqtest-shoes' }, update: {}, create: { name: 'RQTest Shoes', slug: 'rqtest-shoes' } });
  const product = await prisma.product.create({
    data: { sku: `RQ-${tag}`, name: `RQ Runner ${tag}`, slug: `rq-${tag}`, brand: 'Nike', categoryId: category.id, imageUrls: [], variants: { create: [{ sku: `RQ-${tag}-42`, name: 'EUR 42', attributes: { size: 'EUR 42' }, priceKes: 5000 }] } },
    include: { variants: true },
  });
  await prisma.store.upsert({ where: { code: 'RQTEST' }, update: {}, create: { code: 'RQTEST', name: 'RQTest Store' } });
  const store = await prisma.store.findUniqueOrThrow({ where: { code: 'RQTEST' } });

  const phoneOf = (n: number) => `07${String(Math.abs([...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 17) + n * 104729) % 100000000).padStart(8, '0')}`;
  const intl = (n: number) => `254${phoneOf(n).slice(1)}`;

  // The two senders are fakes that record what they were asked to send; the database, the reviews service and the STOP check are real.
  const sent = { whatsapp: [] as Array<{ to: string; params: string[]; template: string }>, email: [] as Array<{ recipient: string; subject: string; html: string }> };
  const control = { whatsappFails: false, emailFails: false, configured: true };
  const whatsapp = {
    get isConfigured() { return control.configured; },
    normalisePhone: (raw: string) => WhatsAppService.prototype.normalisePhone.call({}, raw),
    sendTemplate: async (to: string, params: string[], template: string) => {
      if (control.whatsappFails) return { delivered: false, error: 'Template not approved' };
      sent.whatsapp.push({ to, params, template });
      return { delivered: true, messageId: `wamid.${tag}.${sent.whatsapp.length}` };
    },
  } as unknown as WhatsAppService;
  const email = {
    send: async (p: { recipient: string; subject: string; html: string }) => {
      if (control.emailFails) return { status: 'FAILED', errorMessage: 'Mail provider down' };
      sent.email.push(p);
      return { status: 'SENT' };
    },
  } as any;
  const outreach = new WhatsAppOutreachService(prisma as any, whatsapp, null as any);
  const make = () => new ReviewRequestsService(prisma as any, new ReviewsService(prisma as any), whatsapp, email, outreach);

  let n = 0;
  /** A delivered retail order for one pair, by default with both a phone and an email. */
  const order = async (over: { person?: number; fulfilledAt?: Date | null; status?: any; priceTier?: any; email?: string | null; phone?: boolean; name?: string } = {}) => {
    n += 1;
    const person = over.person ?? n;
    return prisma.order.create({
      data: {
        orderNumber: `RQ-${tag}-${n}`, storeId: store.id, status: over.status ?? 'DELIVERED', priceTier: over.priceTier ?? 'RETAIL',
        fulfilledAt: over.fulfilledAt === undefined ? hoursBefore(30) : over.fulfilledAt,
        customerName: over.name ?? `Buyer${String.fromCharCode(64 + (person % 26 || 1))} Kamau`,
        customerPhone: over.phone === false ? null : phoneOf(person),
        customerEmail: over.email === undefined ? `buyer${person}.${tag}@example.com` : over.email,
        lines: { create: [{ variantId: product.variants[0].id, description: product.name, quantity: 1, unitPrice: 5000, listPrice: 5000, lineTotal: 5000 }] },
      },
    });
  };
  const request = (orderId: string) => prisma.reviewRequest.findUnique({ where: { orderId } });
  const cleanup = async () => {
    const orders = await prisma.order.findMany({ where: { orderNumber: { startsWith: `RQ-${tag}` } }, select: { id: true } });
    const ids = orders.map((o) => o.id);
    await prisma.productReview.deleteMany({ where: { productId: product.id } });
    await prisma.reviewRequest.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.whatsappOutreach.deleteMany({ where: { template: { in: ['drip_review_request', `custom_${tag}`] }, phone: { in: Array.from({ length: 40 }, (_, i) => intl(i)) } } });
    await prisma.whatsappContact.deleteMany({ where: { phone: { in: Array.from({ length: 40 }, (_, i) => intl(i)) } } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.productVariant.deleteMany({ where: { productId: product.id } });
    await prisma.product.deleteMany({ where: { id: product.id } });
    await prisma.$disconnect();
  };
  return { prisma, make, order, request, sent, control, phoneOf, intl, tag, product, cleanup };
}

db('a delivered order is asked once, by email and by WhatsApp, each with the order\'s own review link', async () => {
  const h = await harness();
  try {
    const order = await h.order();
    const service = h.make();
    const first = await service.tick(NOON);
    assert.deepEqual([first.asked, first.emailSent, first.whatsappSent, first.failed], [1, 1, 1, 0]);

    assert.equal(h.sent.email.length, 1);
    assert.equal(h.sent.whatsapp.length, 1);
    const link = `https://shop.test/review/`;
    const token = h.sent.email[0].html.match(/https:\/\/shop\.test\/review\/([A-Za-z0-9._-]+)/)?.[1] ?? '';
    assert.equal(orderNumberOfToken(token, 'test-secret'), order.orderNumber, 'the link is signed for this very order');
    assert.equal(h.sent.email[0].recipient, order.customerEmail);
    assert.match(h.sent.email[0].html, /Review my pair/);
    assert.equal(h.sent.whatsapp[0].to, h.intl(Number(order.orderNumber.split('-').pop())));
    assert.equal(h.sent.whatsapp[0].template, 'drip_review_request');
    assert.deepEqual(h.sent.whatsapp[0].params, [h.sent.whatsapp[0].params[0], `${link}${token}`]);
    assert.match(h.sent.whatsapp[0].params[0], /^[A-Z][a-z]+$/, 'the greeting is a first name');

    const row = await h.request(order.id);
    assert.deepEqual([row?.emailStatus, row?.whatsappStatus, row?.nextAttemptAt], ['SENT', 'SENT', null]);
    assert.ok(row?.whatsappMessageId);

    // It is in the WhatsApp log too, so it counts towards the daily limit and delivery reports attach to it.
    const logged = await h.prisma.whatsappOutreach.findFirst({ where: { messageId: row!.whatsappMessageId! } });
    assert.deepEqual([logged?.kind, logged?.status, logged?.triggeredBy, logged?.customerId], ['REVIEW_REQUEST', 'SENT', 'review-request', null]);

    // Asked once: another check, or a later one, sends nothing more.
    const again = await service.tick(NOON);
    assert.deepEqual([again.asked, again.retried], [0, 0]);
    await service.tick(new Date(NOON.getTime() + 3 * 86_400_000));
    assert.equal(h.sent.email.length + h.sent.whatsapp.length, 2);
  } finally { await h.cleanup(); }
});

db('nothing is sent unless it is switched on, and nothing outside the send window', async () => {
  const h = await harness();
  try {
    const order = await h.order();
    delete process.env.REVIEW_REQUESTS_ENABLED;
    assert.deepEqual(await h.make().tick(NOON), { asked: 0, retried: 0, emailSent: 0, whatsappSent: 0, failed: 0 });
    process.env.REVIEW_REQUESTS_ENABLED = 'true';
    await h.make().tick(new Date('2026-11-20T19:30:00Z')); // 22:30 Nairobi
    await h.make().tick(new Date('2026-11-20T03:00:00Z')); // 06:00 Nairobi
    assert.equal(await h.request(order.id), null);
    assert.equal(h.sent.email.length + h.sent.whatsapp.length, 0);
    await h.make().tick(NOON);
    assert.equal((await h.request(order.id))?.whatsappStatus, 'SENT');
  } finally { await h.cleanup(); }
});

db('only the right orders are asked: delivered, retail, past the delay and not too old', async () => {
  const h = await harness();
  try {
    const right = await h.order({ fulfilledAt: hoursBefore(30) });
    const tooSoon = await h.order({ fulfilledAt: hoursBefore(5) });
    const tooOld = await h.order({ fulfilledAt: hoursBefore(24 * 9) });
    const notDelivered = await h.order({ status: 'SHIPPED', fulfilledAt: null });
    const refunded = await h.order({ status: 'REFUNDED' });
    const reseller = await h.order({ priceTier: 'RESELLER' });
    const wholesale = await h.order({ priceTier: 'WHOLESALE' });
    const result = await h.make().tick(NOON);
    assert.equal(result.asked, 1);
    assert.ok(await h.request(right.id));
    for (const o of [tooSoon, tooOld, notDelivered, refunded, reseller, wholesale]) assert.equal(await h.request(o.id), null, o.orderNumber);

    // The delay is a setting: with none, the recent one goes too; a longer reach back brings the old one in.
    process.env.REVIEW_REQUEST_DELAY_HOURS = '0';
    process.env.REVIEW_REQUEST_MAX_AGE_DAYS = '14';
    await h.make().tick(NOON);
    assert.ok(await h.request(tooSoon.id));
    assert.ok(await h.request(tooOld.id));
    assert.equal(await h.request(reseller.id), null, 'a reseller is never asked, however it is set');
  } finally { await h.cleanup(); }
});

db('a phone-only customer is asked on WhatsApp and the email is skipped for a stated reason; no phone means email only', async () => {
  const h = await harness();
  try {
    const phoneOnly = await h.order({ email: null });
    const placeholder = await h.order({ email: '254700000000@customer.invalid' });
    const emailOnly = await h.order({ phone: false });
    await h.make().tick(NOON);
    for (const o of [phoneOnly, placeholder]) {
      const row = await h.request(o.id);
      assert.deepEqual([row?.emailStatus, row?.whatsappStatus], ['SKIPPED', 'SENT'], o.orderNumber);
      assert.match(row?.emailDetail ?? '', /phone number only/);
    }
    const row = await h.request(emailOnly.id);
    assert.deepEqual([row?.emailStatus, row?.whatsappStatus, row?.whatsappDetail], ['SENT', 'SKIPPED', 'No usable phone number']);
    assert.ok(h.sent.email.every((m) => !m.recipient.endsWith('.invalid')), 'nothing goes to a stand-in address');
  } finally { await h.cleanup(); }
});

db('someone who replied STOP on WhatsApp is not messaged there, but still gets the email', async () => {
  const h = await harness();
  try {
    const order = await h.order({ person: 7 });
    await h.prisma.whatsappContact.create({ data: { phone: h.intl(7), subscribed: false, unsubscribedReason: 'STOP' } });
    await h.make().tick(NOON);
    const row = await h.request(order.id);
    assert.deepEqual([row?.emailStatus, row?.whatsappStatus, row?.whatsappDetail], ['SENT', 'SKIPPED', 'Replied STOP']);
    assert.equal(h.sent.whatsapp.length, 0);
  } finally { await h.cleanup(); }
});

db('someone with two orders is not asked twice within two weeks, but is asked again after', async () => {
  const h = await harness();
  try {
    const first = await h.order({ person: 3, fulfilledAt: hoursBefore(40) });
    const second = await h.order({ person: 3, fulfilledAt: hoursBefore(30) });
    // `first` and `second` are the same person: same phone, same email.
    await h.make().tick(NOON);
    const rows = [await h.request(first.id), await h.request(second.id)];
    assert.deepEqual(rows.map((r) => [r?.emailStatus, r?.whatsappStatus]), [['SENT', 'SENT'], ['SKIPPED', 'SKIPPED']]);
    assert.match(rows[1]?.emailDetail ?? '', /Asked recently, for order RQ-/);
    assert.equal(h.sent.email.length, 1);
    assert.equal(h.sent.whatsapp.length, 1);

    // A later order, once the cooldown has passed, is asked.
    const later = new Date(NOON.getTime() + (COOLDOWN_DAYS + 1) * 86_400_000);
    const third = await h.order({ person: 3, fulfilledAt: hoursBefore(30, later) });
    await h.make().tick(later);
    assert.deepEqual([(await h.request(third.id))?.emailStatus, (await h.request(third.id))?.whatsappStatus], ['SENT', 'SENT']);
  } finally { await h.cleanup(); }
});

db('a customer who has already reviewed every pair in the order is not asked', async () => {
  const h = await harness();
  try {
    const order = await h.order();
    const reviews = new ReviewsService(h.prisma as any);
    await reviews.submitForOrder(reviewToken(order.orderNumber), [{ productSlug: h.product.slug, rating: 5, body: 'Lovely pair, very comfortable and light.' }]);
    await h.make().tick(NOON);
    const row = await h.request(order.id);
    assert.deepEqual([row?.emailStatus, row?.whatsappStatus, row?.emailDetail], ['SKIPPED', 'SKIPPED', 'Already reviewed']);
    assert.equal(h.sent.email.length + h.sent.whatsapp.length, 0);
  } finally { await h.cleanup(); }
});

db('a failed channel is retried on its own: the one that worked is not sent again, and it stops after the last attempt', async () => {
  const h = await harness();
  try {
    const order = await h.order();
    h.control.whatsappFails = true;
    const service = h.make();
    const first = await service.tick(NOON);
    assert.deepEqual([first.emailSent, first.whatsappSent, first.failed], [1, 0, 1]);
    let row = await h.request(order.id);
    assert.deepEqual([row?.emailStatus, row?.whatsappStatus, row?.whatsappDetail, row?.attempts], ['SENT', 'FAILED', 'Template not approved', 1]);
    assert.ok(row?.nextAttemptAt);

    // Too early: nothing. Then the template is approved: only WhatsApp is sent.
    assert.equal((await service.tick(new Date(NOON.getTime() + 2 * 3_600_000))).retried, 0);
    h.control.whatsappFails = false;
    const retry = await service.tick(new Date(NOON.getTime() + (RETRY_AFTER_HOURS + 0.1) * 3_600_000));
    assert.deepEqual([retry.retried, retry.emailSent, retry.whatsappSent], [1, 0, 1]);
    row = await h.request(order.id);
    assert.deepEqual([row?.whatsappStatus, row?.attempts, row?.nextAttemptAt], ['SENT', 2, null]);
    assert.equal(h.sent.email.length, 1, 'the email was not sent a second time');
    assert.equal(h.sent.whatsapp.length, 1);

    // One that keeps failing is given up on.
    const stubborn = await h.order({ fulfilledAt: hoursBefore(30) });
    h.control.emailFails = true;
    h.control.whatsappFails = true;
    // Each check a day apart, inside the send window and past the retry gap.
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await service.tick(new Date(NOON.getTime() + i * 86_400_000));
    const given = await h.request(stubborn.id);
    assert.equal(given?.attempts, MAX_ATTEMPTS);
    assert.equal(given?.nextAttemptAt, null);
  } finally { await h.cleanup(); }
});

db('when WhatsApp is not set up or the day\'s limit is reached, the email still goes and the WhatsApp message is tried again', async () => {
  const h = await harness();
  try {
    h.control.configured = false;
    const a = await h.order();
    await h.make().tick(NOON);
    let row = await h.request(a.id);
    assert.deepEqual([row?.emailStatus, row?.whatsappStatus, row?.whatsappDetail], ['SENT', 'FAILED', 'WhatsApp is not configured on this server']);
    assert.ok(row?.nextAttemptAt);

    h.control.configured = true;
    process.env.WHATSAPP_DAILY_SEND_CAP = '0';
    const b = await h.order();
    await h.make().tick(NOON);
    row = await h.request(b.id);
    assert.equal(row?.emailStatus, 'SENT');
    assert.equal(row?.whatsappStatus, 'FAILED');
    assert.match(row?.whatsappDetail ?? '', /daily limit of 0/);
    assert.equal(h.sent.whatsapp.length, 0);
  } finally { await h.cleanup(); }
});

db('two backend slots checking at the same moment send each message once', async () => {
  const h = await harness();
  try {
    for (let i = 0; i < 4; i++) await h.order();
    await Promise.all([h.make().tick(NOON), h.make().tick(NOON), h.make().tick(NOON)]);
    assert.equal(h.sent.email.length, 4);
    assert.equal(h.sent.whatsapp.length, 4);
    assert.equal(await h.prisma.reviewRequest.count({ where: { order: { orderNumber: { startsWith: `RQ-${h.tag}` } } } }), 4);
  } finally { await h.cleanup(); }
});

db('staff see what the automatic request did for each order, and whether it is on', async () => {
  const h = await harness();
  try {
    const order = await h.order({ email: null });
    const service = h.make();
    await service.tick(NOON);
    const list = await new ReviewsService(h.prisma as any).requests();
    const mine = list.find((r: any) => r.orderNumber === order.orderNumber) as any;
    assert.equal(mine.auto.whatsapp.status, 'SENT');
    assert.equal(mine.auto.email.status, 'SKIPPED');
    assert.deepEqual(service.status(), { enabled: true, delayHours: 24, maxAgeDays: 7, template: 'drip_review_request', whatsappConfigured: true });
    delete process.env.REVIEW_REQUESTS_ENABLED;
    assert.equal(service.status().enabled, false);
  } finally { await h.cleanup(); }
});
