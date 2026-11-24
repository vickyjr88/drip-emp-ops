import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { EmailLogService } from '../src/email-log/email-log.service';
import { LeadFollowUpService } from '../src/cart-lead/lead-followup.service';
import { CartLeadService } from '../src/cart-lead/cart-lead.service';

/**
 * The automatic lead follow-up against a real database (KITS_TEST_DATABASE_URL, a scratch database), with WhatsApp and email faked so that
 * what would be sent, and to whom, can be read back. Every test clock is fixed (12:00 in Nairobi) so the 08:00-20:00 window is not luck.
 */
const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const PREFIX = '2547991';
const NOW = new Date('2026-11-24T09:00:00Z');
const hoursAgo = (h: number, from = NOW) => new Date(from.getTime() - h * 3_600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);
let counter = 0;
const phoneN = () => `+${PREFIX}${String(++counter).padStart(5, '0')}`;
const emailN = () => `followup-test-${Date.now()}-${++counter}@example.test`;

async function world(opts: { template?: (to: string, params: string[], template?: string) => any; send?: () => any; env?: Record<string, string> } = {}) {
  const saved: Record<string, string | undefined> = {};
  const env = { STOREFRONT_ORIGIN: 'https://dripemporium.store', LEAD_FOLLOWUP_ENABLED: 'true', LEAD_FOLLOWUP_BATCH: '10', WHATSAPP_DAILY_SEND_CAP: '200', ...(opts.env ?? {}) };
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; process.env[k] = v; }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => {
    await prisma.emailLog.deleteMany({ where: { recipient: { startsWith: 'followup-test-' } } });
    await prisma.whatsappOutreach.deleteMany({ where: { phone: { startsWith: PREFIX } } });
    await prisma.whatsappContact.deleteMany({ where: { phone: { startsWith: PREFIX } } });
    // Every test lead carries the marker in its message, so even one with no phone and no email (which the other keys cannot find) is removed.
    await prisma.cartLead.deleteMany({ where: { OR: [{ message: 'followup-test' }, { customerPhone: { startsWith: `+${PREFIX}` } }, { customerEmail: { startsWith: 'followup-test-' } }] } });
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  };
  await cleanup();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  // A run follows up every due lead in the database, not just these tests' own, so the scratch database must hold no other open ones.
  const foreign = await prisma.cartLead.count({ where: { followUpState: 'PENDING', status: { in: ['NEW', 'CONTACTED'] } } });
  if (foreign > 0) { await cleanup(); await prisma.$disconnect(); throw new Error(`The scratch database has ${foreign} other open leads. Use an empty one.`); }

  const templates: Array<{ to: string; params: string[]; template?: string }> = [];
  const emails: Array<{ to: string; subject: string; html: string }> = [];
  const whatsapp: any = {
    isConfigured: true,
    normalisePhone: (p: string) => { const d = String(p).replace(/\D/g, ''); return d.length >= 9 ? d : null; },
    sendTemplate: async (to: string, params: string[], template?: string) => { templates.push({ to, params, template }); return opts.template ? opts.template(to, params, template) : { delivered: true, messageId: `wamid.LEAD${templates.length}-${Math.random()}` }; },
  };
  const sender: any = {
    isConfigured: true,
    send: async (p: any) => { emails.push({ to: p.to, subject: p.subject, html: p.html }); return opts.send ? opts.send() : { delivered: true }; },
  };
  const emailLog = new EmailLogService(prisma as any, sender);
  const service = new LeadFollowUpService(prisma as any, whatsapp, emailLog, sender);

  const lead = (over: Record<string, unknown> = {}) => prisma.cartLead.create({
    data: {
      source: 'ABANDONED_CART', customerName: 'Wanjiku Kamau', customerPhone: phoneN(), customerEmail: emailN(),
      lines: [{ variantId: 'none', sku: 'S', name: 'Nike Air Force 1', size: '42', quantity: 1, priceKes: 6500 }], subtotal: 6500, total: 6500,
      message: 'followup-test', createdAt: hoursAgo(3), lastActivityAt: hoursAgo(2), ...over,
    } as any,
  });
  const get = (id: string) => prisma.cartLead.findUniqueOrThrow({ where: { id } });
  return { prisma, service, templates, emails, lead, get, cleanup, emailLog };
}

