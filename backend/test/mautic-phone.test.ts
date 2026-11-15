import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

// MauticService reads its settings when it is made, so they are set before it is imported.
process.env.MAUTIC_BASE_URL = 'https://mautic.test';
process.env.MAUTIC_CLIENT_ID = 'id';
process.env.MAUTIC_CLIENT_SECRET = 'secret';
process.env.MAUTIC_CAMPAIGN_ID = '7';
process.env.MAUTIC_WHATSAPP_CAMPAIGN_ID = '8';

import { MauticService, PHONE_ONLY_TAG } from '../src/mautic/mautic.service';

/** A small Mautic: contacts with an email/mobile/names/tags, search by mobile, edit, create-or-update by email (as the real one merges on email), campaigns. */
type Contact = { id: number; email: string | null; mobile: string | null; firstname: string; lastname: string; tags: Set<string> };
function fakeMautic(opts: { down?: boolean } = {}) {
  const contacts: Contact[] = [];
  const enrolled: Array<[string, number]> = [];
  const calls: string[] = [];
  let next = 100;
  const shape = (c: Contact) => ({ id: c.id, fields: { core: { email: { value: c.email ?? '' }, mobile: { value: c.mobile ?? '' }, firstname: { value: c.firstname }, lastname: { value: c.lastname } } } });
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const applyTags = (c: Contact, tags?: string[]) => { for (const t of tags ?? []) t.startsWith('-') ? c.tags.delete(t.slice(1)) : c.tags.add(t); };

  const handler = async (url: any, init: any) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    const body = init?.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : null;
    calls.push(`${method} ${u.pathname}${u.search ? '?search' : ''}`);
    if (u.pathname === '/oauth/v2/token') return json(200, { access_token: 't', expires_in: 3600 });
    if (opts.down) return json(500, { error: 'down' });

    if (u.pathname === '/api/contacts' && method === 'GET') {
      const mobile = (u.searchParams.get('search') ?? '').replace(/^mobile:/, '');
      const hit = contacts.find((c) => c.mobile === mobile);
      return json(200, { contacts: hit ? { [hit.id]: shape(hit) } : {} });
    }
    if (u.pathname === '/api/contacts/new' && method === 'POST') {
      // Mautic's own create-or-update: an address already on a contact updates that contact.
      const byEmail = body.email ? contacts.find((c) => c.email === body.email) : undefined;
      const c = byEmail ?? (() => { const made: Contact = { id: next++, email: null, mobile: null, firstname: '', lastname: '', tags: new Set() }; contacts.push(made); return made; })();
      if (body.email) c.email = body.email;
      if (body.mobile) c.mobile = body.mobile;
      if (body.firstname) c.firstname = body.firstname;
      if (body.lastname) c.lastname = body.lastname;
      applyTags(c, body.tags);
      return json(201, { contact: shape(c) });
    }
    const edit = u.pathname.match(/^\/api\/contacts\/(\d+)\/edit$/);
    if (edit && method === 'PATCH') {
      const c = contacts.find((x) => x.id === Number(edit[1]));
      if (!c) return json(404, { errors: [{ code: 404 }] });
      // Mautic refuses to give one contact an address that is already another's.
      if (body.email && contacts.some((o) => o.id !== c.id && o.email === body.email)) return json(400, { errors: [{ message: 'email: already in use' }] });
      if (body.email) c.email = body.email;
      if (body.firstname) c.firstname = body.firstname;
      if (body.lastname) c.lastname = body.lastname;
      applyTags(c, body.tags);
      return json(200, { contact: shape(c) });
    }
    const camp = u.pathname.match(/^\/api\/campaigns\/(\d+)\/contact\/(\d+)\/add$/);
    if (camp) { enrolled.push([camp[1], Number(camp[2])]); return json(200, { success: 1 }); }
    return json(404, {});
  };
  return { contacts, enrolled, calls, handler };
}

const realFetch = global.fetch;
let mautic: ReturnType<typeof fakeMautic>;
const install = (opts?: { down?: boolean }) => { mautic = fakeMautic(opts); global.fetch = (async (u: any, i: any) => mautic.handler(u, i)) as any; };
beforeEach(() => install());
afterEach(() => { global.fetch = realFetch; });

const person = { firstName: 'Wanjiku', lastName: 'Kamau', phone: '0722123456' };

test('a customer with only a phone number becomes a Mautic contact keyed by their mobile, tagged phone-only, and is not put on the email campaign', async () => {
  const out = await new MauticService().syncContact({ ...person });
  assert.equal(out.ok, true);
  assert.equal(mautic.contacts.length, 1);
  const c = mautic.contacts[0];
  assert.deepEqual([c.email, c.mobile, c.firstname, c.lastname], [null, '+254722123456', 'Wanjiku', 'Kamau']);
  assert.deepEqual([...c.tags].sort(), ['dripemporium-store', PHONE_ONLY_TAG]);
  assert.deepEqual(mautic.enrolled, [], 'an e-commerce campaign sends email: there is none to send to');
});

