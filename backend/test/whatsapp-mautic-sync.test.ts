import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { MauticService } from '../src/mautic/mautic.service';
import { WhatsappMauticSyncService } from '../src/whatsapp-outreach/whatsapp-mautic-sync.service';
import { MAUTIC_TAGS, mauticMobile, mauticPlan } from '../src/whatsapp-outreach/whatsapp-subscription';

// --- pure rules ------------------------------------------------------------------------------------------------------

test('tags: subscribed, unsubscribed and ad are told apart; resellers are not synced', () => {
  const base = { subscribed: true, unsubscribedReason: null, adSourceId: null };
  assert.deepEqual(mauticPlan(base)!.add, [MAUTIC_TAGS.contact, MAUTIC_TAGS.subscriber]);
  assert.deepEqual(mauticPlan(base)!.remove, [MAUTIC_TAGS.unsubscribed]);
  assert.deepEqual(mauticPlan({ ...base, adSourceId: '1203' })!.add, [MAUTIC_TAGS.contact, MAUTIC_TAGS.subscriber, MAUTIC_TAGS.ad]);
  const stopped = mauticPlan({ ...base, subscribed: false, unsubscribedReason: 'STOP' })!;
  assert.deepEqual([stopped.add, stopped.remove], [[MAUTIC_TAGS.contact, MAUTIC_TAGS.unsubscribed], [MAUTIC_TAGS.subscriber]]);
  assert.notEqual(stopped.signature, mauticPlan(base)!.signature);
  assert.equal(mauticPlan({ ...base, subscribed: false, unsubscribedReason: 'TRADE' }), null);
  assert.equal(mauticMobile('254712345678'), '+254712345678');
});

// --- against a real database (KITS_TEST_DATABASE_URL, a scratch database) and a fake Mautic ------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const PREFIX = '2547991';

type Contact = { id: number; email?: string; mobile?: string; firstname?: string; lastname?: string; tags: Set<string> };

