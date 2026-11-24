import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CustomerService } from '../src/customer/customer.service';

/**
 * The till's customer box and customer creation, against a real scratch database (KITS_TEST_DATABASE_URL).
 */
const url = process.env.KITS_TEST_DATABASE_URL;
const db = url ? test : test.skip;
const TAG = 'lookup-test';
const PHONE = '25479920'; // 0799 20xxx

async function world() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  const cleanup = async () => {
    await prisma.order.deleteMany({ where: { customer: { email: { startsWith: `${TAG}-` } } } });
    await prisma.customer.deleteMany({ where: { OR: [{ email: { startsWith: `${TAG}-` } }, { email: { startsWith: `${PHONE}` } }] } });
    await prisma.store.deleteMany({ where: { code: 'LOOKUP-TEST' } });
  };
  await cleanup();
  const synced: unknown[] = [];
  const service = new CustomerService(prisma as any, { syncContact: async (c: unknown) => { synced.push(c); } } as any);
  const person = (n: number, over: Record<string, unknown> = {}) => prisma.customer.create({
    data: { firstName: 'Test', lastName: `Person${n}`, email: `${TAG}-${n}@example.test`, phone: `+${PHONE}${String(n).padStart(3, '0')}`, ...over } as any,
  });
  return { prisma, service, person, cleanup, synced };
}

