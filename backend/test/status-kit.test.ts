import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { NotFoundException } from '@nestjs/common';
import { StatusKitService } from '../src/social-posting/status-kit.service';
import { STATUS_HEIGHT, STATUS_WIDTH, renderStatusImage, statusOverlay } from '../src/social-posting/status-image';
import { PostableProduct, buildStatusCaption, compactSizes, formatKenyanPhone } from '../src/social-posting/social-post';

const product = (over: Partial<PostableProduct> = {}): PostableProduct => ({
  id: 'KP_1', slug: 'nike-air-force-1', name: 'Nike Air Force 1 White', brand: 'Nike', categoryName: 'Sneakers',
  imageUrl: 'https://cdn.example.test/af1.jpg', priceFrom: 4200, priceTo: 4200, offer: null,
  sizesInStock: ['EUR 42', 'EUR 40', 'EUR 41'], stockUnits: 9, createdAt: new Date('2026-10-01T00:00:00Z'), ...over,
});
const ctx = { origin: 'https://dripemporium.store', whatsapp: 'https://wa.me/254113206481', location: 'Nairobi' };

// --- the pure parts -------------------------------------------------------------------------------------------------------

test('sizes are written as short as they can be read: runs, a shared prefix once, anything else as given', () => {
  assert.equal(compactSizes(['EUR 36', 'EUR 37', 'EUR 38', 'EUR 39', 'EUR 41', 'EUR 42', 'EUR 43', 'EUR 44']), 'EUR 36–39, 41–44');
  assert.equal(compactSizes(['42', '40', '41']), '40–42');
  assert.equal(compactSizes(['EUR 40']), 'EUR 40');
  assert.equal(compactSizes(['EUR 40', 'EUR 44', 'EUR 46']), 'EUR 40, 44, 46');
  assert.equal(compactSizes(['S', 'M', 'L']), 'S, M, L');
  assert.equal(compactSizes(['EUR 40', 'UK 7']), 'EUR 40, UK 7');
  assert.equal(compactSizes(['40', '40', ' 41 ']), '40–41');
  assert.equal(compactSizes([]), '');
});

test('Kenyan numbers are written the way people write them, and the Status text carries a link tagged as WhatsApp Status', () => {
  assert.equal(formatKenyanPhone('254113206481'), '0113 206 481');
  assert.equal(formatKenyanPhone('254722000000'), '0722 000 000');
  assert.equal(formatKenyanPhone('+44 7700 900123'), '+44 7700 900123');
  const text = buildStatusCaption(product(), ctx);
  assert.match(text, /^Nike Air Force 1 White\n💰 KES 4,200\n📏 EUR 40–42\n/);
  assert.match(text, /Reply to this status to order/);
  assert.match(text, /\/shop\/nike-air-force-1\?utm_source=whatsapp&utm_medium=social&utm_campaign=status$/);
  assert.match(buildStatusCaption(product({ offer: { price: 3500, was: 4500 } }), ctx), /🔥 KES 3,500 \(was KES 4,500\)/);
});

