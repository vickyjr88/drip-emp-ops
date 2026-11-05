import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { cleanAdSpend, AdSpendService } from '../src/insights/ad-spend.service';
import { buyerKey, groupBuyers, phoneKey, summariseBuyers } from '../src/insights/buyers.service';
import { EventsService, cleanEvents, makeRateLimiter } from '../src/insights/events.service';
import { FunnelService } from '../src/insights/funnel.service';
import { StockService } from '../src/insights/stock.service';
import { BuyersService } from '../src/insights/buyers.service';
import { classifyVisit, deviceOf, looksLikeBot } from '../src/insights/visit';

// --- pure rules (no database) ------------------------------------------------------------------------------------

test('where a visit came from: the merchant\'s tags first, then ad click ids, then the referring page', () => {
  assert.deepEqual(classifyVisit({ utmSource: 'fb', utmMedium: 'cpc', utmCampaign: 'roma' }), { source: 'Facebook', medium: 'cpc', campaign: 'roma' });
  assert.deepEqual(classifyVisit({ clickIds: { ttclid: true } }), { source: 'TikTok', medium: 'paid', campaign: null });
  assert.equal(classifyVisit({ referrer: 'https://l.instagram.com/' }).source, 'Instagram');
  assert.deepEqual(classifyVisit({ referrer: 'https://www.google.co.ke/search?q=x' }), { source: 'Google', medium: 'organic', campaign: null });
  assert.equal(classifyVisit({ referrer: 'https://dripemporium.store/shop/x', ownHost: 'www.dripemporium.store' }).source, 'Direct');
  assert.equal(classifyVisit({}).source, 'Direct');
});

