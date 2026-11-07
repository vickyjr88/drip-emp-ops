import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyStock, compare, formatChange, pctChange, soldVariants, summariseDay, topSellers, type OrderFact } from '../src/daily-report/daily-report.metrics';
import { renderEmail, whatsappParams, whatsappPreview } from '../src/daily-report/daily-report.render';
import { shiftDateKey, windowForDate, yesterdayKey } from '../src/daily-report/daily-report.window';
import type { DailyReport } from '../src/daily-report/daily-report.types';
import { WhatsAppService } from '../src/daily-report/whatsapp.service';

const line = (variantId: string, productName: string, quantity: number, lineTotal: number) => ({ variantId, sku: `SKU-${variantId}`, productName, quantity, lineTotal });
const order = (status: string, total: number, lines: OrderFact['lines'] = []): OrderFact => ({ orderNumber: `O-${status}-${total}`, status, total, lines });

test('the report day is a Nairobi day, not a UTC day', () => {
  const w = windowForDate('2026-11-04');
  assert.equal(w.start.toISOString(), '2026-11-03T21:00:00.000Z');
  assert.equal(w.end.toISOString(), '2026-11-04T21:00:00.000Z');
  assert.equal(w.label, 'Wed 4 Nov 2026');
});

test('yesterday is decided in Nairobi time', () => {
  // 07:00 EAT on the 5th is 04:00 UTC on the 5th: yesterday is the 4th.
  assert.equal(yesterdayKey(new Date('2026-11-05T04:00:00Z')), '2026-11-04');
  // 22:30 UTC on the 4th is already 01:30 EAT on the 5th, so yesterday is still the 4th.
  assert.equal(yesterdayKey(new Date('2026-11-04T22:30:00Z')), '2026-11-04');
  // 20:59 UTC on the 4th is 23:59 EAT on the 4th: yesterday is the 3rd.
  assert.equal(yesterdayKey(new Date('2026-11-04T20:59:00Z')), '2026-11-03');
});

test('date shifting crosses month and year ends', () => {
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDateKey('2027-01-01', -1), '2026-12-31');
  assert.equal(shiftDateKey('2026-11-04', -7), '2026-10-28');
});

test('revenue counts paid orders only; cancelled, refunded and unpaid are left out', () => {
  const s = summariseDay(
    [order('PAID', 1000, [line('a', 'Nike', 2, 1000)]), order('DELIVERED', 500, [line('b', 'Puma', 1, 500)]), order('PENDING', 900), order('CANCELLED', 700), order('REFUNDED', 300)],
    1500,
  );
  assert.equal(s.orders, 5);
  assert.equal(s.confirmed, 2);
  assert.equal(s.revenue, 1500);
  assert.equal(s.items, 3);
  assert.equal(s.unpaid, 1);
  assert.equal(s.cancelled, 1);
  assert.equal(s.averageOrder, 750);
  assert.equal(s.collected, 1500);
});

test('a day with no orders is all zeros, with no divide-by-zero', () => {
  const s = summariseDay([], 0);
  assert.equal(s.averageOrder, 0);
  assert.equal(s.revenue, 0);
});

test('percent change handles zero baselines', () => {
  assert.equal(pctChange(150, 100), 50);
  assert.equal(pctChange(50, 100), -50);
  assert.equal(pctChange(0, 0), 0);
  assert.equal(pctChange(5, 0), null);
  assert.equal(formatChange(null), 'new');
  assert.equal(formatChange(0.2), 'no change');
  assert.equal(formatChange(12.4), '+12%');
  assert.equal(formatChange(-4.6), '-5%');
});

test('comparison reports the earlier day and the change', () => {
  const today = summariseDay([order('PAID', 2000, [line('a', 'A', 1, 2000)])], 0);
  const earlier = summariseDay([order('PAID', 1000, [line('a', 'A', 1, 1000)])], 0);
  const c = compare('day before', today, earlier);
  assert.equal(c.revenueChange, 100);
  assert.equal(c.revenue, 1000);
});

test('best sellers rank by units then revenue, and ignore unpaid orders', () => {
  const sellers = topSellers(
    [
      order('PAID', 0, [line('a', 'Nike AF1', 1, 4000), line('b', 'Puma', 3, 6000)]),
      order('DELIVERED', 0, [line('c', 'Nike AF1', 2, 8000)]),
      order('PENDING', 0, [line('d', 'Unpaid', 9, 9000)]),
    ],
    5,
  );
  assert.deepEqual(sellers.map((s) => [s.name, s.units]), [['Nike AF1', 3], ['Puma', 3]]);
  assert.equal(sellers[0].revenue, 12000);
  assert.ok(!sellers.some((s) => s.name === 'Unpaid'));
});

