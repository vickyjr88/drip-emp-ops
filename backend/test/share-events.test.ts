import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { SHARE_EVENT_CHANNELS, SHARE_EVENT_KINDS, cleanShareEvent } from '../src/share-kit/share-events';
import { ShareKitService } from '../src/share-kit/share-kit.service';
import { ShareStatsService } from '../src/insights/share-stats.service';
import { ResellerService } from '../src/reseller/reseller.service';

// --- what is accepted ---------------------------------------------------------------------------------------------------------

test('a share tap is a channel, a kind and perhaps a product, and nothing else is kept', () => {
  assert.deepEqual(cleanShareEvent({ channel: 'whatsapp', kind: 'PRODUCT', productSlug: 'nike-af1' }), { channel: 'whatsapp', kind: 'PRODUCT', productSlug: 'nike-af1' });
  assert.deepEqual(cleanShareEvent({ channel: ' WhatsApp ', kind: 'kit', productSlug: 'Nike-AF1 ' }), { channel: 'whatsapp', kind: 'KIT', productSlug: 'nike-af1' });
  assert.deepEqual(cleanShareEvent({ channel: 'link' }), { channel: 'link', kind: 'PRODUCT', productSlug: null }, 'the kind defaults to a product link and a product is optional');
  assert.deepEqual(cleanShareEvent({ channel: 'x', productSlug: '' }), { channel: 'x', kind: 'PRODUCT', productSlug: null });
  assert.deepEqual(SHARE_EVENT_CHANNELS, ['whatsapp', 'facebook', 'x', 'telegram', 'share', 'link', 'download']);
  assert.deepEqual(SHARE_EVENT_KINDS, ['PRODUCT', 'PICTURE', 'KIT']);
});

test('an unknown channel or kind, or a product address that is not one, is refused rather than stored', () => {
  for (const bad of [{}, null, undefined, { channel: 'myspace' }, { channel: '' }, { channel: 7 }, { channel: 'x', kind: 'SPAM' }, { channel: 'x', productSlug: '../../etc' }, { channel: 'x', productSlug: 'a b' }, { channel: 'x', productSlug: 'a'.repeat(200) }, { channel: 'x', productSlug: 5 }]) {
    assert.throws(() => cleanShareEvent(bad), BadRequestException, JSON.stringify(bad));
  }
});

// --- recording and counting, against a real database (KITS_TEST_DATABASE_URL, a scratch database) --------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = (name: string, fn: () => Promise<void>) => test(name, { skip: url ? false : 'KITS_TEST_DATABASE_URL is not set' }, fn);

