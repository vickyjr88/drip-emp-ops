import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_MIN_REVIEWS_PRODUCT, DEFAULT_MIN_REVIEWS_SITE, cleanContact, cleanReview, displayNameOf, distribution, enoughToShow, orderNumberOfToken, reviewThresholds,
  reviewToken, reviewerKeyOf, summarise,
} from '../src/reviews/reviews.rules';
import { ReviewsService } from '../src/reviews/reviews.service';
import { StorefrontService } from '../src/storefront/storefront.service';

// --- the rules (no database) -------------------------------------------------------------------------------------------------

test('it takes three approved reviews for a product and ten for the site, unless set otherwise; nonsense settings are ignored', () => {
  assert.deepEqual(reviewThresholds({}), { product: DEFAULT_MIN_REVIEWS_PRODUCT, site: DEFAULT_MIN_REVIEWS_SITE });
  assert.deepEqual(reviewThresholds({}), { product: 3, site: 10 });
  assert.deepEqual(reviewThresholds({ REVIEWS_MIN_PRODUCT: '5', REVIEWS_MIN_SITE: '20' }), { product: 5, site: 20 });
  for (const bad of ['0', '-2', '2.5', 'many', '', '1001']) assert.deepEqual(reviewThresholds({ REVIEWS_MIN_PRODUCT: bad, REVIEWS_MIN_SITE: bad }), { product: 3, site: 10 }, bad);
});

test('reviews are enough only at the threshold or above', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => enoughToShow(n, 3)), [false, false, false, true, true]);
});

test('the average is to one decimal and no reviews has no average, not zero stars', () => {
  assert.deepEqual(summarise([]), { count: 0, average: null });
  assert.deepEqual(summarise([5, 4, 4]), { count: 3, average: 4.3 });
  assert.deepEqual(summarise([5, 5, 5, 4]), { count: 4, average: 4.8 });
  assert.deepEqual(distribution([5, 5, 4, 1, 9, 0]), [1, 0, 0, 1, 2], 'only ratings from 1 to 5 are counted');
});

test('a name is shown as a first name and a last initial, and nothing else', () => {
  assert.equal(displayNameOf('wanjiku kamau'), 'Wanjiku K.');
  assert.equal(displayNameOf('WANJIKU KAMAU'), 'Wanjiku K.');
  assert.equal(displayNameOf('deShawn mcKinley'), 'DeShawn M.', 'capitals inside a name are the person\'s own');
  assert.equal(displayNameOf("  JOHN   o'neil "), 'John O.');
  assert.equal(displayNameOf('Wanjiku'), 'Wanjiku');
  assert.equal(displayNameOf('Mary Jane Wambui Kariuki'), 'Mary K.');
  assert.equal(displayNameOf('Chebet 0722 123 456'), 'Chebet');
  assert.equal(displayNameOf('Ngũgĩ wa Thiong’o'), 'Ngũgĩ T.');
  for (const none of ['', '   ', '0722123456', '🔥🔥', null, undefined]) assert.equal(displayNameOf(none as any), 'A customer', String(none));
  assert.equal(displayNameOf('A'.repeat(60)).length, 20);
});

