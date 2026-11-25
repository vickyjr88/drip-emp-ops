import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AlertsService } from '../src/alerts/alerts.service';
import type { AlertEvent } from '../src/alerts/alert-render';

/** Raising an alert, against a real scratch database (KITS_TEST_DATABASE_URL) with fake email and WhatsApp senders. */
const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const TAG = 'ALTEST';

async function world(over: { whatsappConfigured?: boolean; emailOk?: boolean; templateOk?: boolean } = {}) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const clean = async () => {
    await prisma.adminAlert.deleteMany({});
    await prisma.alertSetting.deleteMany({});
    await prisma.whatsappContact.deleteMany({ where: { phone: { startsWith: '254799' } } });
    await prisma.stockLevel.deleteMany({ where: { variant: { sku: { startsWith: TAG } } } });
    await prisma.productVariant.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.store.deleteMany({ where: { code: { startsWith: TAG } } });
  };
  await clean();
  const sent = { email: [] as any[], text: [] as any[], template: [] as any[] };
  const email = { send: async (m: any) => { sent.email.push(m); return over.emailOk === false ? { delivered: false, error: 'smtp down' } : { delivered: true }; } };
  const whatsapp: any = {
    isConfigured: over.whatsappConfigured ?? true,
    normalisePhone: (r: string) => { const d = r.replace(/\D/g, ''); return d.startsWith('0') ? `254${d.slice(1)}` : d.length === 9 ? `254${d}` : d || null; },
    sendText: async (to: string, body: string) => { sent.text.push({ to, body }); return { delivered: true }; },
    sendTemplate: async (to: string, params: string[], template: string) => {
      sent.template.push({ to, params, template });
      return over.templateOk === false ? { delivered: false, error: 'Template name does not exist', errorCode: '132001' } : { delivered: true };
    },
  };
  const service = new AlertsService(prisma as any, email as any, whatsapp);
  await prisma.alertSetting.create({ data: { emailRecipients: ['boss@x.test'], whatsappRecipients: ['0799000111'], kinds: {} } });
  return { prisma, service, sent, clean };
}

const event = (over: Partial<AlertEvent> = {}): AlertEvent => ({
  kind: 'inquiry.contact', subject: 'Contact form: Wanjiku', heading: 'New contact form submission',
  rows: [['Name', 'Wanjiku'], ['Phone', '0712345678']], text: { label: 'Message', value: 'Hello' },
  followUp: { phone: '0712345678', message: 'Hi' }, portalPath: '/portal/inquiries', dedupeKey: 'i-1', ...over,
});

db('an alert goes by email and, with no open window, by the approved template, and is logged with what happened', async () => {
  const w = await world();
  try {
    await w.service.notify(event());
    assert.equal(w.sent.email.length, 1);
    assert.equal(w.sent.email[0].to, 'boss@x.test');
    assert.equal(w.sent.text.length, 0);
    assert.equal(w.sent.template.length, 1);
    assert.deepEqual([w.sent.template[0].to, w.sent.template[0].template], ['254799000111', 'admin_alert']);
    assert.equal(w.sent.template[0].params.length, 3);
    const [row] = await w.prisma.adminAlert.findMany();
    assert.equal(row.kind, 'inquiry.contact');
    assert.match(row.followUpUrl ?? '', /^https:\/\/wa\.me\/254712345678/);
    const results = row.results as any;
    assert.equal(results.email[0].status, 'SENT');
    assert.deepEqual([results.whatsapp[0].status, results.whatsapp[0].how], ['SENT', 'TEMPLATE']);
  } finally { await w.clean(); await w.prisma.$disconnect(); }
});

db('inside the 24 hours after the person last wrote to the shop, the whole message goes as plain text, not the template', async () => {
  const w = await world();
  try {
    await w.prisma.whatsappContact.create({ data: { phone: '254799000111', lastMessageAt: new Date() } });
    await w.service.notify(event());
    assert.equal(w.sent.template.length, 0);
    assert.equal(w.sent.text.length, 1);
    assert.match(w.sent.text[0].body, /^\*Contact form: Wanjiku\*/);
    // A window that closed yesterday is not open.
    await w.prisma.whatsappContact.update({ where: { phone: '254799000111' }, data: { lastMessageAt: new Date(Date.now() - 30 * 3_600_000) } });
    await w.service.notify(event({ dedupeKey: 'i-2' }));
    assert.equal(w.sent.template.length, 1);
  } finally { await w.clean(); await w.prisma.$disconnect(); }
});

db('the same event twice is one alert; the same kind with another key is another', async () => {
  const w = await world();
  try {
    await w.service.notify(event());
    await w.service.notify(event());
    await w.service.notify(event({ dedupeKey: 'i-2' }));
    assert.equal(await w.prisma.adminAlert.count(), 2);
    assert.equal(w.sent.email.length, 2);
  } finally { await w.clean(); await w.prisma.$disconnect(); }
});