async function harness() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tag = `se${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const mk = (suffix: string, tier: 'RETAIL' | 'RESELLER', extra: Record<string, unknown> = {}) =>
    prisma.customer.create({ data: { firstName: suffix, lastName: 'Tester', email: `${suffix}.${tag}@example.com`, phone: `07${Math.floor(Math.random() * 1e8)}`, priceTier: tier, ...extra } });
  const affiliate = await mk('amina', 'RESELLER', { referralCode: `ref${tag}` });
  const shopper = await mk('brian', 'RETAIL');
  const kit = new ShareKitService({} as any, {} as any, prisma as any);
  const cleanup = async () => {
    await prisma.shareEvent.deleteMany({ where: { customerId: { in: [affiliate.id, shopper.id] } } });
    await prisma.customer.deleteMany({ where: { id: { in: [affiliate.id, shopper.id] } } });
    await prisma.$disconnect();
  };
  return { prisma, kit, affiliate, shopper, tag, cleanup, as: (c: { id: string; priceTier: string; referralCode: string | null }) => ({ id: c.id, priceTier: c.priceTier, referralCode: c.referralCode }) };
}
const window = () => ({ from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000) });

db('a share is stored for whoever tapped it, and whether it carried a code is decided by the server from who they are', async () => {
  const h = await harness();
  try {
    assert.deepEqual(await h.kit.record(h.as(h.affiliate), { channel: 'whatsapp', kind: 'KIT', productSlug: 'nike-af1' }), { recorded: true });
    await h.kit.record(h.as(h.shopper), { channel: 'facebook', kind: 'PRODUCT', productSlug: 'nike-af1', withCode: true }); // asking for a code does nothing
    const rows = await h.prisma.shareEvent.findMany({ where: { customerId: { in: [h.affiliate.id, h.shopper.id] } }, orderBy: { channel: 'asc' } });
    assert.deepEqual(rows.map((r) => [r.customerId === h.affiliate.id ? 'affiliate' : 'shopper', r.channel, r.kind, r.productSlug, r.withCode]), [
      ['shopper', 'facebook', 'PRODUCT', 'nike-af1', false],
      ['affiliate', 'whatsapp', 'KIT', 'nike-af1', true],
    ]);
    await assert.rejects(() => h.kit.record(h.as(h.shopper), { channel: 'myspace' }), BadRequestException);
    assert.equal(await h.prisma.shareEvent.count({ where: { customerId: h.shopper.id } }), 1, 'a refused tap stores nothing');
  } finally { await h.cleanup(); }
});

db('staff see how often people shared, where to, which products and who, and only for the period asked', async () => {
  const h = await harness();
  try {
    const slug = `p-${h.tag}`;
    const product = await h.prisma.product.create({ data: { sku: `SKU-${h.tag}`, name: `Share Test ${h.tag}`, slug } });
    for (const channel of ['whatsapp', 'whatsapp', 'whatsapp', 'link']) await h.kit.record(h.as(h.affiliate), { channel, kind: 'PRODUCT', productSlug: slug });
    await h.kit.record(h.as(h.shopper), { channel: 'facebook', kind: 'PRODUCT', productSlug: slug });
    // An old one, outside the window.
    await h.prisma.shareEvent.create({ data: { customerId: h.shopper.id, channel: 'x', kind: 'PRODUCT', createdAt: new Date(Date.now() - 40 * 86_400_000) } });

    const stats = await new ShareStatsService(h.prisma as any).summary(window().from, window().to);
    const mine = (rows: Array<{ customerId: string }>) => rows.filter((r) => [h.affiliate.id, h.shopper.id].includes(r.customerId));
    assert.ok(stats.total >= 5);
    assert.ok(stats.byChannel.find((c) => c.channel === 'whatsapp')!.count >= 3);
    const sharers = mine(stats.topSharers);
    // brian also has a share from 40 days ago: it is outside the period, so he counts once.
    assert.deepEqual(sharers.map((s) => [s.name, s.affiliate, s.count]), [['amina Tester', true, 4], ['brian Tester', false, 1]]);
    assert.deepEqual(stats.topProducts.find((p) => p.slug === slug), { slug, name: `Share Test ${h.tag}`, count: 5 });
    assert.ok(stats.withCode >= 4 && stats.withoutCode >= 1);
    await h.prisma.product.delete({ where: { id: product.id } });
  } finally { await h.cleanup(); }
});

db('an affiliate\'s report on staff\'s reseller page counts their shares by channel, and nobody else\'s', async () => {
  const h = await harness();
  try {
    for (const channel of ['whatsapp', 'whatsapp', 'telegram']) await h.kit.record(h.as(h.affiliate), { channel });
    await h.kit.record(h.as(h.shopper), { channel: 'whatsapp' });
    const report = await new ResellerService(h.prisma as any).performance(h.affiliate.id);
    assert.equal(report.summary.totalShares, 3);
    assert.deepEqual(report.summary.sharesByChannel, [{ channel: 'whatsapp', count: 2 }, { channel: 'telegram', count: 1 }]);
    const series = await new ResellerService(h.prisma as any).series(h.affiliate.id);
    assert.equal(series.shares.reduce((n: number, d: { count: number }) => n + d.count, 0), 3);
  } finally { await h.cleanup(); }
});