test('a review needs a rating of 1 to 5 and a few words; links, emails and phone numbers are kept out', () => {
  const ok = { rating: 5, body: 'Lovely pair, fits true to size.' };
  assert.deepEqual(cleanReview(ok), { rating: 5, title: null, body: 'Lovely pair, fits true to size.' });
  assert.equal(cleanReview({ ...ok, rating: '4' }).rating, 4, 'a rating typed into a form is a string');
  for (const rating of [0, 6, 4.5, -1, 'abc', '', null, undefined, NaN]) assert.throws(() => cleanReview({ ...ok, rating }), /1 to 5 stars/, String(rating));

  assert.throws(() => cleanReview({ rating: 5, body: 'too short' }), /at least 10/);
  assert.equal(cleanReview({ rating: 5, body: 'abcdefghij' }).body.length, 10);
  assert.equal(cleanReview({ rating: 5, body: 'x'.repeat(1000) }).body.length, 1000);
  assert.throws(() => cleanReview({ rating: 5, body: 'x'.repeat(1001) }), /under 1,000/);
  assert.throws(() => cleanReview({ ...ok, title: 'x'.repeat(81) }), /under 80/);
  assert.equal(cleanReview({ ...ok, title: '  Great  \n pair ' }).title, 'Great pair');

  for (const text of ['Buy yours at www.cheapshoes.co.ke now', 'see https://x.com/abc for more', 'order from shoes.co.ke', 'visit mysite.com']) assert.throws(() => cleanReview({ rating: 5, body: text }), /web links/, text);
  assert.throws(() => cleanReview({ rating: 5, body: 'email me wanjiku@example.com please' }), /email addresses/);
  for (const text of ['call me on 0722 123 456 for more', 'whatsapp +254722123456 thanks', 'ring 0722-123-456 any time']) assert.throws(() => cleanReview({ rating: 5, body: text }), /phone numbers/, text);
  // Ordinary numbers in a review are fine.
  assert.equal(cleanReview({ rating: 5, body: 'Bought size 42 and 43, 2 pairs, KES 3,500 each.' }).rating, 5);
  assert.equal(cleanReview({ rating: 5, body: 'First line.\r\n\r\n\r\n\r\nSecond line  with   spaces.' }).body, 'First line.\n\nSecond line with spaces.');
});

test('a phone number or an email is needed to show the review is from a person, and must look right', () => {
  assert.deepEqual(cleanContact({ phone: '0722123456' }), { phone: '0722123456', email: null });
  assert.deepEqual(cleanContact({ email: ' W@Example.com ' }), { phone: null, email: 'w@example.com' });
  assert.deepEqual(cleanContact({ phone: '0722123456', email: 'w@example.com' }), { phone: '0722123456', email: 'w@example.com' });
  assert.throws(() => cleanContact({}), /phone number or email/);
  assert.throws(() => cleanContact({ phone: '   ', email: '' }), /phone number or email/);
  assert.throws(() => cleanContact({ phone: '12345' }), /phone number does not look right/);
  assert.throws(() => cleanContact({ email: 'not an email' }), /email address does not look right/);
});

test('one person is one key however they wrote their number, and the phone wins so the product page and the order link agree', () => {
  const a = reviewerKeyOf({ phone: '0722123456' });
  assert.equal(a, reviewerKeyOf({ phone: '+254 722 123 456' }));
  assert.equal(a, reviewerKeyOf({ phone: '0722123456', email: 'x@y.co', customerId: 'c1' }), 'a customer on an order with the same phone is the same person');
  assert.notEqual(a, reviewerKeyOf({ phone: '0722123457' }));
  assert.equal(reviewerKeyOf({ email: 'W@x.co' }), reviewerKeyOf({ email: 'w@x.co' }));
  assert.notEqual(reviewerKeyOf({ email: 'w@x.co' }), reviewerKeyOf({ customerId: 'c1' }));
  assert.match(a, /^[0-9a-f]{64}$/, 'a hash, not the number');
  assert.equal(a.includes('722123456'), false);
  assert.throws(() => reviewerKeyOf({}), /phone number or email/);
});

test('the link for an order only works for that order, and only if the shop made it', () => {
  const secret = 'test-secret';
  const token = reviewToken('DE-2026-00007', secret);
  assert.match(token, /^DE-2026-00007\.[A-Za-z0-9_-]{22}$/);
  assert.equal(orderNumberOfToken(token, secret), 'DE-2026-00007');
  assert.equal(orderNumberOfToken(token.replace('00007', '00008'), secret), null, 'another order');
  assert.equal(orderNumberOfToken(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), secret), null, 'a changed signature');
  assert.equal(orderNumberOfToken(token.slice(0, -3), secret), null, 'cut short');
  assert.equal(orderNumberOfToken(token, 'another-secret'), null, 'made with another secret');
  for (const bad of ['', '.', 'DE-2026-00007', 'DE-2026-00007.', '.abc', 'x.y']) assert.equal(orderNumberOfToken(bad, secret), null, JSON.stringify(bad));
});

// --- the flows, against a real database (KITS_TEST_DATABASE_URL, a scratch database) -----------------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = (name: string, fn: () => Promise<void>) => test(name, { skip: url ? false : 'KITS_TEST_DATABASE_URL is not set' }, fn);