db('an abandoned cart an hour old gets a WhatsApp message and an email, the email is logged, and the lead is marked done', async () => {
  const w = await world();
  try {
    const lead = await w.lead();
    const r = await w.service.tick(NOW);
    assert.deepEqual([r.sent, r.emailed, r.closed], [1, 1, 1]);

    assert.equal(w.templates.length, 1);
    assert.equal(w.templates[0].template, 'drip_cart_followup');
    assert.equal(w.templates[0].params[0], 'Wanjiku');
    assert.equal(w.templates[0].params[1], 'Nike Air Force 1 (size 42)');
    assert.match(w.templates[0].params[2], /^https:\/\/dripemporium\.store\/cart\?utm_source=whatsapp&utm_medium=auto-followup&utm_campaign=abandoned-cart$/);
    assert.equal(w.emails.length, 1);
    assert.equal(w.emails[0].subject, 'You left something in your cart');

    // The email is in the log, tied to the lead.
    const logs = await w.prisma.emailLog.findMany({ where: { cartLeadId: lead.id } });
    assert.equal(logs.length, 1);
    assert.deepEqual([logs[0].kind, logs[0].status, logs[0].recipient], ['LEAD_FOLLOWUP', 'SENT', lead.customerEmail]);
    assert.ok(logs[0].sentAt);

    // The WhatsApp message is in the outreach log, and the lead says what happened.
    const sent = await w.prisma.whatsappOutreach.findMany({ where: { phone: lead.customerPhone!.slice(1) } });
    assert.deepEqual([sent.length, sent[0].kind, sent[0].status, sent[0].triggeredBy], [1, 'FOLLOWUP_CART', 'SENT', 'lead-followup']);
    const done = await w.get(lead.id);
    assert.deepEqual([done.followUpState, done.followUpReason, done.followUpWhatsapp, done.followUpEmail, done.followUpBy], ['DONE', 'SENT', 'SENT', 'SENT', 'auto']);
    assert.ok(done.followUpWhatsappMessageId && done.followUpAt && done.reminderSentAt);

    // A second run does nothing more.
    await w.service.tick(new Date(NOW.getTime() + 5 * 60_000));
    assert.equal(w.templates.length, 1);
    assert.equal(w.emails.length, 1);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a WhatsApp order enquiry gets its own template and email wording', async () => {
  const w = await world();
  try {
    const lead = await w.lead({ source: 'WHATSAPP_ORDER' });
    await w.service.tick(NOW);
    assert.equal(w.templates[0].template, 'drip_order_followup');
    assert.match(w.templates[0].params[2], /\/shop\?utm_source=whatsapp&utm_medium=auto-followup&utm_campaign=whatsapp-order/);
    assert.equal(w.emails[0].subject, 'About the pair you asked about');
    assert.equal((await w.get(lead.id)).followUpState, 'DONE');
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('nothing is sent before the hour is up, or outside 08:00-20:00 Nairobi time, but marking still happens', async () => {
  const w = await world();
  try {
    const fresh = await w.lead({ createdAt: hoursAgo(1), lastActivityAt: new Date(NOW.getTime() - 40 * 60_000) });
    const due = await w.lead();
    const converted = await w.lead({ status: 'CONVERTED' });

    await w.service.tick(new Date('2026-11-24T22:00:00Z')); // 01:00 Nairobi
    assert.equal(w.templates.length + w.emails.length, 0, 'nothing at night');
    assert.equal((await w.get(due.id)).followUpState, 'PENDING');
    assert.equal((await w.get(converted.id)).followUpState, 'SKIPPED', 'but a converted lead is marked at any hour');

    await w.service.tick(NOW);
    assert.equal((await w.get(fresh.id)).followUpState, 'PENDING', 'forty minutes old is not due');
    assert.equal((await w.get(due.id)).followUpState, 'DONE');
    assert.equal(w.templates.length, 1);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a customer who already messaged the shop on WhatsApp is not chased on either channel and is marked as having a conversation', async () => {
  const w = await world();
  try {
    const lead = await w.lead();
    await w.prisma.whatsappContact.create({ data: { phone: lead.customerPhone!.slice(1), lastMessageAt: hoursAgo(1) } });
    await w.service.tick(NOW);
    assert.equal(w.templates.length + w.emails.length, 0);
    const marked = await w.get(lead.id);
    assert.deepEqual([marked.followUpState, marked.followUpReason, marked.followUpWhatsapp], ['DONE', 'CONVERSATION', 'CONVERSATION']);

    // Someone who wrote to the shop long before the lead did not open a conversation about it.
    const other = await w.lead();
    await w.prisma.whatsappContact.create({ data: { phone: other.customerPhone!.slice(1), lastMessageAt: daysAgo(9) } });
    await w.service.tick(NOW);
    assert.equal((await w.get(other.id)).followUpState, 'DONE');
    assert.equal(w.templates.length, 1);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a lead staff already followed up (the WhatsApp button marks it contacted) is marked done and not chased', async () => {
  const w = await world();
  try {
    const lead = await w.lead({ status: 'CONTACTED' });
    await w.service.tick(NOW);
    assert.equal(w.templates.length + w.emails.length, 0);
    assert.deepEqual([(await w.get(lead.id)).followUpState, (await w.get(lead.id)).followUpReason], ['DONE', 'STAFF']);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('the backlog of thirty days is worked through a batch at a time, newest first, and older leads are marked too old', async () => {
  const w = await world({ env: { LEAD_FOLLOWUP_BATCH: '10' } });
  try {
    const leads = [];
    for (let i = 1; i <= 25; i += 1) leads.push(await w.lead({ createdAt: daysAgo(i), lastActivityAt: daysAgo(i) })); // one to twenty-five days old
    const ancient = await w.lead({ createdAt: daysAgo(45), lastActivityAt: daysAgo(45) });

    const first = await w.service.tick(NOW);
    assert.equal(first.sent, 10);
    // Newest first: the ten freshest are done, the oldest of them is ten days old.
    for (const l of leads.slice(0, 10)) assert.equal((await w.get(l.id)).followUpState, 'DONE');
    assert.equal((await w.get(leads[10].id)).followUpState, 'PENDING');
    assert.deepEqual([(await w.get(ancient.id)).followUpState, (await w.get(ancient.id)).followUpReason], ['SKIPPED', 'TOO_OLD']);

    assert.equal((await w.service.tick(new Date(NOW.getTime() + 5 * 60_000))).sent, 10);
    assert.equal((await w.service.tick(new Date(NOW.getTime() + 10 * 60_000))).sent, 5);
    assert.equal((await w.service.tick(new Date(NOW.getTime() + 15 * 60_000))).sent, 0);
    assert.equal(await w.prisma.cartLead.count({ where: { id: { in: leads.map((l) => l.id) }, followUpState: 'DONE' } }), 25);
    assert.equal(w.emails.length, 25);
    assert.equal(await w.prisma.emailLog.count({ where: { kind: 'LEAD_FOLLOWUP', recipient: { startsWith: 'followup-test-' } } }), 25);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('the daily cap is respected: leads wait for tomorrow, both channels together', async () => {
  const w = await world({ env: { WHATSAPP_DAILY_SEND_CAP: '2', LEAD_FOLLOWUP_RESERVE: '1' } });
  try {
    const a = await w.lead(); const b = await w.lead(); const c = await w.lead(); const d = await w.lead();
    const r = await w.service.tick(NOW);
    assert.equal(r.sent, 3); // cap 2 + reserve 1
    assert.equal(w.emails.length, 3, 'no email goes without its WhatsApp message');
    const states = await Promise.all([a, b, c, d].map(async (l) => (await w.get(l.id)).followUpState));
    assert.equal(states.filter((s) => s === 'DONE').length, 3);
    assert.equal(states.filter((s) => s === 'PENDING').length, 1);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a number that is not on WhatsApp is marked failed, and the email still goes if there is one', async () => {
  const w = await world({ template: () => ({ delivered: false, error: '(#131026) Message undeliverable', errorCode: '131026' }) });
  try {
    const both = await w.lead();
    const phoneOnly = await w.lead({ customerEmail: null });
    await w.service.tick(NOW);

    const a = await w.get(both.id);
    assert.deepEqual([a.followUpState, a.followUpWhatsapp, a.followUpEmail], ['DONE', 'FAILED', 'SENT']);
    assert.match(a.followUpNote!, /could not be reached/);

    const b = await w.get(phoneOnly.id);
    assert.deepEqual([b.followUpState, b.followUpReason, b.followUpWhatsapp], ['FAILED', 'WHATSAPP_FAILED', 'FAILED']);
    // The failure is on record, with Meta's reason.
    const rows = await w.prisma.whatsappOutreach.findMany({ where: { phone: phoneOnly.customerPhone!.slice(1) } });
    assert.deepEqual([rows[0].status, rows[0].error], ['FAILED', '(#131026) Message undeliverable']);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('when WhatsApp reports a delivery failure later, the lead is marked then', async () => {
  const w = await world();
  try {
    const lead = await w.lead({ customerEmail: null });
    await w.service.tick(NOW);
    assert.equal((await w.get(lead.id)).followUpState, 'DONE'); // accepted, so far
    const sent = await w.prisma.whatsappOutreach.findFirstOrThrow({ where: { phone: lead.customerPhone!.slice(1) } });
    await w.prisma.whatsappOutreach.update({ where: { id: sent.id }, data: { delivery: 'failed', deliveryError: '131026: Message undeliverable' } });

    await w.service.tick(new Date(NOW.getTime() + 5 * 60_000));
    const marked = await w.get(lead.id);
    assert.deepEqual([marked.followUpState, marked.followUpReason, marked.followUpWhatsapp], ['FAILED', 'WHATSAPP_FAILED', 'FAILED']);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a failure that is the shop’s own account does not mark customers: the run pauses, nothing is emailed, and it carries on once the problem is gone', async () => {
  let broken = true;
  const w = await world({ template: () => (broken ? { delivered: false, error: '(#131042) Business eligibility payment issue', errorCode: '131042' } : { delivered: true, messageId: `wamid.OK${Math.random()}` }), env: { LEAD_FOLLOWUP_PAUSE_HOURS: '6' } });
  try {
    const a = await w.lead(); const b = await w.lead();
    const r = await w.service.tick(NOW);
    assert.match(r.paused ?? '', /account problem/);
    assert.equal(w.templates.length, 1, 'one try, then the run stops');
    assert.equal(w.emails.length, 0, 'no email goes without its WhatsApp message');
    for (const l of [a, b]) assert.deepEqual([(await w.get(l.id)).followUpState, (await w.get(l.id)).followUpWhatsapp, (await w.get(l.id)).followUpAttempts], ['PENDING', null, 0]);

    // Still paused five minutes later.
    await w.service.tick(new Date(NOW.getTime() + 5 * 60_000));
    assert.equal(w.templates.length, 1);

    broken = false;
    const later = new Date(NOW.getTime() + 7 * 3_600_000 - 20 * 3_600_000 + 20 * 3_600_000); // 19:00 Nairobi, past the pause, inside the window
    const after = await w.service.tick(later);
    assert.equal(after.sent, 2);
    assert.equal((await w.get(a.id)).followUpState, 'DONE');
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a template that does not exist pauses the run and says so, instead of marking everyone failed', async () => {
  const w = await world({ template: () => ({ delivered: false, error: '(#132001) Template name does not exist in the translation', errorCode: '132001' }) });
  try {
    const lead = await w.lead();
    const r = await w.service.tick(NOW);
    assert.match(r.paused ?? '', /not set up for follow-ups \(drip_cart_followup\)/);
    assert.deepEqual([(await w.get(lead.id)).followUpState, (await w.get(lead.id)).followUpWhatsapp], ['PENDING', null]);
    const summary = await w.service.summary(NOW);
    assert.ok(summary.paused);
    assert.match(String(summary.problem), /132001/);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('someone who replied STOP gets the email but never the WhatsApp message', async () => {
  const w = await world();
  try {
    const lead = await w.lead();
    await w.prisma.whatsappContact.create({ data: { phone: lead.customerPhone!.slice(1), subscribed: false, unsubscribedReason: 'STOP', lastMessageAt: daysAgo(40) } });
    await w.service.tick(NOW);
    assert.equal(w.templates.length, 0);
    assert.equal(w.emails.length, 1);
    assert.equal((await w.get(lead.id)).followUpState, 'DONE');
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('the same person with two leads is followed up once', async () => {
  const w = await world();
  try {
    const phone = phoneN(); const email = emailN();
    const newer = await w.lead({ customerPhone: phone, customerEmail: email, lastActivityAt: hoursAgo(2), createdAt: hoursAgo(3) });
    const older = await w.lead({ customerPhone: phone, customerEmail: email, lastActivityAt: hoursAgo(30), createdAt: hoursAgo(31) });
    await w.service.tick(NOW);
    assert.equal(w.templates.length, 1);
    assert.equal(w.emails.length, 1);
    assert.deepEqual([(await w.get(newer.id)).followUpReason, (await w.get(older.id)).followUpReason], ['SENT', 'DUPLICATE']);
    assert.equal((await w.get(older.id)).followUpState, 'DONE');
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a lead that already had the old 24-hour reminder email is not emailed again, but is still sent the WhatsApp message', async () => {
  const w = await world();
  try {
    const lead = await w.lead({ reminderSentAt: hoursAgo(20) });
    await w.service.tick(NOW);
    assert.equal(w.emails.length, 0);
    assert.equal(w.templates.length, 1);
    assert.equal((await w.get(lead.id)).followUpState, 'DONE');
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a failed email is logged as failed and tried again later, and given up on after three tries', async () => {
  const w = await world({ send: () => ({ delivered: false, error: 'mailbox full' }) });
  try {
    // No phone, so the email is the only way.
    const lead = await w.lead({ customerPhone: null });
    await w.service.tick(NOW);
    let l = await w.get(lead.id);
    assert.deepEqual([l.followUpState, l.followUpEmail, l.followUpEmailAttempts], ['PENDING', 'FAILED', 1]);
    assert.ok(l.followUpNextAt && l.followUpNextAt > NOW);
    const log = await w.prisma.emailLog.findFirstOrThrow({ where: { cartLeadId: lead.id } });
    assert.deepEqual([log.status, log.errorMessage, log.kind], ['FAILED', 'mailbox full', 'LEAD_FOLLOWUP']);

    // Waits for its retry time, then tries again.
    await w.service.tick(new Date(NOW.getTime() + 10 * 60_000));
    assert.equal(w.emails.length, 1);
    await w.service.tick(new Date(NOW.getTime() + 70 * 60_000));
    assert.equal(w.emails.length, 2);
    await w.service.tick(new Date(NOW.getTime() + 140 * 60_000));
    l = await w.get(lead.id);
    assert.equal(w.emails.length, 3);
    assert.deepEqual([l.followUpState, l.followUpReason], ['FAILED', 'GAVE_UP']);
    assert.equal(await w.prisma.emailLog.count({ where: { cartLeadId: lead.id, status: 'FAILED' } }), 3);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a lead with no phone and no real email is skipped and marked; a stand-in address is not an address', async () => {
  const w = await world();
  try {
    const nobody = await w.lead({ customerPhone: null, customerEmail: null });
    const standIn = await w.lead({ customerPhone: null, customerEmail: '254722000000@customer.invalid' });
    await w.service.tick(NOW);
    assert.equal(w.emails.length + w.templates.length, 0);
    for (const l of [nobody, standIn]) assert.deepEqual([(await w.get(l.id)).followUpState, (await w.get(l.id)).followUpReason], ['SKIPPED', 'NO_CONTACT']);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('two backend slots running at once never message the same lead twice', async () => {
  const w = await world();
  try {
    const leads = [];
    for (let i = 0; i < 6; i += 1) leads.push(await w.lead());
    // A second "slot" sharing the database and the fakes.
    const other = new LeadFollowUpService(w.prisma as any, (w.service as any).whatsapp, w.emailLog, (w.service as any).sender);
    await Promise.all([w.service.tick(NOW), other.tick(NOW)]);
    assert.equal(w.templates.length, 6, `each lead gets exactly one WhatsApp message, got ${w.templates.length}`);
    assert.equal(w.emails.length, 6);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('staff can mark a lead followed up by hand, and put it back; a closed lead cannot be reopened', async () => {
  const w = await world();
  try {
    const lead = await w.lead();
    await w.service.markDone(lead.id, 'owner@dripemporium.store', 'Called, will collect Friday');
    let l = await w.get(lead.id);
    assert.deepEqual([l.followUpState, l.followUpReason, l.followUpBy, l.followUpNote], ['DONE', 'STAFF', 'owner@dripemporium.store', 'Called, will collect Friday']);
    await w.service.tick(NOW);
    assert.equal(w.templates.length + w.emails.length, 0, 'marked done, so left alone');

    await w.service.reopen(lead.id);
    await w.service.tick(NOW);
    assert.equal(w.templates.length, 1);

    const closed = await w.lead({ status: 'CONVERTED' });
    await assert.rejects(() => w.service.reopen(closed.id), /closed/);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('opening the WhatsApp follow-up, or placing an order, marks the lead straight away', async () => {
  const w = await world();
  try {
    const leads = new CartLeadService(w.prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const a = await w.lead(); const b = await w.lead();
    await leads.setStatus(a.id, 'CONTACTED', 'owner@dripemporium.store');
    assert.deepEqual([(await w.get(a.id)).followUpState, (await w.get(a.id)).followUpBy], ['DONE', 'owner@dripemporium.store']);
    await leads.setStatus(b.id, 'EXPIRED');
    assert.deepEqual([(await w.get(b.id)).followUpState, (await w.get(b.id)).followUpReason], ['SKIPPED', 'CLOSED']);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('the summary and the dry run say what is waiting and what would happen, without sending anything', async () => {
  const w = await world();
  try {
    const waiting = await w.lead();
    await w.lead({ customerPhone: null, customerEmail: null });
    const preview = await w.service.preview(10, NOW);
    assert.equal(preview.sendingNow, true);
    const row = preview.leads.find((l) => l.id === waiting.id)!;
    assert.deepEqual(row.plan, { action: 'SEND', whatsapp: true, email: true });
    assert.ok(preview.leads.some((l) => (l.plan as any).reason === 'NO_CONTACT'));
    assert.equal(w.templates.length + w.emails.length, 0, 'a dry run sends nothing');
    assert.equal((await w.get(waiting.id)).followUpState, 'PENDING', 'and changes nothing');

    const summary = await w.service.summary(NOW);
    assert.equal(summary.enabled, true);
    assert.equal(summary.window.open, true);
    assert.ok(summary.counts.dueNow >= 2);
    assert.equal(summary.today.cap, 240);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('switched off, nothing happens at all', async () => {
  const w = await world({ env: { LEAD_FOLLOWUP_ENABLED: 'false' } });
  try {
    const lead = await w.lead();
    const converted = await w.lead({ status: 'CONVERTED' });
    await w.service.tick(NOW);
    assert.equal(w.templates.length + w.emails.length, 0);
    assert.equal((await w.get(lead.id)).followUpState, 'PENDING');
    assert.equal((await w.get(converted.id)).followUpState, 'PENDING');
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});