test('stock warnings cover only sizes that sold', () => {
  const orders = [order('PAID', 0, [line('a', 'Nike', 1, 1), line('b', 'Puma', 1, 1), line('c', 'Vans', 1, 1)])];
  const sold = soldVariants(orders);
  assert.equal(sold.length, 3);
  const { soldOut, low } = classifyStock(sold, new Map([['a', 0], ['b', 2]]));
  assert.deepEqual(soldOut.map((s) => s.name).sort(), ['Nike', 'Vans']); // c has no stock row: counts as gone
  assert.deepEqual(low.map((s) => s.name), ['Puma']);
});

const report = (over: Partial<DailyReport> = {}): DailyReport => {
  const empty = summariseDay([], 0);
  return {
    shopName: 'Drip Emporium', currency: 'KES', dateKey: '2026-11-04', label: 'Wed 4 Nov 2026', generatedAt: '2026-11-05T04:00:00Z',
    today: empty, vsPreviousDay: compare('day before', empty, empty), vsLastWeek: compare('last week', empty, empty), statusCounts: {},
    orders: [], ordersOmitted: 0,
    needsAction: { paidAwaitingPacking: { count: 0, oldest: [] }, unpaidOver24h: { count: 0, value: 0, oldest: [] }, pendingRefunds: 0, newInquiries: 0 },
    topSellers: [], stock: { soldOut: [], low: [] },
    demand: { abandonedCarts: 0, abandonedValue: 0, whatsappClicks: 0, campaignClicks: 0, referralClicks: 0 },
    attribution: { campaigns: [], referralOrders: 0, referralRevenue: 0 },
    catalogue: { activeProducts: 10, missingPhoto: 0, feedItems: 60 },
    ...over,
  };
};

test('a quiet day still renders, and says so', () => {
  const { subject, html } = renderEmail(report());
  assert.match(subject, /no confirmed orders/);
  assert.match(html, /No orders were placed/);
  assert.doesNotMatch(html, /Needs your attention/);
});

test('customer text is escaped in the email', () => {
  const r = report({ orders: [{ orderNumber: 'DE-1', customer: '<script>alert(1)</script>', status: 'PAID', channel: 'WEBSITE', total: 100 }] });
  const { html } = renderEmail(r);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('needs-attention appears when something is waiting', () => {
  const r = report({ needsAction: { paidAwaitingPacking: { count: 2, oldest: [{ orderNumber: 'DE-9', customer: 'A', total: 1, ageHours: 30 }] }, unpaidOver24h: { count: 0, value: 0, oldest: [] }, pendingRefunds: 1, newInquiries: 0 } });
  const { html } = renderEmail(r);
  assert.match(html, /Needs your attention/);
  assert.match(html, /DE-9 \(30h\)/);
  assert.deepEqual(whatsappParams(r).slice(-1), ['3 items']);
});

test('WhatsApp parameters are six single-line values', () => {
  const p = whatsappParams(report({ shopName: 'Drip\nEmporium' }));
  assert.equal(p.length, 6);
  assert.ok(p.every((v) => !/[\n\t]/.test(v) && v.length > 0));
  assert.match(whatsappPreview(report()), /^Daily report for Drip Emporium \(Wed 4 Nov 2026\): 0 paid orders, KES 0 revenue/);
});

test('WhatsApp numbers are normalised to country-code digits', () => {
  const w = new WhatsAppService();
  assert.equal(w.normalisePhone('0722 000 111'), '254722000111');
  assert.equal(w.normalisePhone('+254 722-000-111'), '254722000111');
  assert.equal(w.normalisePhone('722000111'), '254722000111');
  assert.equal(w.normalisePhone('abc'), null);
});

test('until recipients are saved, the report goes to the owner on WhatsApp as well as by email; a saved list replaces it', async () => {
  const { DailyReportService, OWNER_WHATSAPP } = await import('../src/daily-report/daily-report.service');
  const fake = (row: any) => new DailyReportService({ dailyReportSetting: { findUnique: async () => row } } as any, null as any, { isConfigured: true, templateName: 'daily_report' } as any);
  assert.equal(OWNER_WHATSAPP, '254771114712');
  assert.deepEqual((await fake(null).getSettings()).whatsappRecipients, ['254771114712']);
  assert.deepEqual((await fake({ enabled: true, emailRecipients: [], whatsappRecipients: ['254700000001'] }).getSettings()).whatsappRecipients, ['254700000001']);
  // Someone who cleared the list on purpose is not messaged behind their back.
  assert.deepEqual((await fake({ enabled: true, emailRecipients: [], whatsappRecipients: [] }).getSettings()).whatsappRecipients, []);
});