db('a kind switched off for one channel still goes by the other, and off for both is only logged', async () => {
  const w = await world();
  try {
    await w.service.updateSettings({ kinds: { 'inquiry.contact': { whatsapp: false }, 'customer.signup': { email: false, whatsapp: false } } }, 'tester');
    await w.service.notify(event());
    assert.equal(w.sent.email.length, 1);
    assert.equal(w.sent.template.length + w.sent.text.length, 0);
    await w.service.notify(event({ kind: 'customer.signup', dedupeKey: 's-1' }));
    assert.equal(w.sent.email.length, 1);
    const off = await w.prisma.adminAlert.findFirstOrThrow({ where: { kind: 'customer.signup' } });
    assert.match((off.results as any).skipped, /switched off/);
    // The master switch silences everything.
    await w.service.updateSettings({ enabled: false }, 'tester');
    await w.service.notify(event({ dedupeKey: 'i-9' }));
    assert.equal(w.sent.email.length, 1);
  } finally { await w.clean(); await w.prisma.$disconnect(); }
});

db('the daily WhatsApp limit stops WhatsApp but never email, and says so', async () => {
  const w = await world();
  try {
    await w.service.updateSettings({ dailyWhatsAppCap: 2 }, 'tester');
    for (const key of ['a', 'b', 'c']) await w.service.notify(event({ dedupeKey: key }));
    assert.equal(w.sent.template.length, 2);
    assert.equal(w.sent.email.length, 3);
    const last = await w.prisma.adminAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 1 });
    assert.equal((last[0].results as any).whatsapp[0].status, 'SKIPPED');
    assert.match((last[0].results as any).whatsapp[0].error, /limit of 2/);
  } finally { await w.clean(); await w.prisma.$disconnect(); }
});

db('a template WhatsApp has not approved is reported plainly, and an email failure does not stop WhatsApp', async () => {
  const w = await world({ templateOk: false, emailOk: false });
  try {
    await w.service.notify(event());
    const results = (await w.prisma.adminAlert.findFirstOrThrow()).results as any;
    assert.equal(results.email[0].status, 'FAILED');
    assert.equal(results.whatsapp[0].status, 'FAILED');
    assert.match(results.whatsapp[0].error, /not approved in WhatsApp Manager/);
  } finally { await w.clean(); await w.prisma.$disconnect(); }
});

db('with WhatsApp not set up on the server, WhatsApp is skipped with the reason and email still goes', async () => {
  const w = await world({ whatsappConfigured: false });
  try {
    await w.service.notify(event());
    const results = (await w.prisma.adminAlert.findFirstOrThrow()).results as any;
    assert.equal(results.email[0].status, 'SENT');
    assert.equal(results.whatsapp[0].status, 'SKIPPED');
    assert.match(results.whatsapp[0].error, /not set up/);
  } finally { await w.clean(); await w.prisma.$disconnect(); }
});

db('a test alert reaches every recipient on both channels whatever the switches say', async () => {
  const w = await world();
  try {
    await w.service.updateSettings({ enabled: false }, 'tester');
    const result = await w.service.sendTest('boss@x.test');
    assert.equal(result.email[0].status, 'SENT');
    assert.equal(result.whatsapp[0].status, 'SENT');
  } finally { await w.clean(); await w.prisma.$disconnect(); }
});

db('a size taken to its reorder level raises one alert a day, and one still above it raises none', async () => {
  const w = await world();
  try {
    const store = await w.prisma.store.create({ data: { code: `${TAG}-A`, name: 'Alert A' } });
    const product = await w.prisma.product.create({ data: { sku: `${TAG}-P`, slug: `${TAG.toLowerCase()}-p`, name: 'Alert Shoe' } as any });
    const variant = await w.prisma.productVariant.create({ data: { productId: product.id, sku: `${TAG}-V`, name: 'EUR 42', priceKes: 3000 } as any });
    await w.prisma.stockLevel.create({ data: { variantId: variant.id, storeId: store.id, quantity: 9, reorderAt: 3 } });
    await w.service.checkLowStock(variant.id, store.id);
    assert.equal(await w.prisma.adminAlert.count(), 0);
    await w.prisma.stockLevel.update({ where: { variantId_storeId: { variantId: variant.id, storeId: store.id } }, data: { quantity: 3 } });
    await w.service.checkLowStock(variant.id, store.id);
    await w.service.checkLowStock(variant.id, store.id);
    assert.equal(await w.prisma.adminAlert.count({ where: { kind: 'stock.low' } }), 1);
    const row = await w.prisma.adminAlert.findFirstOrThrow({ where: { kind: 'stock.low' } });
    assert.match(row.subject, /Running low: Alert Shoe EUR 42/);
  } finally { await w.clean(); await w.prisma.$disconnect(); }
});

db('the people who receive alerts are recognised by number, however it is typed', async () => {
  const w = await world();
  try {
    assert.equal(await w.service.isOwnNumber('+254 799 000 111'), true);
    assert.equal(await w.service.isOwnNumber('0799000111'), true);
    assert.equal(await w.service.isOwnNumber('254712345678'), false);
  } finally { await w.clean(); await w.prisma.$disconnect(); }
});
