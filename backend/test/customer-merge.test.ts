import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { DupCustomer, adoptFrom, cautionFor, groupDuplicates, namesAgree, phoneKey, pickKeep } from '../src/customer/customer-duplicates.rules';
import { CustomerMergeService } from '../src/customer/customer-merge.service';

// --- the rules (no database) -------------------------------------------------------------------------------------------------

let seq = 0;
const person = (over: Partial<DupCustomer> = {}): DupCustomer => {
  seq += 1;
  return {
    id: `c${String(seq).padStart(3, '0')}`, firstName: 'Wanjiku', lastName: 'Kamau', email: `wanjiku${seq}@example.com`, phone: '0722123456', isActive: true, priceTier: 'RETAIL',
    referralCode: null, portalEnabled: false, hasPassword: false, createdAt: new Date(2026, 0, seq), orders: 0, lastOrderAt: null, ...over,
  };
};
const standIn = (phone: string, over: Partial<DupCustomer> = {}) => person({ email: `${phone.replace(/\D/g, '').replace(/^0/, '254')}@customer.invalid`, phone, ...over });

test('a phone number is its last nine digits, however it was typed, and a short one is no evidence', () => {
  for (const p of ['0722123456', '+254722123456', '254 722 123 456', '722123456', '(0722) 123-456']) assert.equal(phoneKey(p), '722123456', p);
  for (const p of ['', null, undefined, '12345', '0722 12']) assert.equal(phoneKey(p as any), null, String(p));
});

test('someone who checked out with a phone alone and later signed up with an email is one safe group, keeping the real account', () => {
  const account = person({ email: 'wanjiku@example.com', phone: '+254722123456', hasPassword: true, portalEnabled: true, orders: 1 });
  const phoneOnly = standIn('0722123456', { orders: 3 });
  const [group, ...rest] = groupDuplicates([phoneOnly, account, person({ phone: '0733000111' })]);
  assert.equal(rest.length, 0);
  assert.equal(group.keepId, account.id, 'the real email wins over more orders');
  assert.deepEqual(group.members.map((m) => m.id), [account.id, phoneOnly.id]);
  assert.equal(group.safe, true);
  assert.equal(group.caution, null);
  assert.match(group.reason, /Same phone number/);
});

test('two different real emails on one number are not safe: they may be two people who share a phone', () => {
  const a = person({ email: 'a@example.com', firstName: 'Wanjiku' });
  const b = person({ email: 'b@example.com', firstName: 'Wanjiku' });
  const [group] = groupDuplicates([a, b]);
  assert.equal(group.safe, false);
  assert.match(group.caution ?? '', /different email addresses/);
});

test('different names on the same number are not safe, but a stand-in name or a short form of a name is', () => {
  const real = person({ firstName: 'Wanjiku', lastName: 'Kamau', email: 'w@example.com' });
  assert.equal(groupDuplicates([real, standIn('0722123456', { firstName: 'Brian', lastName: 'Otieno' })])[0].safe, false);
  for (const generic of ['Walk-in', 'walkin', 'Guest', 'Customer', '']) {
    assert.equal(groupDuplicates([real, standIn('0722123456', { firstName: generic, lastName: '' })])[0].safe, true, generic);
  }
  assert.equal(namesAgree(person({ firstName: 'Wanjiku' }), person({ firstName: 'wanj' })), true);
  assert.equal(namesAgree(person({ firstName: 'Wanjiku' }), person({ firstName: 'Brian' })), false);
});

test('the same email in two cases is one person, even on different numbers; and links chain into one group', () => {
  const a = person({ email: 'Mary@Example.com', phone: '0711000001', firstName: 'Mary' });
  const b = person({ email: 'mary@example.com', phone: '0711000002', firstName: 'Mary' });
  const c = standIn('0711000002', { firstName: 'Mary' });
  const groups = groupDuplicates([a, b, c, person({ phone: '0799999999' })]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].members.length, 3);
  assert.equal(groups[0].safe, true);
});

