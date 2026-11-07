import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_APP_URL, greetingName, safeUrl, templateFor } from '../src/whatsapp-outreach/whatsapp-outreach.kinds';
import { WhatsAppOutreachService } from '../src/whatsapp-outreach/whatsapp-outreach.service';
import { WhatsAppOutreachController } from '../src/whatsapp-outreach/whatsapp-outreach.controller';

test('the greeting uses a real first name and otherwise says "there"', () => {
  assert.equal(greetingName('wanjiku'), 'Wanjiku');
  assert.equal(greetingName('  JOHN  mwangi'), 'John');
  assert.equal(greetingName(''), 'there');
  assert.equal(greetingName(null), 'there');
  assert.equal(greetingName('0722123456'), 'there');
  assert.equal(greetingName('a@b.co'), 'there');
});

test('only web links are sent to customers', () => {
  assert.equal(safeUrl('https://chat.whatsapp.com/abc'), 'https://chat.whatsapp.com/abc');
  assert.equal(safeUrl('  https://g.page/r/xyz/review '), 'https://g.page/r/xyz/review');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('not a url'), null);
  assert.equal(safeUrl(''), null);
  assert.equal(safeUrl(undefined), null);
  assert.ok(safeUrl(DEFAULT_APP_URL));
});

test('template names have defaults and can be overridden', () => {
  assert.equal(templateFor('APP'), 'drip_app_download');
  assert.equal(templateFor('GROUP'), 'drip_join_group');
  assert.equal(templateFor('REVIEW'), 'drip_rate_us');
  assert.equal(templateFor('GOOGLE_REVIEW'), 'google_review');
  assert.equal(templateFor('SHOE_RANGE'), 'shoe_variety');
  assert.equal(templateFor('LOCATION'), 'shop_location');
});

type Row = { id: string; firstName: string; lastName: string; phone: string; isActive: boolean };

/** The service with the database and Meta replaced by in-memory fakes. */
function harness(customers: Row[], sentBefore: string[] = [], footer: any = { community: { whatsappGroupUrl: 'https://chat.whatsapp.com/g', googleProfileUrl: 'https://g.page/r/x/review' } }) {
  const created: any[] = [];
  const calls: { to: string; params: string[]; template?: string }[] = [];
  const prisma: any = {
    customer: { findMany: async ({ where }: any) => customers.filter((c) => where.id.in.includes(c.id)) },
    whatsappOutreach: {
      findMany: async () => sentBefore.map((customerId) => ({ customerId })),
      create: async ({ data }: any) => created.push(data),
    },
  };
  const whatsapp: any = {
    isConfigured: true,
    normalisePhone: (p: string) => (p.replace(/\D/g, '').length >= 9 ? `254${p.replace(/\D/g, '').slice(-9)}` : null),
    sendTemplate: async (to: string, params: string[], template?: string) => {
      calls.push({ to, params, template });
      return to.endsWith('99999999') ? { delivered: false, error: 'Recipient not on WhatsApp' } : { delivered: true, messageId: `wamid.${to}` };
    },
  };
  // Stands in for PageContentService, which returns stored content already layered over the defaults.
  const pages: any = { findOne: async () => ({ content: footer ?? {} }) };
  return { service: new WhatsAppOutreachService(prisma, whatsapp, pages), created, calls };
}

const ann: Row = { id: 'a', firstName: 'ann', lastName: 'W', phone: '0722111222', isActive: true };
const bob: Row = { id: 'b', firstName: 'Bob', lastName: 'K', phone: '0733222333', isActive: true };

test('sending records each message and passes the first name and link to the template', async () => {
  const { service, created, calls } = harness([ann, bob]);
  const out = await service.send({ kind: 'GROUP', customerIds: ['a', 'b'], triggeredBy: 'staff@x' });
  assert.equal(out.sent, 2);
  assert.deepEqual(calls[0], { to: '254722111222', params: ['Ann', 'https://chat.whatsapp.com/g'], template: 'drip_join_group' });
  assert.deepEqual(created.map((c) => [c.customerId, c.kind, c.status, c.triggeredBy]), [['a', 'GROUP', 'SENT', 'staff@x'], ['b', 'GROUP', 'SENT', 'staff@x']]);
});

test('someone who already got the message is skipped unless forced', async () => {
  const first = harness([ann, bob], ['a']);
  const out = await first.service.send({ kind: 'APP', customerIds: ['a', 'b'], triggeredBy: 's' });
  assert.deepEqual(out.results.map((r) => [r.customerId, r.outcome]), [['a', 'SKIPPED'], ['b', 'SENT']]);
  assert.equal(first.calls.length, 1);

  const forced = harness([ann, bob], ['a']);
  const again = await forced.service.send({ kind: 'APP', customerIds: ['a', 'b'], force: true, triggeredBy: 's' });
  assert.equal(again.sent, 2);
});

test('a duplicate id in one request is sent once', async () => {
  const { service, calls } = harness([ann]);
  await service.send({ kind: 'APP', customerIds: ['a', 'a'], triggeredBy: 's' });
  assert.equal(calls.length, 1);
});

test('a failed send is recorded and reported, not thrown', async () => {
  const bad: Row = { id: 'z', firstName: 'Zed', lastName: 'Q', phone: '0799999999', isActive: true };
  const { service, created } = harness([bad]);
  const out = await service.send({ kind: 'APP', customerIds: ['z'], triggeredBy: 's' });
  assert.equal(out.failed, 1);
  assert.equal(created[0].status, 'FAILED');
  assert.equal(created[0].error, 'Recipient not on WhatsApp');
});

