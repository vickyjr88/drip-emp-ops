import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoGrouping, bucketKey, buckets, changes, margin, previousRange, series, summarise, breakdowns, weekStart, type OrderFact, type PaymentFact } from '../src/sales-report/sales-report.metrics';

let n = 0;
const order = (over: Partial<OrderFact> = {}): OrderFact => ({
  id: `o${++n}`, status: 'PAID', channel: 'IN_STORE', priceTier: 'RETAIL', storeId: 's1', storeName: 'Mall', createdBy: 'a@x.test',
  buyerKey: 'c1', buyerName: 'Wanjiku', subtotal: 4000, discount: 0, shipping: 0, tax: 0, total: 4000, amountPaid: 4000,
  placedAt: new Date('2026-11-10T09:00:00Z'),
  lines: [{ productId: 'p1', productName: 'Air Max', quantity: 1, lineTotal: 4000, discount: 0, unitCost: 2500 }],
  ...over,
});
const pay = (amount: number, over: Partial<PaymentFact> = {}): PaymentFact => ({ amount, method: 'MPESA', receivedAt: new Date('2026-11-10T10:00:00Z'), source: 'ORDER', orderStatus: 'PAID', ...over });

test('only paid, packed, shipped and delivered orders are sales; unpaid, cancelled and refunded are counted apart', () => {
  const s = summarise(
    ['PAID', 'PACKED', 'SHIPPED', 'DELIVERED', 'PENDING', 'CANCELLED', 'REFUNDED'].map((status) => order({ status, amountPaid: status === 'PENDING' ? 0 : 4000 })),
    [],
  );
  assert.deepEqual([s.placed.count, s.sales.count, s.sales.revenue, s.unpaid.count, s.cancelled.count, s.refunded.count], [7, 4, 16000, 1, 1, 1]);
  assert.equal(s.sales.averageOrder, 4000);
  assert.equal(s.cancellationRate, 28.57);
  assert.deepEqual(s.moneyOnClosed, { amount: 8000, count: 2 });
});

test('what is owed on sales is what has not been recorded, and an overpayment owes nothing', () => {
  const s = summarise([order({ status: 'DELIVERED', amountPaid: 1000 }), order({ amountPaid: 4500 })], []);
  assert.deepEqual([s.sales.paid, s.sales.owed, s.sales.owedCount], [5000, 3000, 1]);
});

test('discounts add the order and line discounts, and money received is counted from payments by method', () => {
  const s = summarise(
    [order({ discount: 200, shipping: 300, lines: [{ productId: 'p1', productName: 'A', quantity: 2, lineTotal: 7900, discount: 100, unitCost: null }] })],
    [pay(3000), pay(500, { method: 'CASH' }), pay(1000, { source: 'CONSIGNMENT', method: 'CASH', orderStatus: undefined }), pay(700, { orderStatus: 'CANCELLED' })],
  );
  assert.deepEqual([s.goods.discounts, s.goods.shipping, s.sales.units, s.sales.unitsPerSale], [300, 300, 2, 2]);
  assert.deepEqual([s.received.total, s.received.fromOrders, s.received.fromPickups, s.received.onClosedOrders], [5200, 4200, 1000, 700]);
  assert.deepEqual(s.received.byMethod, [{ method: 'MPESA', count: 2, amount: 3700 }, { method: 'CASH', count: 2, amount: 1500 }]);
});

test('website orders show how many that were not cancelled got paid', () => {
  const s = summarise([order({ channel: 'WEBSITE' }), order({ channel: 'WEBSITE', status: 'PENDING', amountPaid: 0 }), order({ channel: 'WEBSITE', status: 'PENDING', amountPaid: 0 }), order({ channel: 'WEBSITE', status: 'CANCELLED' }), order()], []);
  assert.deepEqual(s.website, { placed: 3, paid: 1, paidRate: 33.33 });
});

test('gross profit leaves delivery and tax out of takings, and says how many pairs have no buying price', () => {
  const m = margin([
    order({ total: 4300, shipping: 300 }),
    order({ total: 3000, lines: [{ productId: 'p2', productName: 'B', quantity: 2, lineTotal: 3000, discount: 0, unitCost: null }] }),
    order({ status: 'PENDING' }),
  ]);
  assert.deepEqual([m.goodsRevenue, m.cost, m.grossProfit, m.unitsWithoutCost], [7000, 2500, 4500, 2]);
  assert.equal(m.marginPercent, 64.29);
  assert.equal(margin([]).marginPercent, null);
});