db('one box finds a customer by name, by mobile number in any format, by email, or by a mix', async () => {
  const w = await world();
  try {
    const wanjiku = await w.person(1, { firstName: 'Wanjiku', lastName: 'Kamau', phone: '0799 201 001', businessName: 'Wanjiku Shoes Ltd' });
    await w.person(2, { firstName: 'Brian', lastName: 'Otieno', phone: '+254799201002' });
    const ids = async (q: string) => (await w.service.lookup(q)).map((c) => c.id);

    // Names, in any order, and the business.
    assert.deepEqual(await ids('wanj'), [wanjiku.id]);
    assert.deepEqual(await ids('kamau wanjiku'), [wanjiku.id]);
    assert.deepEqual(await ids('shoes ltd'), [wanjiku.id]);
    // The same number however it is typed, even though it is stored as 0799 201 001.
    for (const typed of ['0799201001', '0799 201 001', '+254 799 201 001', '254799201001', '799201001', '0799201']) assert.ok((await ids(typed)).includes(wanjiku.id), typed);
    // The other customer's number, stored as +254..., is found by the local form too.
    assert.equal((await w.service.lookup('0799201002'))[0].firstName, 'Brian');
    // Email, whole or partial.
    assert.deepEqual(await ids(`${TAG}-1@example.test`), [wanjiku.id]);
    assert.deepEqual(await ids(`${TAG}-1@`), [wanjiku.id]);
    // A mix narrows: a name that matches one of two numbers' owners.
    assert.deepEqual(await ids('wanjiku 0799201'), [wanjiku.id]);
    assert.deepEqual(await ids('brian 0799201001'), []);
    // Nothing is matched by one letter or two digits.
    assert.deepEqual(await ids('w'), []);
    assert.deepEqual(await ids('07'), []);
    assert.deepEqual(await ids(''), []);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('what is typed is searched for, not obeyed, and inactive customers and stand-in addresses stay out', async () => {
  const w = await world();
  try {
    await w.person(3, { firstName: 'Percent', lastName: '50%off' });
    await w.person(4, { firstName: 'Other', lastName: 'Person4' });
    const inactive = await w.person(5, { firstName: 'Dormant', lastName: 'Person5', isActive: false });
    // A walk-in with only a phone number is stored under a stand-in address that must never be shown or searched.
    const walkIn = await w.service.create({ firstName: 'Walk', lastName: 'In', phone: '+254799209001' });

    assert.equal((await w.service.lookup('50%')).length, 1, 'a percent sign is not a wildcard');
    assert.equal((await w.service.lookup('%%')).length, 0);
    assert.deepEqual((await w.service.lookup('dormant')).map((c) => c.id), [], 'inactive customers are not offered');
    void inactive;

    const found = await w.service.lookup('799209001');
    assert.equal(found[0].id, walkIn.id);
    assert.equal(found[0].email, null, 'the stand-in address is not shown as the customer’s email');
    assert.deepEqual(await w.service.lookup('invalid'), [], 'and it is not searchable');
    assert.deepEqual(await w.service.lookup('customer.invalid'), []);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('customers who buy most come first, and an exact number beats everything', async () => {
  const w = await world();
  try {
    const store = await w.prisma.store.create({ data: { code: 'LOOKUP-TEST', name: 'Lookup test' } });
    const rare = await w.person(6, { firstName: 'Sam', lastName: 'Rare' });
    const regular = await w.person(7, { firstName: 'Sam', lastName: 'Regular' });
    for (let i = 0; i < 3; i += 1) {
      await w.prisma.order.create({ data: { orderNumber: `LT-${Date.now()}-${i}`, storeId: store.id, customerId: regular.id, total: 100 } as any });
    }
    const result = await w.service.lookup('sam');
    assert.deepEqual(result.map((c) => c.id), [regular.id, rare.id]);
    assert.equal(result[0].orders, 3);
    assert.ok(result[0].lastOrderAt);
    // A number typed in full puts its owner first, whatever the order history.
    assert.equal((await w.service.lookup(rare.phone))[0].id, rare.id);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a customer already on file is not added twice: the same phone number in any format, or the same email, says who they are', async () => {
  const w = await world();
  try {
    const first = await w.service.create({ firstName: 'Amina', lastName: 'Hassan', phone: '0799 202 001', email: `${TAG}-amina@example.test` });
    for (const attempt of [
      { firstName: 'Amina', lastName: 'H', phone: '+254799202001' },
      { firstName: 'Amina', lastName: 'H', phone: '254799202001' },
      { firstName: 'Someone', lastName: 'Else', phone: '0711 000 111', email: `${TAG}-AMINA@example.test` },
    ]) {
      await assert.rejects(() => w.service.create(attempt as any), (error: any) => {
        assert.ok(error instanceof ConflictException);
        const body = error.getResponse() as any;
        assert.equal(body.existing.id, first.id);
        assert.match(body.message, /Amina Hassan is already a customer/);
        return true;
      });
    }
    // A different person is added fine, and nothing was added by the refused attempts.
    const other = await w.service.create({ firstName: 'New', lastName: 'Person', phone: '0799 202 002' });
    assert.notEqual(other.id, first.id);
    assert.equal(await w.prisma.customer.count({ where: { OR: [{ email: { startsWith: `${TAG}-amina` } }, { phone: { contains: '799 202' } }] } }), 2);
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});

db('a customer can be added, or later tagged, as a reseller or a wholesaler, with the business they buy for', async () => {
  const w = await world();
  try {
    const retail = await w.service.create({ firstName: 'Plain', lastName: 'Shopper', phone: '+254799203001' });
    assert.equal(retail.priceTier, 'RETAIL');

    const wholesaler = await w.service.create({ firstName: 'Mama', lastName: 'Mboga', phone: '+254799203002', priceTier: 'WHOLESALE', businessName: 'Mama Mboga Shoes' });
    assert.deepEqual([wholesaler.priceTier, wholesaler.businessName], ['WHOLESALE', 'Mama Mboga Shoes']);

    const tagged = await w.service.update(retail.id, { priceTier: 'RESELLER' });
    assert.equal(tagged.priceTier, 'RESELLER');
    assert.equal((await w.service.update(retail.id, { priceTier: 'RETAIL' })).priceTier, 'RETAIL', 'and back');
    // The lookup says which tier each is on, so the till can price the order.
    assert.equal((await w.service.lookup('mboga'))[0].priceTier, 'WHOLESALE');
  } finally { await w.cleanup(); await w.prisma.$disconnect(); }
});