test('the picture is 1080x1920 whatever the product: long names shrink or end in …, an offer shows both prices, and nothing is lost off the edge', async () => {
  for (const p of [
    product(),
    product({ name: 'Nike Air Max 90 Lahar Escape Black Edition Limited Reflective Triple White Gum Sole Special Release 2026' }),
    product({ offer: { price: 3500, was: 4500 }, sizesInStock: [] }),
    product({ sizesInStock: Array.from({ length: 30 }, (_, i) => `EUR ${30 + i * 2}`), priceTo: 9000 }),
  ]) {
    const svg = statusOverlay(p, { whatsapp: 'https://wa.me/254113206481', site: 'https://dripemporium.store' });
    assert.match(svg, new RegExp(`width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}"`));
    assert.ok(!svg.includes('NaN'), 'no broken numbers in the drawing');
  }
  const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#884422' } }).jpeg().toBuffer();
  const out = await renderStatusImage(product(), photo, { whatsapp: 'https://wa.me/254113206481', site: 'https://dripemporium.store' });
  const meta = await sharp(out).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', STATUS_WIDTH, STATUS_HEIGHT]);
  // The photo is placed in the middle band: its colour is there, and the text panel below it is dark.
  const { data } = await sharp(out).extract({ left: 540, top: 700, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 100 && data[2] < 100, 'the photo shows where it should');
  const foot = await sharp(out).extract({ left: 5, top: 1900, width: 1, height: 1 }).raw().toBuffer();
  assert.ok(foot[0] < 40, 'the foot is the dark panel');
});

// --- against a real database (KITS_TEST_DATABASE_URL, a scratch database) --------------------------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;

async function world(products: PostableProduct[]) {
  process.env.FACEBOOK_REPLY_WHATSAPP = '254113206481';
  process.env.FACEBOOK_REPLY_SITE_URL = ctx.origin;
  process.env.STATUS_KIT_COUNT = '3';
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => { await prisma.socialPost.deleteMany({}); await prisma.socialSetting.deleteMany({}); };
  await cleanup();
  let live = products;
  const storefront: any = { postableProducts: async () => live };
  const pages: any = { findOne: async () => ({ content: {} }) };
  const service = new StatusKitService(prisma as any, storefront, pages);
  const done = async () => { await cleanup(); await prisma.$disconnect(); delete process.env.FACEBOOK_REPLY_WHATSAPP; delete process.env.FACEBOOK_REPLY_SITE_URL; delete process.env.STATUS_KIT_COUNT; };
  return { prisma, service, setLive: (next: PostableProduct[]) => { live = next; (service as any).cache = null; }, done };
}

const five = () => ['A', 'B', 'C', 'D', 'E'].map((x, i) => product({ id: `KP_${x}`, slug: `shoe-${x.toLowerCase()}`, name: `Shoe ${x}`, brand: `Brand${i}`, stockUnits: 10 - i }));

db('the day\'s kit is three different products, made once and the same for everyone who opens it', async () => {
  const w = await world(five());
  try {
    const a = await w.service.today('staff@example.com');
    assert.equal(a.length, 3);
    assert.equal(new Set(a.map((i) => i.productName)).size, 3);
    assert.ok(a.every((i) => i.status === 'READY' && i.available && /utm_campaign=status/.test(i.caption!)));
    const b = await w.service.today('someone.else@example.com');
    assert.deepEqual(b.map((i) => i.id), a.map((i) => i.id));
    assert.equal(await w.prisma.socialPost.count({ where: { channel: 'STATUS' } }), 3);
    // Opening it at the same moment from two places makes one kit, not two.
    await w.prisma.socialPost.deleteMany({});
    const both = await Promise.all([w.service.today('a'), w.service.today('b')]);
    assert.equal(both[0].length, 3);
    assert.equal(await w.prisma.socialPost.count({ where: { channel: 'STATUS' } }), 3);
  } finally { await w.done(); }
});

db('Swap brings the next product in line and never one already in the kit; Mark as posted moves a product to the back, so tomorrow does not repeat it', async () => {
  const w = await world(five());
  try {
    const kit = await w.service.today();
    const before = kit.map((i) => i.productName);
    const swapped = await w.service.swap(kit[0].id);
    const after = swapped.map((i) => i.productName);
    assert.equal(after.length, 3);
    assert.equal(new Set(after).size, 3);
    assert.ok(!before.includes(after[0]), 'the first item is now a product that was not in the kit');
    assert.deepEqual(after.slice(1), before.slice(1));

    const posted = await w.service.markPosted(kit[1].id, 'staff@example.com');
    assert.equal(posted.find((i) => i.id === kit[1].id)!.status, 'POSTED');
    assert.ok(posted.find((i) => i.id === kit[1].id)!.postedAt);
    // Tomorrow: what was posted is passed over while others are available.
    const row = await w.prisma.socialPost.findUniqueOrThrow({ where: { id: kit[1].id } });
    // Make today's kit yesterday's, so the next call builds a fresh one.
    const all = await w.prisma.socialPost.findMany({ where: { channel: 'STATUS' } });
    for (const [n, r] of all.entries()) await w.prisma.socialPost.update({ where: { id: r.id }, data: { slotKey: `old#${n}` } });
    const next = await w.service.today();
    assert.ok(!next.some((i) => i.productName === row.productName), 'yesterday\'s posted product is not offered again');
    await assert.rejects(() => w.service.swap('no-such-id'), NotFoundException);
  } finally { await w.done(); }
});

db('a product that has sold out since the morning is flagged and has no picture; the picture of a product that is there is made from its photo', async () => {
  const w = await world(five());
  try {
    const kit = await w.service.today();
    w.setLive(five().filter((p) => p.name !== kit[0].productName));
    const again = await w.service.today();
    assert.deepEqual(again.map((i) => i.available), [false, true, true]);
    await assert.rejects(() => w.service.image(kit[0].id), NotFoundException);
  } finally { await w.done(); }
});