test('trade accounts, referrers, inactive customers and unusable numbers are never grouped', () => {
  const shopper = person({ phone: '0722123456' });
  const groups = groupDuplicates([
    shopper,
    person({ phone: '0722123456', priceTier: 'RESELLER' }),
    person({ phone: '0722123456', priceTier: 'WHOLESALE' }),
    person({ phone: '0722123456', referralCode: 'kZ3F9pQd' }),
    person({ phone: '0722123456', isActive: false }),
    person({ phone: '123' }), person({ phone: '123' }),
  ]);
  assert.deepEqual(groups, []);
});

test('the record to keep is the one with a real email, then a working sign-in, then the most orders, then the oldest', () => {
  const real = person({ email: 'r@example.com' });
  const loginOnly = person({ email: 's@example.com', hasPassword: true, portalEnabled: true });
  const busy = person({ email: 't@example.com', orders: 9 });
  const old = person({ email: 'u@example.com', createdAt: new Date(2020, 0, 1) });
  assert.equal(pickKeep([standIn('0722123456', { orders: 50 }), real]).id, real.id);
  assert.equal(pickKeep([real, loginOnly]).id, loginOnly.id);
  assert.equal(pickKeep([real, busy, loginOnly]).id, loginOnly.id);
  assert.equal(pickKeep([real, busy]).id, busy.id);
  assert.equal(pickKeep([real, old]).id, old.id);
  assert.equal(pickKeep([busy, loginOnly, real, old]).id, pickKeep([old, real, loginOnly, busy]).id, 'the same group always picks the same one');
  assert.equal(cautionFor(real, standIn('0722123456')), null);
});

test('the kept record only fills its gaps: a phone-only record kept over a real account takes the email and sign-in, and nothing is overwritten', () => {
  const keep = { ...standIn('0722123456', { firstName: 'Walk-in', lastName: '' }), location: null, notes: 'VIP' };
  const account = { ...person({ email: 'W@Example.com', hasPassword: true, portalEnabled: true }), location: 'Nairobi', notes: 'Prefers size 42' };
  const out = adoptFrom(keep, [account]);
  assert.deepEqual(out, { email: 'w@example.com', firstName: 'Wanjiku', lastName: 'Kamau', location: 'Nairobi', notes: 'VIP\nPrefers size 42', takePortalFrom: account.id });

  // The usual case: the real account is kept and the phone-only record has nothing to give.
  assert.deepEqual(adoptFrom({ ...account }, [{ ...standIn('0722123456'), location: null, notes: null }]), {});
  // Nothing already there is replaced.
  assert.deepEqual(adoptFrom({ ...account, hasPassword: true }, [{ ...person({ email: 'x@example.com', hasPassword: true }), location: 'Mombasa', notes: 'Prefers size 42' }]), {});
});

// --- the merge, against a real database (KITS_TEST_DATABASE_URL, a scratch database) -----------------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = (name: string, fn: () => Promise<void>) => test(name, { skip: url ? false : 'KITS_TEST_DATABASE_URL is not set' }, fn);