test('devices and crawlers', () => {
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'), 'mobile');
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120'), 'desktop');
  assert.equal(looksLikeBot('Googlebot/2.1'), true);
  assert.equal(looksLikeBot('facebookexternalhit/1.1'), true);
  assert.equal(looksLikeBot(''), true);
  assert.equal(looksLikeBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1'), false);
});

test('what a browser may send: known events kept, the rest dropped, bad batches refused', () => {
  const events = cleanEvents([{ type: 'VIEW_PRODUCT', productSlug: 'x' }, { type: 'DROP_TABLE' }, { type: 'SEARCH', detail: '  air max ' }]);
  assert.deepEqual(events.map((e) => e.type), ['VIEW_PRODUCT', 'SEARCH']);
  assert.equal(events[1].detail, 'air max');
  assert.throws(() => cleanEvents([]));
  assert.throws(() => cleanEvents(Array.from({ length: 11 }, () => ({ type: 'SEARCH' }))));
  assert.throws(() => cleanEvents('x'));
});

test('the events route limits one address, and forgets it after the window', () => {
  const allow = makeRateLimiter(3, 1000);
  assert.deepEqual([allow('a', 0), allow('a', 1), allow('a', 2), allow('a', 3)], [true, true, true, false]);
  assert.equal(allow('b', 3), true);
  assert.equal(allow('a', 1500), true);
});

test('ad spend entries: the platform is named as Insights names it, nonsense is refused', () => {
  const row = cleanAdSpend({ day: '2026-11-03', source: ' fb ', amountKes: '1500.456', campaign: 'roma' });
  assert.equal(row.source, 'Facebook');
  assert.equal(row.amountKes, 1500.46);
  for (const bad of [{ day: 'yesterday', source: 'tiktok', amountKes: 10 }, { day: '2026-11-03', source: '', amountKes: 10 }, { day: '2026-11-03', source: 'tiktok', amountKes: 0 }, { day: '2099-01-01', source: 'tiktok', amountKes: 5 }]) {
    assert.throws(() => cleanAdSpend(bad as any));
  }
});

const order = (over: Partial<{ id: string; customerId: string | null; phone: string | null; email: string | null; name: string; total: number; placedAt: Date }>) =>
  ({ id: Math.random().toString(36).slice(2), customerId: null, phone: null, email: null, name: 'X', total: 1000, placedAt: new Date('2026-10-01'), ...over });

test('a buyer is one person however their number was written, falling back to email, account, then a one-off', () => {
  assert.equal(new Set(['0712 345 678', '+254712345678', '254712345678'].map((phone) => buyerKey(order({ phone })))).size, 1);
  assert.equal(phoneKey('n/a'), null);
  assert.equal(buyerKey(order({ email: ' Jo@Example.com ' })), 'e:jo@example.com');
  assert.equal(buyerKey(order({ customerId: 'c1' })), 'c:c1');
  assert.ok(buyerKey(order({ id: 'x1' })).startsWith('o:'));
  const [buyer] = groupBuyers([order({ phone: '0712345678', total: 4000, placedAt: new Date('2026-08-01'), name: 'Wanjiru' }), order({ phone: '+254712345678', total: 3000, placedAt: new Date('2026-10-20'), name: 'Wanjiru K' })]);
  assert.deepEqual([buyer.orders, buyer.spendKes, buyer.name, buyer.phone], [2, 7000, 'Wanjiru K', '254712345678']);
});

test('repeat buyers, share of money from them, and who has gone quiet', () => {
  const now = new Date('2026-11-05'); const from = new Date('2026-10-06'); const to = new Date('2026-11-05');
  const r = summariseBuyers([
    order({ phone: '0711000001', total: 4000, placedAt: new Date('2026-07-01'), name: 'Old' }), order({ phone: '0711000001', total: 4000, placedAt: new Date('2026-10-10'), name: 'Old' }),
    order({ phone: '0711000002', total: 5000, placedAt: new Date('2026-10-12'), name: 'New' }),
    order({ phone: '0711000003', total: 3000, placedAt: new Date('2026-06-01'), name: 'Gone' }), order({ phone: '0711000003', total: 3500, placedAt: new Date('2026-07-01'), name: 'Gone' }),
    order({ phone: '0711000004', total: 9000, placedAt: new Date('2026-05-01'), name: 'Big' }),
    order({ phone: null, total: 2000, placedAt: new Date('2026-10-15'), name: 'Walk' }),
  ], from, to, now, 60);
  assert.equal(r.buyers, 3);
  assert.equal(r.returningBuyers, 1);
  assert.ok(Math.abs(r.repeatRate - 1 / 3) < 1e-9);
  assert.ok(Math.abs(r.repeatRevenueShare - 4000 / 11000) < 1e-9);
  assert.equal(r.unrecognisedOrders, 1);
  assert.deepEqual(r.lapsed.map((l) => l.name), ['Gone', 'Big']);
  assert.equal(r.lapsed[0].phone, '254711000003');
  assert.equal(summariseBuyers([], from, to, now, 60).buyers, 0);
});

// --- database tests: need KITS_TEST_DATABASE_URL, a SCRATCH database with every migration applied -------------------
// They create rows tagged INSTEST and remove them. Assertions look only at that data (a unique source, product names and
// phone numbers), so other rows in the scratch database cannot change the result.

const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const DAY = 24 * 3600_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const phoneUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1';

async function world() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => {
    await prisma.storefrontEvent.deleteMany({ where: { sessionId: { startsWith: 'instest' } } });
    await prisma.cartLead.deleteMany({ where: { source: 'WHATSAPP_ORDER', sessionId: { startsWith: 'instest' } } });
    await prisma.order.deleteMany({ where: { orderNumber: { startsWith: 'INSTEST' } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: 'INSTEST' } } });
    await prisma.adSpend.deleteMany({ where: { source: 'Instestads' } });
    await prisma.store.deleteMany({ where: { code: 'INSTEST' } });
  };
  await cleanup();
  const store = await prisma.store.create({ data: { code: 'INSTEST', name: 'Insights test store' } });
  let n = 0;
  const product = async (name: string, over: { price?: number; cost?: number | null; stock?: number; createdDaysAgo?: number; line?: 'SHOP' | 'WATCH' | 'KIT' } = {}) => {
    const sku = `INSTEST-${name.replace(/\s/g, '')}`;
    const p = await prisma.product.create({
      data: {
        sku, name, slug: sku.toLowerCase(), line: over.line ?? 'SHOP', createdAt: ago(over.createdDaysAgo ?? 100),
        variants: { create: [{ sku: `${sku}-V`, name: 'Standard', priceKes: over.price ?? 4000, costKes: over.cost ?? null, stock: { create: [{ storeId: store.id, quantity: over.stock ?? 5 }] } }] },
      },
      include: { variants: true },
    });
    return { ...p, variantId: p.variants[0].id };
  };
  const sale = (p: { variantId: string }, o: { qty?: number; price?: number; daysAgo?: number; status?: any; phone?: string | null; name?: string; sessionId?: string | null; tier?: any } = {}) => {
    n += 1;
    const price = o.price ?? 4000; const qty = o.qty ?? 1;
    return prisma.order.create({
      data: {
        orderNumber: `INSTEST-${Date.now()}-${n}`, storeId: store.id, status: o.status ?? 'PAID', channel: 'WEBSITE', priceTier: o.tier ?? 'RETAIL',
        customerName: o.name ?? 'Guest', customerPhone: o.phone ?? null, sessionId: o.sessionId ?? null,
        subtotal: price * qty, total: price * qty, placedAt: ago(o.daysAgo ?? 1),
        lines: { create: [{ variantId: p.variantId, description: 'line', quantity: qty, unitPrice: price, lineTotal: price * qty }] },
      },
    });
  };
  return { prisma, store, product, sale, cleanup };
}

