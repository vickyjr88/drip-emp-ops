import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFollowUp, greetingName, productPath } from '../src/common/follow-up';
import { followUpFor } from '../src/cart-lead/cart-lead.service';

const origin = 'https://dripemporium.store';
const roma = { name: 'Puma Roma Triple Black', size: '42', quantity: 1, unitPrice: 4200, path: '/shop/puma-roma' };
const watch = { name: 'Bagolee Chrono', size: null, quantity: 2, unitPrice: 4500, path: '/watches/bagolee-chrono' };

const decode = (url: string) => decodeURIComponent(url.split('?text=')[1]);

test('a product is linked at the page it lives on: shoes in the shop, watches and kits in their own sections', () => {
  assert.equal(productPath({ slug: 'a', line: 'SHOP' }), '/shop/a');
  assert.equal(productPath({ slug: 'a', line: null }), '/shop/a');
  assert.equal(productPath({ slug: 'a', line: 'WATCH' }), '/watches/a');
  assert.equal(productPath({ slug: 'a', line: 'KIT' }), '/kits/a');
});

test('the greeting uses a first name, and falls back to "there" for a walk-in or no name', () => {
  assert.equal(greetingName('wanjiru kamau'), 'Wanjiru');
  assert.equal(greetingName('  Brian '), 'Brian');
  assert.equal(greetingName('Walk-in'), 'there');
  assert.equal(greetingName(''), 'there');
  assert.equal(greetingName(null), 'there');
});

test('an abandoned cart: what was left, a tagged link to each product, the total, and a way back', () => {
  const f = buildFollowUp({ kind: 'ABANDONED_CART', name: 'Wanjiru Kamau', phone: '0722 111 222', lines: [roma, watch], total: 13200, origin })!;
  assert.equal(f.phone, '254722111222');
  assert.ok(f.url.startsWith('https://wa.me/254722111222?text='));
  const m = decode(f.url);
  assert.equal(m, [
    "Hi Wanjiru, it's Drip Emporium. You left these in your cart:",
    '',
    '1. Puma Roma Triple Black, size 42 (x1): KES 4,200',
    '   https://dripemporium.store/shop/puma-roma?utm_source=whatsapp&utm_medium=followup&utm_campaign=abandoned-cart',
    '2. Bagolee Chrono (x2): KES 9,000',
    '   https://dripemporium.store/watches/bagolee-chrono?utm_source=whatsapp&utm_medium=followup&utm_campaign=abandoned-cart',
    '',
    'Total: KES 13,200',
    '',
    "Still keen? Reply here and we'll reserve them for you and arrange delivery or pickup.",
  ].join('\n'));
  assert.equal(f.message, m);
});

test('the same product in two sizes is linked once, and a size typed by hand (no page) has no link', () => {
  const f = buildFollowUp({
    kind: 'ABANDONED_CART', name: 'A', phone: '+254722111222', total: 12600, origin,
    lines: [roma, { ...roma, size: '43' }, { name: 'Custom pair', size: '47', quantity: 1, unitPrice: 4200, path: null }],
  })!;
  const links = f.message.split('\n').filter((l) => l.includes('https://dripemporium.store'));
  assert.equal(links.length, 1);
  assert.match(f.message, /3\. Custom pair, size 47 \(x1\): KES 4,200\n\nTotal/);
});

test('a product with no sizes is not given one: "Standard" is stored, not said', () => {
  const m = buildFollowUp({ kind: 'ABANDONED_CART', name: 'A', phone: '0722111222', lines: [{ name: 'Bagolee Chrono', size: 'Standard', quantity: 1, unitPrice: 4500, path: '/watches/b' }], total: 4500, origin })!.message;
  assert.match(m, /1\. Bagolee Chrono \(x1\): KES 4,500/);
  assert.doesNotMatch(m, /size/i);
});