/** Just enough of Mautic's API: token, search by mobile, create-or-update by email, edit by id. */
async function fakeMautic() {
  const contacts = new Map<number, Contact>();
  let next = 100;
  const calls: string[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const u = new URL(req.url!, 'http://x');
      const send = (status: number, body: any) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
      calls.push(`${req.method} ${u.pathname}`);
      if (u.pathname === '/oauth/v2/token') return send(200, { access_token: 't', expires_in: 3600 });
      const body = raw ? JSON.parse(raw) : {};
      const apply = (c: Contact) => {
        for (const t of body.tags ?? []) t.startsWith('-') ? c.tags.delete(t.slice(1)) : c.tags.add(t);
        for (const k of ['email', 'mobile', 'firstname', 'lastname'] as const) if (body[k]) (c as any)[k] = body[k];
        return { contact: { id: c.id } };
      };
      if (req.method === 'GET' && u.pathname === '/api/contacts') {
        const m = (u.searchParams.get('search') ?? '').replace('mobile:', '');
        const hit = [...contacts.values()].find((c) => c.mobile === m);
        return send(200, { total: hit ? 1 : 0, contacts: hit ? { [hit.id]: { id: hit.id } } : [] });
      }
      if (req.method === 'POST' && u.pathname === '/api/contacts/new') {
        const existing = body.email ? [...contacts.values()].find((c) => c.email === body.email) : undefined;
        const c = existing ?? { id: next++, tags: new Set<string>() };
        contacts.set(c.id, c);
        return send(existing ? 200 : 201, apply(c));
      }
      const edit = u.pathname.match(/^\/api\/contacts\/(\d+)\/edit$/);
      if (req.method === 'PATCH' && edit) {
        const c = contacts.get(Number(edit[1]));
        return c ? send(200, apply(c)) : send(404, { errors: [{ message: 'not found' }] });
      }
      send(500, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as any).port;
  return { contacts, calls, port, close: () => new Promise<void>((r) => server.close(() => r())) };
}

async function world() {
  const mock = await fakeMautic();
  process.env.MAUTIC_BASE_URL = `http://127.0.0.1:${mock.port}`;
  process.env.MAUTIC_CLIENT_ID = 'id';
  process.env.MAUTIC_CLIENT_SECRET = 'secret';
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => {
    await prisma.whatsappContact.deleteMany({ where: { phone: { startsWith: PREFIX } } });
    await prisma.customer.deleteMany({ where: { email: { startsWith: 'mautic-test-' } } });
  };
  await cleanup();
  const sync = new WhatsappMauticSyncService(prisma as any, new MauticService());
  const make = (suffix: string, data: any = {}) => prisma.whatsappContact.create({ data: { phone: `${PREFIX}${suffix}`, name: 'Wanjiru K', ...data } });
  const get = (suffix: string) => prisma.whatsappContact.findUniqueOrThrow({ where: { phone: `${PREFIX}${suffix}` } });
  const done = async () => { await cleanup(); await prisma.$disconnect(); await mock.close(); };
  return { prisma, mock, sync, make, get, done };
}

const later = () => new Date(Date.now() + 3_600_000);

db('a new WhatsApp contact reaches Mautic with its number, name and tags, once; nothing is sent again until it changes', async () => {
  const w = await world();
  try {
    await w.make('00001', { adSourceId: '1203' });
    const first = await w.sync.tick();
    assert.equal(first.synced >= 1, true);
    const c = await w.get('00001');
    assert.ok(c.mauticContactId && c.mauticSyncedAt && !c.mauticError);
    const m = w.mock.contacts.get(c.mauticContactId!)!;
    assert.deepEqual([m.mobile, m.firstname, m.lastname], [`+${c.phone}`, 'Wanjiru', 'K']);
    assert.deepEqual([...m.tags].sort(), [MAUTIC_TAGS.ad, MAUTIC_TAGS.contact, MAUTIC_TAGS.subscriber]);
    // Up to date means mauticSyncedAt equals updatedAt, so the next check finds nothing and calls nothing.
    assert.equal(c.mauticSyncedAt!.getTime(), c.updatedAt.getTime());
    const calls = w.mock.calls.length;
    assert.deepEqual(await w.sync.tick(later()), { synced: 0, failed: 0, unchanged: 0, skipped: 0 });
    assert.equal(w.mock.calls.length, calls);
  } finally { await w.done(); }
});

db('STOP moves the Mautic contact from subscriber to unsubscribed on the same contact, and START moves it back', async () => {
  const w = await world();
  try {
    await w.make('00002');
    await w.sync.tick();
    const id = (await w.get('00002')).mauticContactId!;
    await w.prisma.whatsappContact.update({ where: { phone: `${PREFIX}00002` }, data: { subscribed: false, unsubscribedReason: 'STOP', nextStepAt: null } });
    assert.equal((await w.sync.tick(later())).synced, 1);
    assert.deepEqual([...w.mock.contacts.get(id)!.tags].sort(), [MAUTIC_TAGS.contact, MAUTIC_TAGS.unsubscribed]);
    assert.equal((await w.get('00002')).mauticContactId, id);
    await w.prisma.whatsappContact.update({ where: { phone: `${PREFIX}00002` }, data: { subscribed: true, unsubscribedReason: null } });
    await w.sync.tick(new Date(Date.now() + 2 * 3_600_000));
    assert.deepEqual([...w.mock.contacts.get(id)!.tags].sort(), [MAUTIC_TAGS.contact, MAUTIC_TAGS.subscriber]);
    assert.equal(w.mock.contacts.size >= 1 && [...w.mock.contacts.values()].filter((c) => c.mobile === `+${PREFIX}00002`).length, 1);
  } finally { await w.done(); }
});

db('a change that does not touch the tags (the sequence moving on) updates the row but does not call Mautic', async () => {
  const w = await world();
  try {
    await w.make('00003');
    await w.sync.tick();
    const calls = w.mock.calls.length;
    await w.prisma.whatsappContact.update({ where: { phone: `${PREFIX}00003` }, data: { nextStep: 1, lastMessageAt: new Date() } });
    const out = await w.sync.tick(later());
    assert.equal(out.unchanged, 1);
    assert.equal(w.mock.calls.length, calls);
    const c = await w.get('00003');
    assert.equal(c.mauticSyncedAt!.getTime(), c.updatedAt.getTime());
  } finally { await w.done(); }
});

db('a customer who is already in Mautic is tagged on their own contact, by email, and keeps their name; a reseller is not synced', async () => {
  const w = await world();
  try {
    const email = `mautic-test-${Date.now()}@example.test`;
    await w.prisma.customer.create({ data: { firstName: 'Real', lastName: 'Name', email, phone: `0${PREFIX.slice(3)}00004` } });
    w.mock.contacts.set(7, { id: 7, email, firstname: 'Real', lastname: 'Name', tags: new Set(['dripemporium-store']) });
    await w.make('00004', { name: 'Dad 🔥' });
    await w.make('00005', { subscribed: false, unsubscribedReason: 'TRADE', nextStepAt: null });
    await w.sync.tick();
    const c = await w.get('00004');
    assert.equal(c.mauticContactId, 7);
    const m = w.mock.contacts.get(7)!;
    assert.deepEqual([m.firstname, m.lastname], ['Real', 'Name']);
    assert.deepEqual([...m.tags].sort(), ['dripemporium-store', MAUTIC_TAGS.contact, MAUTIC_TAGS.subscriber]);
    const trade = await w.get('00005');
    assert.deepEqual([trade.mauticContactId, trade.mauticSyncedAt !== null], [null, true]);
    assert.equal([...w.mock.contacts.values()].some((x) => x.mobile === `+${PREFIX}00005`), false);
  } finally { await w.done(); }
});

db('a contact already in Mautic by mobile number is reused; one deleted in Mautic is made again', async () => {
  const w = await world();
  try {
    w.mock.contacts.set(50, { id: 50, mobile: `+${PREFIX}00006`, tags: new Set() });
    await w.make('00006');
    await w.make('00007', { mauticContactId: 999 }); // 999 no longer exists in Mautic
    await w.sync.tick();
    assert.equal((await w.get('00006')).mauticContactId, 50);
    const re = await w.get('00007');
    assert.notEqual(re.mauticContactId, 999);
    assert.ok(w.mock.contacts.get(re.mauticContactId!));
  } finally { await w.done(); }
});

db('when Mautic is down the contact is kept for later with the reason, and retried after a wait, not on every check', async () => {
  const w = await world();
  try {
    await w.make('00008');
    const real = (w.sync as any).mautic.syncWhatsappContact;
    (w.sync as any).mautic.syncWhatsappContact = async () => ({ ok: false, error: 'Mautic answered 503' });
    const out = await w.sync.tick();
    assert.ok(out.failed >= 1);
    let c = await w.get('00008');
    assert.deepEqual([c.mauticContactId, c.mauticError], [null, 'Mautic answered 503']);
    assert.equal((await w.sync.tick(new Date(Date.now() + 60_000))).failed, 0); // too soon
    (w.sync as any).mautic.syncWhatsappContact = real;
    assert.equal((await w.sync.tick(later())).synced, 1);
    c = await w.get('00008');
    assert.ok(c.mauticContactId);
    assert.equal(c.mauticError, null);
  } finally { await w.done(); }
});

db('MAUTIC_WHATSAPP_SYNC=false turns it off', async () => {
  const w = await world();
  try {
    await w.make('00009');
    process.env.MAUTIC_WHATSAPP_SYNC = 'false';
    assert.deepEqual(await w.sync.tick(), { synced: 0, failed: 0, unchanged: 0, skipped: 0 });
    assert.equal((await w.get('00009')).mauticContactId, null);
  } finally { delete process.env.MAUTIC_WHATSAPP_SYNC; await w.done(); }
});