db('the funnel follows visits to orders by source, links WhatsApp-lead orders, ignores cancelled ones, and sets ad spend against ad visits', async () => {
  const { prisma, product, sale, cleanup } = await world();
  try {
    const events = new EventsService(prisma as any);
    const funnel = new FunnelService(prisma as any);
    const ads = new AdSpendService(prisma as any);
    const shoe = await product('Funnel Shoe', { cost: 2000 });
    const ctx = { userAgent: phoneUa, originHost: 'dripemporium.store' };

    // A paid Instestads visit: views, adds to cart, begins checkout, pays on the site.
    await events.record({ sessionId: 'instest000000a1', events: [{ type: 'SESSION_START', utmSource: 'instestads', utmMedium: 'paid' }, { type: 'VIEW_PRODUCT', productSlug: shoe.slug }, { type: 'ADD_TO_CART', productSlug: shoe.slug }, { type: 'BEGIN_CHECKOUT' }] }, ctx);
    await sale(shoe, { price: 4200, sessionId: 'instest000000a1', daysAgo: 0 });
    // A second one taps WhatsApp; staff turn the lead into an order by hand, which carries no session of its own.
    await events.record({ sessionId: 'instest000000a2', events: [{ type: 'SESSION_START', utmSource: 'instestads', utmMedium: 'paid' }, { type: 'WHATSAPP_CLICK', productSlug: shoe.slug, detail: 'product-page' }] }, ctx);
    const converted = await sale(shoe, { price: 3800, daysAgo: 0 });
    await prisma.cartLead.create({ data: { source: 'WHATSAPP_ORDER', sessionId: 'instest000000a2', orderId: converted.id, lines: [], subtotal: 3800, total: 3800 } });
    // A cancelled order for the first visit must not count; a repeat session start must not double it.
    await sale(shoe, { price: 999, sessionId: 'instest000000a1', status: 'CANCELLED', daysAgo: 0 });
    await events.record({ sessionId: 'instest000000a1', events: [{ type: 'SESSION_START', utmSource: 'instestads', utmMedium: 'paid' }] }, ctx);
    // A crawler records nothing.
    assert.deepEqual(await events.record({ sessionId: 'instest000000b1', events: [{ type: 'SESSION_START' }] }, { userAgent: 'Googlebot/2.1' }), { recorded: 0 });

    await ads.create({ day: new Date().toISOString().slice(0, 10), source: 'instestads', amountKes: 600 });
    const f = await funnel.funnel(ago(1), new Date(Date.now() + 3600_000));

    const row = f.bySource.find((s) => s.source === 'instestads')!;
    assert.equal(row.sessions, 2);
    assert.deepEqual([row.viewedProduct, row.addedToCart, row.beganCheckout, row.tappedWhatsapp, row.whatsappOrders, row.orders, row.revenueKes], [1, 1, 1, 1, 1, 2, 8000]);
    // The listed ad platform is named as typed ("instestads" has no known label, so it keeps its own name).
    const ad = f.adReturn.find((r) => r.source === 'instestads')!;
    assert.deepEqual([ad.spendKes, ad.visits, ad.whatsappTaps, ad.orders, ad.revenueKes], [600, 2, 1, 2, 8000]);
    const looked = f.products.find((p) => p.slug === shoe.slug)!;
    assert.deepEqual([looked.views, looked.addedToCart, looked.tappedWhatsapp, looked.unitsSold], [1, 1, 1, 2]);
  } finally {
    await prisma.adSpend.deleteMany({ where: { source: 'instestads' } });
    await cleanup();
    await prisma.$disconnect();
  }
});