const saved = { ...process.env };
afterEach(() => {
  for (const key of ['REVIEWS_MIN_PRODUCT', 'REVIEWS_MIN_SITE']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});

async function harness() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tag = `rv${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const category = await prisma.productCategory.upsert({ where: { slug: 'rtest-shoes' }, update: {}, create: { name: 'RTest Shoes', slug: 'rtest-shoes' } });
  const mk = (suffix: string, isActive = true) =>
    prisma.product.create({ data: { sku: `RT-${tag}-${suffix}`, name: `RTest ${suffix} ${tag}`, slug: `rtest-${tag}-${suffix}`, brand: 'Nike', categoryId: category.id, isActive, imageUrls: ['https://api.test/x.jpg'], variants: { create: [{ sku: `RT-${tag}-${suffix}-42`, name: 'EUR 42', attributes: { size: 'EUR 42' }, priceKes: 5000 }] } }, include: { variants: true } });
  const a = await mk('a');
  const b = await mk('b');
  const hidden = await mk('hidden', false);
  await prisma.store.upsert({ where: { code: 'RTEST' }, update: {}, create: { code: 'RTEST', name: 'RTest Store' } });
  const store = await prisma.store.findUniqueOrThrow({ where: { code: 'RTEST' } });
  const service = new ReviewsService(prisma as any);

  const phone = (n: number) => `07${String(Math.abs([...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 11) + n * 7919) % 100000000).padStart(8, '0')}`;
  const body = (n: number, extra: Record<string, unknown> = {}) => ({ name: `Reviewer${String.fromCharCode(65 + n)} Person`, phone: phone(n), rating: 5, body: `Really good pair number ${n}, very comfortable.`, ...extra });
  /** n approved reviews from different people on a product, made the way a person would: written, then approved by staff. */
  const approved = async (productSlug: string, n: number, from = 0) => {
    for (let i = from; i < from + n; i++) {
      await service.submit(productSlug, body(i));
      const row = await prisma.productReview.findFirstOrThrow({ where: { reviewerContact: phone(i), product: { slug: productSlug } } });
      await service.moderate(row.id, { status: 'APPROVED' }, 'staff@test');
    }
  };
  const order = async (status: 'PAID' | 'PENDING', n: number, products = [a]) => {
    const created = await prisma.order.create({
      data: {
        orderNumber: `RT-${tag}-${n}`, storeId: store.id, status, customerName: `Buyer${String.fromCharCode(65 + n)} Kamau`, customerPhone: phone(50 + n),
        lines: { create: products.map((p) => ({ variantId: p.variants[0].id, description: p.name, quantity: 1, unitPrice: 5000, listPrice: 5000, lineTotal: 5000 })) },
      },
    });
    return created;
  };
  const cleanup = async () => {
    const productIds = [a.id, b.id, hidden.id];
    await prisma.productReview.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.orderLine.deleteMany({ where: { order: { orderNumber: { startsWith: `RT-${tag}` } } } });
    await prisma.order.deleteMany({ where: { orderNumber: { startsWith: `RT-${tag}` } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$disconnect();
  };
  return { prisma, service, a, b, hidden, tag, phone, body, approved, order, cleanup };
}

db('a product\'s reviews show only once it has enough approved ones; below that nothing about them is revealed', async () => {
  const h = await harness();
  try {
    await h.approved(h.a.slug, 2);
    const below = await h.service.forProduct(h.a.id);
    assert.deepEqual(below, { visible: false, count: 2, average: null, distribution: null, minToShow: 3, items: [] });

    await h.approved(h.a.slug, 1, 2);
    const enough = await h.service.forProduct(h.a.id);
    assert.equal(enough.visible, true);
    assert.equal(enough.count, 3);
    assert.equal(enough.average, 5);
    assert.deepEqual(enough.distribution, [0, 0, 0, 0, 3]);
    assert.equal(enough.items.length, 3);
    assert.deepEqual(Object.keys(enough.items[0]).sort(), ['body', 'createdAt', 'displayName', 'id', 'rating', 'repliedAt', 'reply', 'title', 'verified']);
  } finally { await h.cleanup(); }
});

db('only approved reviews count: one waiting, one turned away, and one reopened do not make three', async () => {
  const h = await harness();
  try {
    await h.approved(h.a.slug, 2);
    await h.service.submit(h.a.slug, h.body(10)); // waiting
    await h.service.submit(h.a.slug, h.body(11));
    const turned = await h.prisma.productReview.findFirstOrThrow({ where: { reviewerContact: h.phone(11) } });
    await h.service.moderate(turned.id, { status: 'REJECTED', rejectionReason: 'looks like spam' }, 'staff@test');
    const view = await h.service.forProduct(h.a.id);
    assert.equal(view.visible, false);
    assert.equal(view.count, 2);

    // Approve the waiting one: now three, and it shows. Reject it again: back to hidden. Staff are told where it stands each time.
    const waiting = await h.prisma.productReview.findFirstOrThrow({ where: { reviewerContact: h.phone(10) } });
    const up = await h.service.moderate(waiting.id, { status: 'APPROVED' }, 'staff@test');
    assert.deepEqual(up.product, { approved: 3, minToShow: 3, visible: true });
    assert.equal((await h.service.forProduct(h.a.id)).visible, true);
    const down = await h.service.moderate(waiting.id, { status: 'REJECTED' }, 'staff@test');
    assert.deepEqual(down.product, { approved: 2, minToShow: 3, visible: false });
    assert.equal((await h.service.forProduct(h.a.id)).visible, false);
  } finally { await h.cleanup(); }
});

db('the threshold can be set, and reviews of one product never count towards another', async () => {
  const h = await harness();
  try {
    process.env.REVIEWS_MIN_PRODUCT = '1';
    await h.approved(h.a.slug, 1);
    assert.equal((await h.service.forProduct(h.a.id)).visible, true);
    assert.equal((await h.service.forProduct(h.b.id)).visible, false, 'another product has none');
    process.env.REVIEWS_MIN_PRODUCT = '2';
    assert.equal((await h.service.forProduct(h.a.id)).visible, false);
  } finally { await h.cleanup(); }
});

db('the whole shop\'s rating shows only with enough approved reviews across the shop', async () => {
  const h = await harness();
  try {
    process.env.REVIEWS_MIN_SITE = String((await h.prisma.productReview.count({ where: { status: 'APPROVED' } })) + 4);
    await h.approved(h.a.slug, 2);
    await h.approved(h.b.slug, 1, 2);
    assert.equal((await h.service.siteSummary()).visible, false);
    assert.equal((await h.service.siteSummary()).average, null);
    await h.approved(h.b.slug, 1, 3);
    const site = await h.service.siteSummary();
    assert.equal(site.visible, true);
    // Whatever else is approved in this database counts too, so the expected average is worked out from every approved rating.
    const all = await h.prisma.productReview.findMany({ where: { status: 'APPROVED' }, select: { rating: true } });
    assert.equal(site.average, Math.round((all.reduce((s, r) => s + r.rating, 0) / all.length) * 10) / 10);
  } finally { await h.cleanup(); }
});

db('a review left on a product page waits for approval, is never "verified", and one person leaves one review', async () => {
  const h = await harness();
  try {
    assert.deepEqual(await h.service.submit(h.a.slug, h.body(1)), { received: true });
    const row = await h.prisma.productReview.findFirstOrThrow({ where: { productId: h.a.id } });
    assert.deepEqual([row.status, row.verifiedPurchase, row.source, row.displayName, row.orderId], ['PENDING', false, 'product-page', 'ReviewerB P.', null]);
    assert.equal(row.reviewerContact, h.phone(1));

    // The same person, the number typed another way: already reviewed. A different person is fine.
    await assert.rejects(() => h.service.submit(h.a.slug, h.body(1, { phone: h.phone(1).replace(/^0/, '+254 ') })), /already reviewed/);
    await h.service.submit(h.a.slug, h.body(2));
    // The same person may review another pair.
    await h.service.submit(h.b.slug, h.body(1));
    assert.equal(await h.prisma.productReview.count({ where: { productId: { in: [h.a.id, h.b.id] } } }), 3);
  } finally { await h.cleanup(); }
});

db('a robot (the hidden field filled in) is thanked and dropped; bad input is refused with a message; an unknown or switched-off product is not found', async () => {
  const h = await harness();
  try {
    assert.deepEqual(await h.service.submit(h.a.slug, h.body(1, { website: 'http://spam.example' })), { received: true });
    assert.equal(await h.prisma.productReview.count({ where: { productId: h.a.id } }), 0);
    await assert.rejects(() => h.service.submit(h.a.slug, h.body(1, { rating: 9 })), /1 to 5 stars/);
    await assert.rejects(() => h.service.submit(h.a.slug, h.body(1, { body: 'see www.spam.com' })), /web links/);
    await assert.rejects(() => h.service.submit(h.a.slug, h.body(1, { name: '' })), /first name/);
    await assert.rejects(() => h.service.submit(h.a.slug, { ...h.body(1), phone: undefined }), /phone number or email/);
    await assert.rejects(() => h.service.submit('no-such-product', h.body(1)), /not found/);
    await assert.rejects(() => h.service.submit(h.hidden.slug, h.body(1)), /not found/);
    assert.equal(await h.prisma.productReview.count({ where: { productId: h.a.id } }), 0);
  } finally { await h.cleanup(); }
});

db('what the public gets back never carries who wrote it: no phone, no email, no hash', async () => {
  const h = await harness();
  try {
    process.env.REVIEWS_MIN_PRODUCT = '1';
    await h.service.submit(h.a.slug, h.body(1, { email: 'secret.person@example.com' }));
    const row = await h.prisma.productReview.findFirstOrThrow({ where: { productId: h.a.id } });
    await h.service.moderate(row.id, { status: 'APPROVED' }, 'staff@test');
    const text = JSON.stringify(await h.service.forSlug(h.a.slug));
    for (const secret of [h.phone(1), h.phone(1).slice(-9), 'secret.person', row.reviewerKey, 'reviewerContact', 'reviewerKey']) assert.equal(text.includes(secret), false, secret);
    assert.ok(text.includes('ReviewerB P.'));
  } finally { await h.cleanup(); }
});

db('the product page\'s own data carries the reviews, and carries them only once there are enough', async () => {
  const h = await harness();
  try {
    const storefront = new StorefrontService(h.prisma as any);
    await h.approved(h.a.slug, 2);
    const before = await storefront.bySlug(h.a.slug);
    assert.equal((before as any).reviews.visible, false);
    assert.deepEqual((before as any).reviews.items, []);
    await h.approved(h.a.slug, 1, 2);
    const after = await storefront.bySlug(h.a.slug);
    assert.equal((after as any).reviews.visible, true);
    assert.equal((after as any).reviews.items.length, 3);
  } finally { await h.cleanup(); }
});

db('the link for a paid order lets the customer review what they bought: verified, waiting for approval, once per pair', async () => {
  const h = await harness();
  try {
    const paid = await h.order('PAID', 1, [h.a, h.b]);
    const token = reviewToken(paid.orderNumber);
    const view = await h.service.orderForToken(token);
    assert.equal(view.firstName, 'BuyerB');
    assert.deepEqual(view.items.map((i) => [i.slug, i.reviewed]), [[h.a.slug, false], [h.b.slug, false]]);

    const out = await h.service.submitForOrder(token, [{ productSlug: h.a.slug, rating: 4, body: 'Good quality, true to size.' }]);
    assert.deepEqual(out, { created: 1, alreadyReviewed: 0 });
    const row = await h.prisma.productReview.findFirstOrThrow({ where: { productId: h.a.id } });
    assert.deepEqual([row.status, row.verifiedPurchase, row.source, row.orderId, row.displayName], ['PENDING', true, 'order-link', paid.id, 'BuyerB K.']);
    assert.equal((await h.service.orderForToken(token)).items.find((i) => i.slug === h.a.slug)!.reviewed, true);

    const again = await h.service.submitForOrder(token, [{ productSlug: h.a.slug, rating: 1, body: 'Trying to review it again.' }, { productSlug: h.b.slug, rating: 5, body: 'Lovely second pair as well.' }]);
    assert.deepEqual(again, { created: 1, alreadyReviewed: 1 });
    assert.equal(await h.prisma.productReview.count({ where: { productId: h.a.id } }), 1, 'the first review stands');

    // Approved, it shows as a verified purchase.
    process.env.REVIEWS_MIN_PRODUCT = '1';
    await h.service.moderate(row.id, { status: 'APPROVED' }, 'staff@test');
    assert.equal((await h.service.forProduct(h.a.id)).items[0].verified, true);
  } finally { await h.cleanup(); }
});

db('an order link is refused when it is not the shop\'s, the order is not paid, or the pair is not in the order', async () => {
  const h = await harness();
  try {
    const paid = await h.order('PAID', 2);
    const unpaid = await h.order('PENDING', 3);
    const good = reviewToken(paid.orderNumber);
    await assert.rejects(() => h.service.orderForToken(good.slice(0, -2) + 'xx'), /not valid/);
    await assert.rejects(() => h.service.orderForToken('RT-nothing.abcdefghijklmnopqrstuv'), /not valid/);
    await assert.rejects(() => h.service.orderForToken(reviewToken(unpaid.orderNumber)), /not ready/);
    await assert.rejects(() => h.service.submitForOrder(reviewToken(unpaid.orderNumber), [{ productSlug: h.a.slug, rating: 5, body: 'Not paid for yet.' }]), /not ready/);
    await assert.rejects(() => h.service.submitForOrder(good, [{ productSlug: h.b.slug, rating: 5, body: 'A pair that is not in this order.' }]), /not in this order/);
    await assert.rejects(() => h.service.submitForOrder(good, []), /at least one pair/);
    await assert.rejects(() => h.service.submitForOrder(good, [{ productSlug: h.a.slug, rating: 5, body: 'short' }]), /at least 10/);
    assert.equal(await h.prisma.productReview.count({ where: { productId: { in: [h.a.id, h.b.id] } } }), 0);
  } finally { await h.cleanup(); }
});

db('a customer who reviewed on the product page cannot review the same pair again through their order link', async () => {
  const h = await harness();
  try {
    const paid = await h.order('PAID', 4);
    await h.service.submit(h.a.slug, { name: 'Buyer Kamau', phone: paid.customerPhone, rating: 5, body: 'Written on the product page first.' });
    const out = await h.service.submitForOrder(reviewToken(paid.orderNumber), [{ productSlug: h.a.slug, rating: 5, body: 'And again through the link.' }]);
    assert.deepEqual(out, { created: 0, alreadyReviewed: 1 });
  } finally { await h.cleanup(); }
});

db('staff can reply, edit the reply, clear it, and delete; a reply has a length limit and a review must exist', async () => {
  const h = await harness();
  try {
    await h.service.submit(h.a.slug, h.body(1));
    const row = await h.prisma.productReview.findFirstOrThrow({ where: { productId: h.a.id } });
    const replied = await h.service.moderate(row.id, { reply: '  Thank you, glad you like them!  ' }, 'staff@test');
    assert.equal(replied.review.reply, 'Thank you, glad you like them!');
    assert.ok(replied.review.repliedAt);
    assert.equal(replied.review.status, 'PENDING', 'a reply does not approve it');
    assert.equal('reviewerKey' in replied.review, false, 'staff do not see the internal hash');
    assert.equal((await h.service.moderate(row.id, { reply: '' }, 'staff@test')).review.reply, null);
    await assert.rejects(() => h.service.moderate(row.id, { reply: 'x'.repeat(501) }, 'staff@test'), /under 500/);
    await assert.rejects(() => h.service.moderate('no-such-id', { status: 'APPROVED' }, 'staff@test'), /not found/);

    const rejected = await h.service.moderate(row.id, { status: 'REJECTED', rejectionReason: 'Not about the pair' }, 'staff@test');
    assert.deepEqual([rejected.review.rejectionReason, rejected.review.moderatedBy], ['Not about the pair', 'staff@test']);
    const reopened = await h.service.moderate(row.id, { status: 'APPROVED' }, 'staff@test');
    assert.equal(reopened.review.rejectionReason, null, 'approving clears a reason for rejecting');
    assert.deepEqual(await h.service.remove(row.id), { removed: true, product: { approved: 0, minToShow: 3, visible: false } });
    await assert.rejects(() => h.service.remove(row.id), /not found/);
  } finally { await h.cleanup(); }
});

db('staff can add a review a customer sent another way: approved at once, marked as staff entered, never verified', async () => {
  const h = await harness();
  try {
    const out = await h.service.addManual({ productId: h.a.id, rating: 5, body: 'Sent to us on WhatsApp: lovely shoes.', name: 'Achieng Odhiambo' }, 'staff@test');
    assert.deepEqual([out.review.status, out.review.source, out.review.verifiedPurchase, out.review.displayName, out.review.moderatedBy], ['APPROVED', 'staff', false, 'Achieng O.', 'staff@test']);
    assert.deepEqual(out.product, { approved: 1, minToShow: 3, visible: false });
    await h.service.addManual({ productId: h.a.id, rating: 4, body: 'A second one from someone else.', name: 'Brian Mwangi' }, 'staff@test');
    await h.service.addManual({ productId: h.a.id, rating: 5, body: 'And the same person can be entered twice.', name: 'Achieng Odhiambo' }, 'staff@test');
    assert.equal((await h.service.forProduct(h.a.id)).visible, true);
    await assert.rejects(() => h.service.addManual({ productId: 'nope', rating: 5, body: 'A review for a missing product.', name: 'X Y' }, 's'), /not found/);
    await assert.rejects(() => h.service.addManual({ productId: h.a.id, rating: 5, body: 'See www.x.com for the best shoes.', name: 'X Y' }, 's'), /web links/);
  } finally { await h.cleanup(); }
});

db('staff see what is waiting, the filters work, and the counts say where each product stands against the threshold', async () => {
  const h = await harness();
  try {
    await h.approved(h.a.slug, 1);
    await h.service.submit(h.b.slug, h.body(7));
    const before = await h.service.counts();
    assert.equal(before.minPerProduct, 3);
    const pending = await h.service.list({ status: 'PENDING', productId: h.b.id });
    assert.equal(pending.total, 1);
    assert.equal(pending.items[0].reviewerContact, h.phone(7), 'staff see how to reach the reviewer');
    assert.equal(pending.items[0].product.slug, h.b.slug);
    assert.equal((await h.service.list({ status: 'APPROVED', productId: h.b.id })).total, 0);
    assert.equal((await h.service.list({ productId: h.a.id })).total, 1);
  } finally { await h.cleanup(); }
});

db('the "ask for a review" list has paid orders with a working link and a WhatsApp message, and knows who has already reviewed', async () => {
  const h = await harness();
  try {
    const paid = await h.order('PAID', 5, [h.a]);
    await h.order('PENDING', 6);
    const list = (await h.service.requests('https://shop.test')).filter((r) => r.orderNumber.startsWith(`RT-${h.tag}`));
    assert.deepEqual(list.map((r) => r.orderNumber), [paid.orderNumber], 'an unpaid order is not asked');
    const r = list[0];
    assert.equal(r.allReviewed, false);
    assert.ok(r.whatsappUrl!.startsWith(`https://wa.me/254${paid.customerPhone!.slice(1)}?text=`));
    assert.match(decodeURIComponent(r.whatsappUrl!), /Hi BuyerF/);
    const token = r.link.replace('https://shop.test/review/', '');
    assert.equal(orderNumberOfToken(token), paid.orderNumber, 'the link is the shop\'s own');

    await h.service.submitForOrder(token, [{ productSlug: h.a.slug, rating: 5, body: 'Arrived quickly, really happy.' }]);
    const after = (await h.service.requests('https://shop.test')).find((x) => x.orderNumber === paid.orderNumber)!;
    assert.equal(after.allReviewed, true);
  } finally { await h.cleanup(); }
});

db('a rating outside 1 to 5 cannot be stored even by a direct write', async () => {
  const h = await harness();
  try {
    await assert.rejects(() => h.prisma.productReview.create({ data: { productId: h.a.id, rating: 7, body: 'Too many stars for the rules.', displayName: 'X', reviewerKey: `k-${h.tag}` } }), /check|constraint/i);
    await assert.rejects(() => h.prisma.productReview.create({ data: { productId: h.a.id, rating: 0, body: 'Too few stars for the rules.', displayName: 'X', reviewerKey: `k2-${h.tag}` } }), /check|constraint/i);
  } finally { await h.cleanup(); }
});
