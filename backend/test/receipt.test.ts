import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReceipt } from '../src/common/receipt';

const base = {
  orderNumber: 'DE-2026-00002',
  storeName: 'Dubai Merchants Mall',
  placedAt: '2026-11-24T19:41:00.000Z',
  name: 'wanjiku kamau',
  phone: '0712 345 678',
  lines: [{ name: 'Air Max 90 Black', size: 'EUR 42', quantity: 1, lineTotal: 3800 }],
  discount: 0,
  shipping: 0,
  total: 3800,
  paid: 3800,
  payments: [{ method: 'MPESA', amount: 3800 }],
};

test('a settled in-store order reads as a thank-you receipt, addressed to the first name', () => {
  const r = buildReceipt(base)!;
  assert.match(r.message, /^Hi Wanjiku, thank you for shopping at Drip Emporium \(Dubai Merchants Mall\)\./);
  assert.match(r.message, /Receipt DE-2026-00002, 24 Nov 2026/);
  assert.match(r.message, /1\. Air Max 90 Black, size EUR 42 \(x1\): KES 3,800/);
  assert.match(r.message, /Paid: KES 3,800 \(M-Pesa\)/);
  assert.match(r.message, /Balance: settled/);
  assert.doesNotMatch(r.message, /Balance to pay/);
});

test('the phone is normalised to international digits and the link carries the message', () => {
  const r = buildReceipt(base)!;
  assert.equal(r.phone, '254712345678');
  assert.ok(r.url.startsWith('https://wa.me/254712345678?text='));
  assert.equal(decodeURIComponent(r.url.split('?text=')[1]), r.message);
});

test('a part-paid order shows what is owing and asks for the M-Pesa code', () => {
  const r = buildReceipt({ ...base, total: 4100, shipping: 300, paid: 2000 })!;
  assert.match(r.message, /Delivery: KES 300/);
  assert.match(r.message, /Total: KES 4,100/);
  assert.match(r.message, /Balance to pay: KES 2,100/);
  assert.match(r.message, /M-Pesa code/);
});

test('an unpaid order says nothing has been paid', () => {
  const r = buildReceipt({ ...base, paid: 0, payments: [] })!;
  assert.match(r.message, /Paid: nothing yet/);
  assert.match(r.message, /Balance to pay: KES 3,800/);
});

test('a discount is shown, a one-size item has no size, and a walk-in is greeted as "there"', () => {
  const r = buildReceipt({ ...base, name: 'Walk-in', discount: 200, total: 3600, paid: 3600, lines: [{ name: 'Watch', size: 'Standard', quantity: 2, lineTotal: 3800 }] })!;
  assert.match(r.message, /^Hi there,/);
  assert.match(r.message, /Discount: -KES 200/);
  assert.match(r.message, /1\. Watch \(x2\): KES 3,800/);
});

test('no phone, or no items, means no receipt', () => {
  assert.equal(buildReceipt({ ...base, phone: null }), null);
  assert.equal(buildReceipt({ ...base, phone: '' }), null);
  assert.equal(buildReceipt({ ...base, lines: [] }), null);
});