db('stock: dead stock valued at cost, fast sellers running low, kits left out, sold-out products people still want', async () => {
  const { prisma, product, sale, cleanup } = await world();
  try {
    const events = new EventsService(prisma as any);
    const stock = new StockService(prisma as any);
    const dead = await product('Dusty Boot', { cost: 3000, stock: 4, createdDaysAgo: 200 });
    await product('New Arrival', { cost: 1000, stock: 4, createdDaysAgo: 3 });
    const fast = await product('Hot Seller', { cost: 1500, price: 3000, stock: 2, createdDaysAgo: 100 });
    const gone = await product('Sold Out', { cost: 1000, stock: 0, createdDaysAgo: 50 });
    await product('Printed Kit', { stock: 0, line: 'KIT' });
    await product('No Cost Boot', { price: 2000, stock: 3, createdDaysAgo: 120 });
    for (let i = 0; i < 6; i++) await sale(fast, { price: 3000, daysAgo: i + 1 });
    await sale(dead, { price: 5000, daysAgo: 150 });
    const ctx = { userAgent: phoneUa };
    await events.record({ sessionId: 'instest000000c1', events: [{ type: 'SESSION_START' }, { type: 'VIEW_PRODUCT', productSlug: gone.slug }, { type: 'WHATSAPP_CLICK', productSlug: gone.slug }] }, ctx);
    await events.record({ sessionId: 'instest000000c2', events: [{ type: 'SESSION_START' }, { type: 'VIEW_PRODUCT', productSlug: gone.slug }, { type: 'VIEW_PRODUCT', productSlug: 'instest-printedkit' }] }, ctx);

    const s = await stock.stock(ago(30), new Date(Date.now() + 3600_000), 60);
    const names = (items: Array<{ name: string }>) => items.map((i) => i.name);

    const d = s.deadStock.items.find((i) => i.name === 'Dusty Boot')!;
    assert.deepEqual([d.units, d.valueKes, d.basis, d.daysSinceSale], [4, 12000, 'cost', 150]);
    const noCost = s.deadStock.items.find((i) => i.name === 'No Cost Boot')!;
    assert.deepEqual([noCost.valueKes, noCost.basis, noCost.daysSinceSale], [6000, 'price', null]);
    assert.ok(!names(s.deadStock.items).includes('New Arrival'));

    const low = s.runningLow.find((r) => r.name === 'Hot Seller')!;
    assert.deepEqual([low.units, low.soldInPeriod], [2, 6]);
    assert.ok(low.coverDays! <= 14);

    assert.deepEqual(s.missedDemand.find((m) => m.name === 'Sold Out'), { slug: gone.slug, name: 'Sold Out', line: 'SHOP', views: 2, carts: 0, whatsapp: 1 });
    // A kit is made to order: no stock says nothing about it.
    assert.ok(!names(s.missedDemand).includes('Printed Kit'));
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
});

db('buyers: recognised by phone however it was written, retail only, cancelled orders ignored, quiet buyers listed', async () => {
  const { prisma, product, sale, cleanup } = await world();
  try {
    const buyers = new BuyersService(prisma as any);
    const shoe = await product('Buyer Shoe', { cost: 1000 });
    await sale(shoe, { phone: '0700123456', name: 'Wanjiru Insttest', daysAgo: 100, price: 3000 });
    await sale(shoe, { phone: '+254 700 123 456', name: 'Wanjiru Insttest', daysAgo: 80, price: 3000 });
    await sale(shoe, { phone: '0700123457', name: 'Cancelled Insttest', daysAgo: 70, status: 'CANCELLED' });
    await sale(shoe, { phone: '0700123458', name: 'Reseller Insttest', daysAgo: 70, tier: 'RESELLER' });
    await sale(shoe, { phone: '0700123459', name: 'Recent Insttest', daysAgo: 3 });

    const r = await buyers.buyers(ago(30), new Date(Date.now() + 3600_000), 60);
    const lapsed = r.lapsed.filter((l) => l.name.endsWith('Insttest'));
    assert.deepEqual(lapsed.map((l) => [l.name, l.orders, l.spendKes, l.phone]), [['Wanjiru Insttest', 2, 6000, '254700123456']]);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
});