test('a week or month still under way is compared with the same stretch of the one before', () => {
  assert.deepEqual(previousRange('day', '2026-11-10', '2026-11-10'), { from: '2026-11-09', to: '2026-11-09' });
  assert.deepEqual(previousRange('week', '2026-11-09', '2026-11-11'), { from: '2026-11-02', to: '2026-11-04' });
  assert.deepEqual(previousRange('month', '2026-11-01', '2026-11-12'), { from: '2026-10-01', to: '2026-10-12' });
  // A whole month against the whole month before, whatever their lengths.
  assert.deepEqual(previousRange('month', '2026-03-01', '2026-03-31'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(previousRange('month', '2026-02-01', '2026-02-28'), { from: '2026-01-01', to: '2026-01-31' });
  // The 30th of a month against a shorter month stops at its end.
  assert.deepEqual(previousRange('month', '2026-03-01', '2026-03-30'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(previousRange('range', '2026-11-05', '2026-11-14'), { from: '2026-10-26', to: '2026-11-04' });
});

test('weeks start on Monday, and the breakdown grows from hours to months with the length of the period', () => {
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // a Sunday
  assert.equal(weekStart('2026-11-09'), '2026-11-09'); // a Monday
  assert.equal(autoGrouping('2026-11-10', '2026-11-10'), 'hour');
  assert.equal(autoGrouping('2026-11-01', '2026-11-30'), 'day');
  assert.equal(autoGrouping('2026-08-01', '2026-11-30'), 'week');
  assert.equal(autoGrouping('2026-01-01', '2026-11-30'), 'month');
});

test('buckets cover the whole period, clipped to its ends, empty ones included', () => {
  assert.equal(buckets('2026-11-10', '2026-11-10', 'hour').length, 24);
  assert.equal(buckets('2026-11-01', '2026-11-30', 'day').length, 30);
  const weeks = buckets('2026-11-04', '2026-11-17', 'week');
  assert.deepEqual(weeks.map((w) => [w.from, w.to]), [['2026-11-04', '2026-11-08'], ['2026-11-09', '2026-11-15'], ['2026-11-16', '2026-11-17']]);
  assert.deepEqual(buckets('2026-09-15', '2026-11-02', 'month').map((m) => [m.label, m.from, m.to]), [['Sept 2026', '2026-09-15', '2026-09-30'], ['Oct 2026', '2026-10-01', '2026-10-31'], ['Nov 2026', '2026-11-01', '2026-11-02']]);
});

test('days and hours are the shop’s own (Nairobi), so a late-evening sale stays on its day', () => {
  const lateEvening = new Date('2026-11-10T21:30:00Z'); // 00:30 on the 11th in Nairobi
  assert.equal(bucketKey(lateEvening, 'day'), '2026-11-11');
  assert.equal(bucketKey(lateEvening, 'hour'), '2026-11-11 00');
  const rows = series([order({ placedAt: lateEvening }), order({ status: 'CANCELLED' }), order({ status: 'PENDING' })], [pay(900, { receivedAt: lateEvening })], '2026-11-10', '2026-11-11', 'day');
  assert.deepEqual(rows.map((r) => [r.key, r.placed, r.sales, r.revenue, r.unpaid, r.closed, r.received]), [['2026-11-10', 2, 0, 0, 1, 1, 0], ['2026-11-11', 1, 1, 4000, 0, 0, 900]]);
});

test('breakdowns split orders by channel and staff, and rank products and buyers by what they paid for', () => {
  const b = breakdowns([
    order({ channel: 'WHATSAPP', total: 9000, buyerKey: 'c2', buyerName: 'Brian' }),
    order(), order(),
    order({ status: 'CANCELLED', channel: 'WHATSAPP' }),
    order({ status: 'PENDING', buyerKey: null }),
  ]);
  assert.deepEqual(b.byChannel.map((c) => [c.key, c.placed, c.sales, c.revenue, c.closed]), [['WHATSAPP', 2, 1, 9000, 1], ['IN_STORE', 3, 2, 8000, 0]]);
  assert.deepEqual(b.topCustomers, [{ name: 'Brian', orders: 1, revenue: 9000 }, { name: 'Wanjiku', orders: 2, revenue: 8000 }]);
  assert.deepEqual(b.topProducts, [{ productId: 'p1', name: 'Air Max', units: 3, revenue: 12000 }]);
  assert.deepEqual(b.byStatus.map((s) => [s.status, s.count]), [['PAID', 3], ['CANCELLED', 1], ['PENDING', 1]]);
});

test('a change against nothing is not a percentage', () => {
  const nothing = summarise([], []);
  const some = summarise([order()], [pay(4000)]);
  assert.equal(changes(some, nothing).revenue, null);
  assert.equal(changes(some, some).revenue, 0);
  assert.equal(changes(nothing, some).revenue, -100);
});