test('inactive customers, unknown ids and unusable numbers are skipped without a send', async () => {
  const gone: Row = { ...bob, id: 'g', isActive: false };
  const nophone: Row = { ...bob, id: 'n', phone: '12' };
  const { service, calls } = harness([gone, nophone]);
  const out = await service.send({ kind: 'APP', customerIds: ['g', 'n', 'missing'], triggeredBy: 's' });
  assert.equal(out.skipped, 3);
  assert.equal(calls.length, 0);
});

test('a message with no link is refused before anything is sent', async () => {
  const { service, calls } = harness([ann], [], { community: {} });
  await assert.rejects(() => service.send({ kind: 'REVIEW', customerIds: ['a'], triggeredBy: 's' }), /no link/i);
  assert.equal(calls.length, 0);
  // The app link has a built-in default, so it never lacks one.
  const ok = await harness([ann], [], null).service.send({ kind: 'APP', customerIds: ['a'], triggeredBy: 's' });
  assert.equal(ok.sent, 1);
});

test('status says which links are ready', async () => {
  const { service } = harness([], [], { community: { whatsappGroupUrl: 'https://chat.whatsapp.com/g' } });
  const status = await service.status();
  // The three fixed-text templates carry their own link or number, so they never wait on site content.
  assert.deepEqual(status.kinds.map((k) => [k.kind, k.linkReady]), [['APP', true], ['GROUP', true], ['REVIEW', false], ['GOOGLE_REVIEW', true], ['SHOE_RANGE', true], ['LOCATION', true]]);
});

test('a fixed-text template is sent with no variables, needs no link, and is recorded and de-duplicated like the others', async () => {
  const { service, calls, created } = harness([ann, bob], [], { community: {} });
  const out = await service.send({ kind: 'LOCATION', customerIds: ['a', 'b'], triggeredBy: 's' });
  assert.equal(out.sent, 2);
  assert.deepEqual(calls.map((c) => [c.template, c.params]), [['shop_location', []], ['shop_location', []]]);
  assert.deepEqual(created.map((c) => [c.kind, c.template]), [['LOCATION', 'shop_location'], ['LOCATION', 'shop_location']]);
  for (const kind of ['GOOGLE_REVIEW', 'SHOE_RANGE'] as const) {
    const again = await harness([ann], [], { community: {} }).service.send({ kind, customerIds: ['a'], triggeredBy: 's' });
    assert.equal(again.sent, 1);
  }
  // Already sent: skipped unless forced.
  assert.equal((await harness([ann], ['a'], { community: {} }).service.send({ kind: 'LOCATION', customerIds: ['a'], triggeredBy: 's' })).skipped, 1);
});

/** The Mautic webhook, with the service stood in by a fake that returns whatever the test wants. */
function hookHarness(outcome: 'SENT' | 'SKIPPED' | 'FAILED', detail?: string) {
  const calls: any[] = [];
  const service: any = { sendForContact: async (p: any) => { calls.push(p); return { customerId: 'x', name: 'n', phone: null, outcome, detail }; } };
  return { controller: new WhatsAppOutreachController(service), calls };
}

test('the webhook is off until a secret is configured', async () => {
  delete process.env.OUTREACH_HOOK_SECRET;
  const { controller, calls } = hookHarness('SENT');
  await assert.rejects(() => controller.hook({ kind: 'APP', email: 'a@b.co' }, 'anything'), /not enabled/);
  assert.equal(calls.length, 0);
});

test('the webhook refuses a missing or wrong secret and sends nothing', async () => {
  process.env.OUTREACH_HOOK_SECRET = 's3cret-value';
  const { controller, calls } = hookHarness('SENT');
  await assert.rejects(() => controller.hook({ kind: 'APP', email: 'a@b.co' }, undefined), /Unauthorized/);
  await assert.rejects(() => controller.hook({ kind: 'APP', email: 'a@b.co' }, 's3cret-valuX'), /Unauthorized/);
  await assert.rejects(() => controller.hook({ kind: 'APP', email: 'a@b.co' }, 's3cret'), /Unauthorized/);
  assert.equal(calls.length, 0);
});

test('the webhook sends for a correct secret and passes the message and email through', async () => {
  process.env.OUTREACH_HOOK_SECRET = 's3cret-value';
  const { controller, calls } = hookHarness('SENT');
  assert.deepEqual(await controller.hook({ kind: 'GROUP', email: 'a@b.co' }, 's3cret-value'), { outcome: 'SENT', detail: undefined });
  assert.deepEqual(calls, [{ kind: 'GROUP', email: 'a@b.co' }]);
});

test('a skip answers normally but a failed send answers an error so Mautic retries', async () => {
  process.env.OUTREACH_HOOK_SECRET = 's3cret-value';
  const skipped = hookHarness('SKIPPED', 'Already sent');
  assert.deepEqual(await skipped.controller.hook({ kind: 'APP', email: 'a@b.co' }, 's3cret-value'), { outcome: 'SKIPPED', detail: 'Already sent' });
  const failed = hookHarness('FAILED', 'Template not approved');
  await assert.rejects(() => failed.controller.hook({ kind: 'APP', email: 'a@b.co' }, 's3cret-value'), /Template not approved/);
  delete process.env.OUTREACH_HOOK_SECRET;
});

test('a contact who is not a customer is skipped without a send', async () => {
  const { service, calls } = harness([ann]);
  (service as any).prisma.customer.findFirst = async ({ where }: any) => (where.email.equals === 'ann@x.co' ? { id: 'a' } : null);
  const stranger = await service.sendForContact({ kind: 'APP', email: 'nobody@x.co' });
  assert.deepEqual([stranger.outcome, stranger.detail], ['SKIPPED', 'Not a customer']);
  assert.equal(calls.length, 0);
  const known = await service.sendForContact({ kind: 'APP', email: ' ann@x.co ' });
  assert.equal(known.outcome, 'SENT');
  assert.equal(calls.length, 1);
});