async function harness() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tag = `cm${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const phone = `07${String(Math.abs([...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 13)) % 100000000).padStart(8, '0')}`;
  const intl = `254${phone.slice(1)}`;
  const mauticCalls: any[] = [];
  const mautic = { syncContact: async (p: any) => { mauticCalls.push(p); return { ok: true }; } } as any;
  const service = new CustomerMergeService(prisma as any, mautic);

  const category = await prisma.productCategory.upsert({ where: { slug: 'cmtest-shoes' }, update: {}, create: { name: 'CMTest Shoes', slug: 'cmtest-shoes' } });
  const product = await prisma.product.create({ data: { sku: `CM-${tag}`, name: `CM Runner ${tag}`, slug: `cm-${tag}`, brand: 'Nike', categoryId: category.id, imageUrls: [], variants: { create: [{ sku: `CM-${tag}-42`, name: 'EUR 42', attributes: { size: 'EUR 42' }, priceKes: 5000 }] } }, include: { variants: true } });
  const product2 = await prisma.product.create({ data: { sku: `CM2-${tag}`, name: `CM Boot ${tag}`, slug: `cm2-${tag}`, brand: 'Nike', categoryId: category.id, imageUrls: [] } });
  await prisma.store.upsert({ where: { code: 'CMTEST' }, update: {}, create: { code: 'CMTEST', name: 'CMTest Store' } });
  const store = await prisma.store.findUniqueOrThrow({ where: { code: 'CMTEST' } });

  const customer = (suffix: string, over: Record<string, unknown> = {}) =>
    prisma.customer.create({ data: { firstName: 'Wanjiku', lastName: 'Kamau', email: `${suffix}.${tag}@example.com`, phone, ...over } });
  let n = 0;
  const order = (customerId: string) => prisma.order.create({ data: { orderNumber: `CM-${tag}-${++n}`, storeId: store.id, customerId, customerPhone: phone, lines: { create: [{ variantId: product.variants[0].id, description: 'x', quantity: 1, unitPrice: 5000, listPrice: 5000, lineTotal: 5000 }] } } });
  const cleanup = async () => {
    const customers = await prisma.customer.findMany({ where: { OR: [{ email: { contains: `.${tag}@` } }, { email: { startsWith: intl } }, { phone }] }, select: { id: true } });
    const ids = customers.map((c) => c.id);
    await prisma.orderLine.deleteMany({ where: { order: { orderNumber: { startsWith: `CM-${tag}` } } } });
    await prisma.order.deleteMany({ where: { orderNumber: { startsWith: `CM-${tag}` } } });
    await prisma.referralClick.deleteMany({ where: { resellerId: { in: ids } } });
    await prisma.cartLead.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.whatsappOutreach.deleteMany({ where: { phone: intl } });
    // A merge record outlives the customers it names, so find the ones from this run by what the removed customer's address contained.
    await prisma.customerMerge.deleteMany({ where: { OR: [{ keptCustomerId: { in: ids } }, { mergedCustomerId: { in: ids } }, { mergedSnapshot: { path: ['email'], string_contains: tag } }, { mergedSnapshot: { path: ['email'], string_starts_with: intl } }] } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    await prisma.productVariant.deleteMany({ where: { productId: product.id } });
    await prisma.product.deleteMany({ where: { id: { in: [product.id, product2.id] } } });
    await prisma.$disconnect();
  };
  return { prisma, service, tag, phone, intl, mauticCalls, product, product2, customer, order, cleanup };
}

db('a phone-only record is merged into the real account: everything it owned moves, it is removed, and a record of it is kept', async () => {
  const h = await harness();
  try {
    const account = await h.customer('wanjiku', { portalPassword: 'hash-A', portalEnabled: true });
    const phoneOnly = await h.customer('x', { email: `${h.intl}@customer.invalid`, firstName: 'Walk-in', lastName: '', notes: 'Pays cash', portalPassword: 'secret-hash-B', resetTokenHash: 'reset-hash' });
    await h.order(account.id); await h.order(phoneOnly.id); await h.order(phoneOnly.id);
    await h.prisma.cartLead.create({ data: { source: 'ABANDONED_CART', customerId: phoneOnly.id, lines: [], subtotal: 0, total: 0 } as any });
    await h.prisma.whatsappOutreach.create({ data: { customerId: phoneOnly.id, phone: h.intl, kind: 'APP', template: 'drip_app_download', status: 'SENT', triggeredBy: 'test' } });
    await h.prisma.favorite.create({ data: { customerId: account.id, productId: h.product.id } });
    await h.prisma.favorite.create({ data: { customerId: phoneOnly.id, productId: h.product.id } }); // one they both have
    await h.prisma.favorite.create({ data: { customerId: phoneOnly.id, productId: h.product2.id } }); // one only the duplicate has
    await h.prisma.customerDocument.create({ data: { customerId: phoneOnly.id, documentType: 'NATIONAL_ID', fileName: 'id.pdf', objectKey: 'k', url: 'u' } });

    const groups = (await h.service.groups()).groups.filter((g) => g.members.some((m) => m.id === account.id));
    assert.equal(groups.length, 1);
    assert.equal(groups[0].keepId, account.id);
    assert.equal(groups[0].safe, true);

    const preview = await h.service.preview(account.id, [phoneOnly.id]);
    assert.equal(preview.ordersMoved, 2);
    assert.equal(await h.prisma.customer.count({ where: { id: phoneOnly.id } }), 1, 'a preview changes nothing');

    const out = await h.service.merge(account.id, [phoneOnly.id], 'staff@test');
    assert.equal(out.merged, 1);
    assert.deepEqual(
      [out.moved.orders, out.moved.cartLeads, out.moved.whatsappMessages, out.moved.documents, out.moved.favorites, out.moved.favoritesAlreadyHad],
      [2, 1, 1, 1, 1, 1],
    );

    assert.equal(await h.prisma.customer.count({ where: { id: phoneOnly.id } }), 0);
    assert.equal(await h.prisma.order.count({ where: { customerId: account.id } }), 3);
    assert.equal(await h.prisma.cartLead.count({ where: { customerId: account.id } }), 1);
    assert.equal(await h.prisma.whatsappOutreach.count({ where: { customerId: account.id } }), 1);
    assert.equal(await h.prisma.customerDocument.count({ where: { customerId: account.id } }), 1);
    assert.equal(await h.prisma.favorite.count({ where: { customerId: account.id } }), 2);

    // The kept account is untouched: its own email and sign-in survive, and it takes nothing it already has.
    const kept = await h.prisma.customer.findUniqueOrThrow({ where: { id: account.id } });
    assert.deepEqual([kept.email, kept.portalPassword, kept.firstName], [account.email, 'hash-A', 'Wanjiku']);
    assert.match(kept.notes ?? '', /Pays cash/, 'notes are kept, not lost');

    // What was removed is on record, without its credentials.
    const record = await h.prisma.customerMerge.findFirstOrThrow({ where: { mergedCustomerId: phoneOnly.id } });
    assert.deepEqual([record.keptCustomerId, record.mergedBy], [account.id, 'staff@test']);
    const snapshot = record.mergedSnapshot as any;
    assert.deepEqual([snapshot.email, snapshot.firstName, snapshot.hadPortalPassword], [`${h.intl}@customer.invalid`, 'Walk-in', true]);
    assert.ok(!('portalPassword' in snapshot) && !('resetTokenHash' in snapshot), 'no credentials in the record');
    assert.equal(JSON.stringify(snapshot).includes('secret-hash-B'), false);

    // The group is gone, and Mautic was told about the kept customer.
    assert.equal((await h.service.groups()).groups.filter((g) => g.members.some((m) => m.id === account.id)).length, 0);
    assert.equal(h.mauticCalls.length, 1);
    assert.equal(h.mauticCalls[0].email, account.email);
  } finally { await h.cleanup(); }
});

db('keeping the phone-only record over the account: it takes the real email and the sign-in, and the account\'s email becomes free to take', async () => {
  const h = await harness();
  try {
    const account = await h.customer('wanjiku', { portalPassword: 'hash-A', portalEnabled: true, location: 'Westlands' });
    const phoneOnly = await h.customer('x', { email: `${h.intl}@customer.invalid`, firstName: 'Walk-in', lastName: '' });
    const out = await h.service.merge(phoneOnly.id, [account.id], 'staff@test');
    assert.deepEqual(out.adopted.sort(), ['email', 'firstName', 'lastName', 'location', 'takePortalFrom'].sort());
    const kept = await h.prisma.customer.findUniqueOrThrow({ where: { id: phoneOnly.id } });
    assert.deepEqual([kept.email, kept.firstName, kept.lastName, kept.location, kept.portalPassword, kept.portalEnabled], [account.email, 'Wanjiku', 'Kamau', 'Westlands', 'hash-A', true]);
    assert.equal(await h.prisma.customer.count({ where: { email: account.email } }), 1);
  } finally { await h.cleanup(); }
});

db('a merge that cannot go ahead is refused and changes nothing; and one that fails part way leaves nothing half done', async () => {
  const h = await harness();
  try {
    const a = await h.customer('a');
    const trade = await h.customer('trade', { priceTier: 'RESELLER' });
    const withCommission = await h.customer('clicks');
    await h.order(a.id);
    await assert.rejects(() => h.service.merge(a.id, [a.id], 't'), BadRequestException);
    await assert.rejects(() => h.service.merge(a.id, [], 't'), BadRequestException);
    await assert.rejects(() => h.service.merge(a.id, ['no-such-customer'], 't'), BadRequestException);
    await assert.rejects(() => h.service.merge(a.id, [trade.id], 't'), /not an active retail customer/, 'a reseller is never merged here');
    await assert.rejects(() => h.service.merge(trade.id, [a.id], 't'), BadRequestException, 'and nothing is merged into one');

    await h.prisma.referralClick.create({ data: { resellerId: withCommission.id } });
    await assert.rejects(() => h.service.merge(a.id, [withCommission.id], 't'), /reseller activity/);

    // Break the middle of a merge: a dangling reference makes the transaction fail after the first moves. Nothing may be left half moved.
    const b = await h.customer('b');
    await h.order(b.id);
    const failing = Object.create(h.prisma, {
      $transaction: { value: (fn: any, opts: any) => h.prisma.$transaction((tx: any) => fn(new Proxy(tx, { get: (t, k) => (k === 'customerMerge' ? { create: async () => { throw new Error('disk full'); } } : t[k]) })), opts) },
    });
    const broken = new CustomerMergeService(failing, {} as any);
    await assert.rejects(() => broken.merge(a.id, [b.id], 't'), /disk full/);
    assert.equal(await h.prisma.customer.count({ where: { id: b.id } }), 1);
    assert.equal(await h.prisma.order.count({ where: { customerId: b.id } }), 1, 'the order did not move');
    assert.equal(await h.prisma.customerMerge.count({ where: { mergedCustomerId: b.id } }), 0);
  } finally { await h.cleanup(); }
});

db('"merge all safe" merges what was shown, leaves the ones needing a look, and skips a group that changed since', async () => {
  const h = await harness();
  try {
    const safeKeep = await h.customer('safe');
    const safeDup = await h.customer('safedup', { email: `${h.intl}@customer.invalid` });
    // A second group that needs a look: two different people's emails on one number.
    const p2 = `07${String(Math.abs([...h.tag].reduce((x, c) => (x * 17 + c.charCodeAt(0)) | 0, 5)) % 100000000).padStart(8, '0')}`;
    const x = await h.prisma.customer.create({ data: { firstName: 'Amina', lastName: 'Ali', email: `x.${h.tag}@example.com`, phone: p2 } });
    const y = await h.prisma.customer.create({ data: { firstName: 'Amina', lastName: 'Ali', email: `y.${h.tag}@example.com`, phone: p2 } });

    const seen = (await h.service.groups()).groups.filter((g) => g.members.some((m) => [safeKeep.id, safeDup.id, x.id, y.id].includes(m.id)));
    assert.equal(seen.length, 2);
    const safeGroup = seen.find((g) => g.safe)!;
    const reviewGroup = seen.find((g) => !g.safe)!;
    assert.equal(safeGroup.keepId, safeKeep.id);

    // Asked to merge both, only the safe one is merged; the other is reported, not touched.
    const done = await h.service.mergeSafe([safeGroup.keepId, reviewGroup.keepId, 'gone'], 'staff@test');
    assert.equal(done.groupsMerged, 1);
    assert.equal(done.customersMerged, 1);
    assert.deepEqual(done.skipped.map((s) => s.keepId).sort(), [reviewGroup.keepId, 'gone'].sort());
    assert.equal(await h.prisma.customer.count({ where: { id: safeDup.id } }), 0);
    assert.equal(await h.prisma.customer.count({ where: { id: { in: [x.id, y.id] } } }), 2);

    // Staff can still merge the one that needed a look, by choosing it themselves.
    await h.service.merge(reviewGroup.keepId, reviewGroup.members.filter((m) => m.id !== reviewGroup.keepId).map((m) => m.id), 'staff@test');
    assert.equal(await h.prisma.customer.count({ where: { id: { in: [x.id, y.id] } } }), 1);
    await h.prisma.customer.deleteMany({ where: { id: { in: [x.id, y.id] } } });
  } finally { await h.cleanup(); }
});