test('the same number again is the same contact, however it was typed', async () => {
  const mautic1 = new MauticService();
  const first = await mautic1.syncContact({ ...person });
  const second = await mautic1.syncContact({ ...person, phone: '+254 722 123 456' });
  assert.equal(mautic.contacts.length, 1);
  assert.equal(first.ok && second.ok && first.id === second.id, true);
});

test('when the email turns up, that same contact gains it, loses the phone-only tag and joins the campaign: one person, not two', async () => {
  const svc = new MauticService();
  const before = await svc.syncContact({ ...person });
  const out = await svc.syncContact({ ...person, email: 'Wanjiku@Example.com' });
  assert.equal(out.ok && out.via, 'upgraded');
  assert.equal(out.ok && before.ok && out.id === (before as any).id, true);
  assert.equal(mautic.contacts.length, 1);
  const c = mautic.contacts[0];
  assert.equal(c.email, 'wanjiku@example.com');
  assert.equal(c.tags.has(PHONE_ONLY_TAG), false);
  assert.equal(c.tags.has('dripemporium-store'), true);
  assert.deepEqual(mautic.enrolled, [['7', c.id]], 'enrolled once, on the e-commerce campaign only (an existing customer is not started on the WhatsApp sequence)');
});

test('a contact that already has a name keeps it when the address arrives', async () => {
  mautic.contacts.push({ id: 5, email: null, mobile: '+254722123456', firstname: 'Wanjiru', lastname: 'K', tags: new Set(['whatsapp-contact']) });
  const out = await new MauticService().syncContact({ ...person, email: 'w@example.com' });
  assert.equal(out.ok, true);
  assert.deepEqual([mautic.contacts[0].firstname, mautic.contacts[0].lastname, mautic.contacts[0].email], ['Wanjiru', 'K', 'w@example.com']);
  assert.equal(mautic.contacts[0].tags.has('whatsapp-contact'), true, "the WhatsApp sync's own tags are left alone");
});

test('a person who is already in Mautic from a WhatsApp chat is reused for a phone-only order, not duplicated', async () => {
  mautic.contacts.push({ id: 5, email: null, mobile: '+254722123456', firstname: 'Wanjiru', lastname: '', tags: new Set(['whatsapp-contact']) });
  await new MauticService().syncContact({ ...person });
  assert.equal(mautic.contacts.length, 1);
  assert.equal(mautic.contacts[0].tags.has(PHONE_ONLY_TAG), true);
  assert.equal(mautic.contacts[0].tags.has('whatsapp-contact'), true);
});

test('an address Mautic already holds on another contact is merged into by Mautic itself; the phone-only contact is left as it was', async () => {
  const svc = new MauticService();
  mautic.contacts.push({ id: 9, email: 'w@example.com', mobile: null, firstname: 'W', lastname: '', tags: new Set() });
  await svc.syncContact({ ...person }); // makes the phone-only contact (id 100)
  const out = await svc.syncContact({ ...person, email: 'w@example.com' });
  assert.equal(out.ok && out.id, 9, 'the contact that holds the address wins');
  assert.equal(mautic.contacts.find((c) => c.id === 9)!.mobile, '+254722123456');
  assert.equal(mautic.contacts.find((c) => c.id === 100)!.email, null);
});

test('an email with no phone is created or updated by email, as before', async () => {
  const out = await new MauticService().syncContact({ email: 'a@b.co', firstName: 'A', lastName: 'B' });
  assert.equal(out.ok && out.via, 'email');
  assert.equal(mautic.contacts[0].email, 'a@b.co');
  assert.equal(mautic.contacts[0].mobile, null);
});

test('a stand-in address is no address: the customer is synced by phone, and nothing with .invalid in it reaches Mautic', async () => {
  const out = await new MauticService().syncContact({ ...person, email: '254722123456@customer.invalid' });
  assert.equal(out.ok && out.via, 'phone');
  assert.equal(mautic.contacts.every((c) => !(c.email ?? '').includes('invalid')), true);
});

test('with no email and no usable phone there is nothing to sync, and nothing is sent', async () => {
  const out = await new MauticService().syncContact({ firstName: 'X', phone: 'abc' });
  assert.deepEqual(out, { ok: false, error: 'No email and no valid phone number' });
  assert.equal(mautic.contacts.length, 0);
});

test('a Mautic outage is reported, never thrown, and nothing is half-made', async () => {
  install({ down: true });
  const svc = new MauticService();
  assert.equal((await svc.syncContact({ ...person })).ok, false);
  assert.equal((await svc.syncContact({ ...person, email: 'a@b.co' })).ok, false);
  assert.equal(mautic.contacts.length, 0);
});

test('abandoned carts are synced only with an address: a phone-only lead is left to staff', async () => {
  const svc = new MauticService();
  await svc.syncCartLead({ name: 'W K', phone: '0722123456' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(mautic.contacts.length, 0);
});
