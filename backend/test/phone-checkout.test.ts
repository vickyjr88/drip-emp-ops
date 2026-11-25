import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaClient } from '@prisma/client';
import { CheckoutService } from '../src/checkout/checkout.service';
import { CheckoutDto } from '../src/checkout/dto/checkout.dto';
import { CustomerService } from '../src/customer/customer.service';
import { CustomerPortalService } from '../src/customer-portal/customer-portal.service';
import { EmailLogService } from '../src/email-log/email-log.service';

// --- phone-only checkout against a real database (KITS_TEST_DATABASE_URL, a scratch database) --------------------------------

const url = process.env.KITS_TEST_DATABASE_URL;
const db = (name: string, fn: () => Promise<void>) => test(name, { skip: url ? false : 'KITS_TEST_DATABASE_URL is not set' }, fn);

async function harness() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tag = `pt${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  await prisma.store.upsert({ where: { code: 'PTEST' }, update: { isActive: true }, create: { code: 'PTEST', name: 'PTest Store' } });
  const category = await prisma.productCategory.upsert({ where: { slug: 'ptest-shoes' }, update: {}, create: { name: 'PTest Shoes', slug: 'ptest-shoes' } });
  const product = await prisma.product.create({
    data: { sku: `PT-${tag}`, name: `PTest Runner ${tag}`, slug: `ptest-${tag}`, brand: 'Nike', categoryId: category.id, imageUrls: ['https://api.test/x.jpg'], variants: { create: [{ sku: `PT-${tag}-42`, name: 'EUR 42', attributes: { size: 'EUR 42' }, priceKes: 5000 }] } },
    include: { variants: true },
  });
  const variantId = product.variants[0].id;

  const paystackCalls: Array<{ email: string; reference: string; amountKes: number }> = [];
  const paystack: any = {
    configured: true,
    initialise: async (o: any) => { paystackCalls.push(o); return { authorization_url: 'https://pay.test/x', reference: o.reference }; },
    verify: async (ref: string) => ({ status: 'success', reference: ref, amount: 500_000 }),
  };
  const mauticCalls: Array<[string, any]> = [];
  const mautic: any = {
    syncSignup: (p: any) => mauticCalls.push(['syncSignup', p]),
    syncOrder: (p: any) => mauticCalls.push(['syncOrder', p]),
    syncContact: (p: any) => mauticCalls.push(['syncContact', p]),
  };
  const notified: any[] = [];
  const owner: any = { notifySignup: (c: any) => notified.push(['signup', c.email]), notifyOrderPaid: (o: any) => notified.push(['paid', o]), notifyOrderPlaced: () => undefined };
  const stub: any = { record: async () => undefined, postOrderPayment: async () => undefined, accrue: async () => undefined, resolveActiveCampaignId: async () => null, trackPurchase: () => undefined };
  const checkout = new CheckoutService(prisma as any, stub, stub, paystack, owner, stub, stub, stub, stub, mautic, stub);

  // Everything this test makes carries its tag, so it can be removed, and two runs never meet.
  const phone = (n: number) => `07${String(Math.abs([...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) + n * 7919) % 100000000).padStart(8, '0')}`;
  const buyer = (n: number, extra: Record<string, unknown> = {}) => ({ firstName: 'PTest', lastName: tag, phone: phone(n), lines: [{ variantId, quantity: 1 }], ...extra }) as any;
  const cleanup = async () => {
    const customers = await prisma.customer.findMany({ where: { lastName: { contains: tag } }, select: { id: true } });
    const ids = customers.map((c) => c.id);
    await prisma.cartLead.deleteMany({ where: { OR: [{ customerId: { in: ids } }, { customerName: { contains: tag } }] } });
    const orders = await prisma.order.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
    await prisma.orderPayment.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    await prisma.productVariant.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.$disconnect();
  };
  return { prisma, checkout, paystack, paystackCalls, mauticCalls, mautic, notified, owner, stub, tag, phone, buyer, variantId, cleanup };
}

db('a shopper can check out with a phone number alone: a customer is made, the order shows no email, and Paystack is given an address that receives nothing', async () => {
  const h = await harness();
  try {
    const out = await h.checkout.start(h.buyer(1), 'https://www.dripemporium.store');
    assert.equal(out.authorizationUrl, 'https://pay.test/x');
    const order = await h.prisma.order.findUniqueOrThrow({ where: { orderNumber: out.orderNumber }, include: { customer: true } });
    assert.equal(order.customerEmail, null, 'a stand-in is never shown as the customer\'s email');
    assert.match(order.customer!.email, /^254\d{9}@customer\.invalid$/);
    assert.equal(order.customerPhone, order.customer!.phone);
    assert.match(order.customer!.phone, /^\+254/, 'the number is kept in one shape');
    const payer = h.paystackCalls[0].email;
    assert.match(payer, /^254\d{9}@phone\.dripemporium\.store$/);
    assert.equal(payer.includes('invalid'), false);
    assert.deepEqual(h.mauticCalls, [], 'nothing is sent to Mautic before the order is paid');
  } finally { await h.cleanup(); }
});

db('the same number buying again, typed another way, is the same customer', async () => {
  const h = await harness();
  try {
    const n = h.buyer(2);
    const a = await h.checkout.start(n, 'https://shop.test');
    const spelled = { ...n, phone: n.phone.replace(/^0/, '+254 ').replace(/(\d{3})(\d{3})$/, '$1 $2') };
    const b = await h.checkout.start(spelled, 'https://shop.test');
    const orders = await h.prisma.order.findMany({ where: { orderNumber: { in: [a.orderNumber, b.orderNumber] } } });
    assert.equal(new Set(orders.map((o) => o.customerId)).size, 1);
    assert.equal(await h.prisma.customer.count({ where: { lastName: h.tag } }), 1);
  } finally { await h.cleanup(); }
});

db('when an email is given later, the same customer gains it and keeps its orders, and Mautic is told', async () => {
  const h = await harness();
  try {
    const first = await h.checkout.start(h.buyer(3), 'https://shop.test');
    const before = await h.prisma.order.findUniqueOrThrow({ where: { orderNumber: first.orderNumber } });
    const email = `${h.tag}@Example.com`;
    const second = await h.checkout.start(h.buyer(3, { email }), 'https://shop.test');

    const customers = await h.prisma.customer.findMany({ where: { lastName: h.tag } });
    assert.equal(customers.length, 1, 'one person, not two');
    assert.equal(customers[0].email, email.toLowerCase());
    assert.equal(customers[0].id, before.customerId);
    const after = await h.prisma.order.findUniqueOrThrow({ where: { orderNumber: second.orderNumber } });
    assert.equal(after.customerId, before.customerId);
    assert.equal(after.customerEmail, email.toLowerCase());
    assert.equal(h.paystackCalls[1].email, email.toLowerCase(), 'with a real address Paystack gets it');
    const told = h.mauticCalls.find(([k]) => k === 'syncContact');
    assert.ok(told, 'the Mautic contact for this number is given the address');
    assert.equal(told![1].email, email.toLowerCase());
    assert.equal(told![1].phone, customers[0].phone);
  } finally { await h.cleanup(); }
});

db('an email that is already a customer\'s is used as it always was: no stand-in, no second record, no Mautic update', async () => {
  const h = await harness();
  try {
    const email = `${h.tag}-a@example.com`;
    const a = await h.checkout.start(h.buyer(4, { email }), 'https://shop.test');
    const b = await h.checkout.start(h.buyer(4, { email }), 'https://shop.test');
    const orders = await h.prisma.order.findMany({ where: { orderNumber: { in: [a.orderNumber, b.orderNumber] } } });
    assert.equal(new Set(orders.map((o) => o.customerId)).size, 1);
    assert.equal(await h.prisma.customer.count({ where: { lastName: h.tag } }), 1);
    assert.deepEqual(h.mauticCalls, []);
  } finally { await h.cleanup(); }
});

db('a phone-only checkout is never attached to someone else\'s account just because the number matches', async () => {
  const h = await harness();
  try {
    const n = h.buyer(5);
    await h.checkout.start({ ...n, email: `${h.tag}-owner@example.com` }, 'https://shop.test');
    await h.checkout.start({ ...n, firstName: 'PTestOther' }, 'https://shop.test');
    const customers = await h.prisma.customer.findMany({ where: { lastName: h.tag }, orderBy: { createdAt: 'asc' } });
    assert.equal(customers.length, 2);
    assert.match(customers[0].email, /@example\.com$/);
    assert.match(customers[1].email, /@customer\.invalid$/);
  } finally { await h.cleanup(); }
});

db('an account needs an email: a password without one is refused before anything is written', async () => {
  const h = await harness();
  try {
    await assert.rejects(() => h.checkout.start(h.buyer(6, { password: 'longenoughpw' }), 'https://shop.test'), /needs an email/);
    assert.equal(await h.prisma.customer.count({ where: { lastName: h.tag } }), 0);
    assert.equal(await h.prisma.order.count({ where: { customerName: { contains: h.tag } } }), 0);
  } finally { await h.cleanup(); }
});

db('an abandoned cart left with a phone number is converted by an order from the same number', async () => {
  const h = await harness();
  try {
    const n = h.buyer(7);
    const lead = await h.prisma.cartLead.create({ data: { source: 'ABANDONED_CART', customerName: `PTest ${h.tag}`, customerPhone: n.phone, lines: [], subtotal: 5000, total: 5000 } });
    const out = await h.checkout.start(n, 'https://shop.test');
    const after = await h.prisma.cartLead.findUniqueOrThrow({ where: { id: lead.id } });
    assert.equal(after.status, 'CONVERTED');
    const order = await h.prisma.order.findUniqueOrThrow({ where: { orderNumber: out.orderNumber } });
    assert.equal(after.orderId, order.id);
  } finally { await h.cleanup(); }
});

db('a phone-only order can be paid again later, and a paid one tells Mautic about the phone number', async () => {
  const h = await harness();
  try {
    const out = await h.checkout.start(h.buyer(8), 'https://shop.test');
    const order = await h.prisma.order.findUniqueOrThrow({ where: { orderNumber: out.orderNumber } });
    const resumed = await h.checkout.resumePayment(order.id, order.customerId!, 'https://www.dripemporium.store');
    assert.equal(resumed.authorizationUrl, 'https://pay.test/x');
    assert.match(h.paystackCalls[1].email, /@phone\.dripemporium\.store$/);

    const settled = await h.checkout.settle(h.paystackCalls[1].reference);
    assert.equal(settled.paid, true);
    const sync = h.mauticCalls.find(([k]) => k === 'syncOrder');
    assert.ok(sync);
    assert.equal(sync![1].email, null, 'no address is passed on, so none is invented');
    assert.equal(sync![1].phone, order.customerPhone);
    const paid = h.notified.find(([k]) => k === 'paid');
    assert.equal(paid![1].customerEmail, null);
  } finally { await h.cleanup(); }
});

db('the email box may be left blank, and a bad address is still refused', async () => {
  const check = async (email: unknown) => {
    const dto = plainToInstance(CheckoutDto, { lines: [{ variantId: 'v', quantity: 1 }], firstName: 'A', lastName: 'B', phone: '0722123456', ...(email === undefined ? {} : { email }) });
    return (await validate(dto)).filter((e) => e.property === 'email');
  };
  assert.equal((await check(undefined)).length, 0, 'left out');
  assert.equal((await check('')).length, 0, 'a blank box');
  assert.equal((await check('   ')).length, 0, 'spaces');
  assert.equal((await check('w@example.com')).length, 0);
  assert.equal((await check('not an email')).length, 1);
});

db('staff can add an email to a phone-only customer; it must be a real one and not another customer\'s, and Mautic is told', async () => {
  const h = await harness();
  try {
    await h.checkout.start(h.buyer(9), 'https://shop.test');
    await h.checkout.start({ ...h.buyer(10), email: `${h.tag}-taken@example.com` }, 'https://shop.test');
    const service = new CustomerService(h.prisma as any, h.mautic);
    const phoneOnly = await h.prisma.customer.findFirstOrThrow({ where: { lastName: h.tag, email: { endsWith: '@customer.invalid' } } });

    await assert.rejects(() => service.update(phoneOnly.id, { email: `${h.tag}-taken@example.com` } as any), /already belongs to another customer/);
    await assert.rejects(() => service.update(phoneOnly.id, { email: '254700000000@customer.invalid' } as any), /not an email address a customer can be reached on/);
    await assert.rejects(() => service.update('no-such-id', { email: 'x@y.co' } as any), /not found/);
    assert.equal((await h.prisma.customer.findUniqueOrThrow({ where: { id: phoneOnly.id } })).email.endsWith('@customer.invalid'), true);

    const updated = await service.update(phoneOnly.id, { email: ` ${h.tag}-new@Example.com ` } as any);
    assert.equal(updated.email, `${h.tag}-new@example.com`);
    const told = h.mauticCalls.filter(([k]) => k === 'syncContact').pop()!;
    assert.equal(told[1].email, `${h.tag}-new@example.com`);
    // Editing something else, or the same address again, does not re-sync.
    const count = h.mauticCalls.length;
    await service.update(phoneOnly.id, { firstName: 'PTestRenamed' } as any);
    await service.update(phoneOnly.id, { email: `${h.tag}-new@example.com` } as any);
    assert.equal(h.mauticCalls.length, count);
  } finally { await h.cleanup(); }
});

db('a walk-in rung up with no email gets the same stand-in the checkout would make, so the two are one customer', async () => {
  const h = await harness();
  try {
    const service = new CustomerService(h.prisma as any, h.mautic);
    const n = h.buyer(11);
    const walkIn = await service.create({ firstName: 'PTest', lastName: h.tag, phone: n.phone } as any);
    await h.checkout.start({ ...n, phone: n.phone.replace(/^0/, '+254') }, 'https://shop.test');
    assert.equal(await h.prisma.customer.count({ where: { lastName: h.tag } }), 1);
    const order = await h.prisma.order.findFirstOrThrow({ where: { customerName: { contains: h.tag } } });
    assert.equal(order.customerId, walkIn.id);
  } finally { await h.cleanup(); }
});

db('making an account with the email claims the phone-only record and its past orders', async () => {
  const h = await harness();
  try {
    const out = await h.checkout.start(h.buyer(12), 'https://shop.test');
    const order = await h.prisma.order.findUniqueOrThrow({ where: { orderNumber: out.orderNumber } });
    const jwt: any = { sign: () => 'token', signAsync: async () => 'token' };
    const portal = new CustomerPortalService(h.prisma as any, jwt, h.stub, h.stub, h.mautic);
    const email = `${h.tag}-acct@example.com`;
    await portal.signup({ firstName: 'PTest', lastName: h.tag, email, phone: order.customerPhone!.replace('+254', '0'), password: 'longenoughpw' }).catch((e) => { throw e; });
    const customers = await h.prisma.customer.findMany({ where: { lastName: h.tag } });
    assert.equal(customers.length, 1);
    assert.equal(customers[0].email, email);
    assert.equal(customers[0].portalEnabled, true);
    assert.equal(customers[0].id, order.customerId, 'the account shows the order made before it existed');
    assert.ok(h.mauticCalls.find(([k, p]) => k === 'syncContact' && p.email === email));
  } finally { await h.cleanup(); }
});

db('mail is never sent to a stand-in address, and the log says why', async () => {
  const h = await harness();
  try {
    let sent = 0;
    const sender: any = { send: async () => { sent += 1; return { delivered: true }; } };
    const log = await new EmailLogService(h.prisma as any, sender).send({ recipient: '254722123456@customer.invalid', subject: 'Invoice', html: '<p>x</p>' });
    assert.equal(sent, 0);
    assert.equal(log.status, 'FAILED');
    assert.match(log.errorMessage!, /no email address on file/i);
    await new EmailLogService(h.prisma as any, sender).send({ recipient: 'real@example.com', subject: 'Invoice', html: '<p>x</p>' });
    assert.equal(sent, 1, 'a real address is sent to as before');
    await h.prisma.emailLog.deleteMany({ where: { recipient: { in: ['254722123456@customer.invalid', 'real@example.com'] } } });
  } finally { await h.cleanup(); }
});
