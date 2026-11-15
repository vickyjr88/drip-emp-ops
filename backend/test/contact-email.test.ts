import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPlaceholderEmail, payerEmail, phoneTail, placeholderEmailFor, realEmail } from '../src/common/contact-email';

test('a real address is kept, tidied; the stand-ins and nothing at all are "no email"', () => {
  assert.equal(realEmail('  Wanjiku@Example.com '), 'wanjiku@example.com');
  for (const none of [null, undefined, '', '   ', 'not an address', '254722123456@customer.invalid', '1234@trade.invalid', 'X@Y.INVALID']) {
    assert.equal(realEmail(none), null, String(none));
    assert.equal(isPlaceholderEmail(none), true, String(none));
  }
  assert.equal(isPlaceholderEmail('a@b.co'), false);
});

test('the stand-in for a number is the same however the number was typed, and ends in .invalid', () => {
  const forms = ['0722123456', '+254722123456', '254722123456', '0722 123 456', '+254 (722) 123-456'];
  const made = new Set(forms.map(placeholderEmailFor));
  assert.deepEqual([...made], ['254722123456@customer.invalid']);
  assert.equal(realEmail([...made][0]), null);
});

test('the last nine digits identify a number across its spellings', () => {
  assert.deepEqual(['0722123456', '+254722123456', '254 722 123 456'].map(phoneTail), ['722123456', '722123456', '722123456']);
});

test('the payment provider gets the real address, or one made from the number on a host with no mailbox', () => {
  assert.equal(payerEmail({ email: 'A@b.co', phone: '0722123456', host: 'dripemporium.store' }), 'a@b.co');
  assert.equal(payerEmail({ email: null, phone: '0722123456', host: 'www.dripemporium.store' }), '254722123456@phone.dripemporium.store');
  assert.equal(payerEmail({ email: '254722123456@customer.invalid', phone: '+254722123456', host: 'shop.example.co.ke' }), '254722123456@phone.shop.example.co.ke');
  // Not a real domain (local development, an address by number): the live shop's own.
  for (const host of ['localhost', '127.0.0.1', '', undefined, null, 'no spaces allowed']) {
    assert.equal(payerEmail({ email: null, phone: '0722123456', host: host as any }), '254722123456@phone.dripemporium.store', String(host));
  }
  // The same number is the same payer every time.
  assert.equal(payerEmail({ email: null, phone: '0722123456', host: 'x.co' }), payerEmail({ email: null, phone: '+254 722 123 456', host: 'x.co' }));
});