test('a long cart is cut short and says how many more there are', () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ name: `Pair ${i}`, quantity: 1, unitPrice: 1000, path: `/shop/p-${i}` }));
  const f = buildFollowUp({ kind: 'ABANDONED_CART', name: 'A', phone: '0722111222', lines: many, total: 11000, origin })!;
  assert.match(f.message, /8\. Pair 7/);
  assert.doesNotMatch(f.message, /9\. Pair 8/);
  assert.match(f.message, /\.\.\.and 3 more\./);
});

test('an order is worded for where it has got to, and asks for the balance while it is unpaid', () => {
  const base = { kind: 'ORDER' as const, name: 'Brian', phone: '0733444555', lines: [roma], total: 4200, orderNumber: 'DE-0042', origin };
  const unpaid = decode(buildFollowUp({ ...base, orderStatus: 'PENDING', balance: 4200 })!.url);
  assert.match(unpaid, /Thank you for your order DE-0042:/);
  assert.match(unpaid, /Balance to pay: KES 4,200\. How would you like to pay\?/);
  assert.match(unpaid, /utm_campaign=order-payment/);
  assert.match(decode(buildFollowUp({ ...base, orderStatus: 'PAID', balance: 0 })!.url), /Your order DE-0042 is confirmed and we are getting it ready/);
  assert.match(decode(buildFollowUp({ ...base, orderStatus: 'PACKED', balance: 0 })!.url), /getting it ready/);
  assert.match(decode(buildFollowUp({ ...base, orderStatus: 'SHIPPED', balance: 0 })!.url), /Your order DE-0042 is on its way/);
  const delivered = decode(buildFollowUp({ ...base, orderStatus: 'DELIVERED', balance: 0 })!.url);
  assert.match(delivered, /We hope you are enjoying your order DE-0042/);
  assert.match(delivered, /photo of you/);
  // A part-paid order asks only for what is still owed.
  assert.match(decode(buildFollowUp({ ...base, orderStatus: 'PENDING', balance: 1700 })!.url), /Balance to pay: KES 1,700\./);
});

test('nothing to send: no usable phone, no items, or an order that was cancelled or refunded', () => {
  const ok = { kind: 'ABANDONED_CART' as const, name: 'A', phone: '0722111222', lines: [roma], total: 4200, origin };
  assert.ok(buildFollowUp(ok));
  assert.equal(buildFollowUp({ ...ok, phone: null }), null);
  assert.equal(buildFollowUp({ ...ok, phone: 'n/a' }), null);
  assert.equal(buildFollowUp({ ...ok, phone: '123' }), null);
  assert.equal(buildFollowUp({ ...ok, lines: [] }), null);
  assert.equal(buildFollowUp({ ...ok, kind: 'ORDER', orderStatus: 'CANCELLED' }), null);
  assert.equal(buildFollowUp({ ...ok, kind: 'ORDER', orderStatus: 'REFUNDED' }), null);
});

test('a WhatsApp order request is followed up as one, not as a forgotten cart', () => {
  const m = decode(buildFollowUp({ kind: 'WHATSAPP_ORDER', name: 'Otieno', phone: '+254744666777', lines: [roma], total: 4200, origin })!.url);
  assert.match(m, /Following up on the order you asked about:/);
  assert.match(m, /Tell us where to deliver and how you would like to pay\./);
});

test('a lead gets a follow-up only while it is open, using the account when the lead has no phone of its own', () => {
  const lead = (over: any = {}) => ({
    source: 'ABANDONED_CART', status: 'NEW', customerName: null, customerPhone: null, total: 4200,
    lines: [{ name: 'Puma Roma', size: '42', quantity: 1, priceKes: 4200, path: '/shop/puma-roma' }],
    customer: { firstName: 'Wanjiru', lastName: 'K', phone: '+254722111222' }, ...over,
  });
  const f = followUpFor(lead())!;
  assert.equal(f.phone, '254722111222');
  assert.match(f.message, /^Hi Wanjiru,/);
  assert.ok(followUpFor(lead({ status: 'CONTACTED' })));
  assert.equal(followUpFor(lead({ status: 'CONVERTED' })), null);
  assert.equal(followUpFor(lead({ status: 'EXPIRED' })), null);
  assert.equal(followUpFor(lead({ customer: null })), null);
});
