import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSearchable, likeEscape, parseLookup, phoneKey, phoneNeedle } from '../src/customer/customer-lookup';

test('a mobile number is the same search however it is typed', () => {
  for (const typed of ['0712345678', '0712 345 678', '+254 712 345 678', '254712345678', '712345678', '0712-345-678', '(0712) 345678']) {
    assert.equal(parseLookup(typed).phone, '712345678', typed);
  }
  assert.equal(phoneNeedle('0712'), '712');
  assert.equal(phoneNeedle('254712'), '712');
  assert.equal(phoneNeedle('254'), '254', 'a bare country code is too short to strip');
});

test('names, emails and numbers are told apart, and can be mixed', () => {
  assert.deepEqual(parseLookup('Wanjiku Kamau'), { words: ['wanjiku', 'kamau'], phone: null, email: null });
  assert.deepEqual(parseLookup('Wanjiku@Example.com'), { words: [], phone: null, email: 'wanjiku@example.com' });
  assert.deepEqual(parseLookup('john 0712 345'), { words: ['john'], phone: '712345', email: null });
  assert.deepEqual(parseLookup('  '), { words: [], phone: null, email: null });
  assert.deepEqual(parseLookup(''), { words: [], phone: null, email: null });
});

test('a number with fewer than three digits is not a phone search', () => {
  assert.equal(parseLookup('07').phone, null);
  assert.equal(parseLookup('0712').phone, '712');
});

test('a search that would match half the customers is not run', () => {
  assert.equal(isSearchable(parseLookup('a')), false);
  assert.equal(isSearchable(parseLookup('07')), false);
  assert.equal(isSearchable(parseLookup('wa')), true);
  assert.equal(isSearchable(parseLookup('071')), true);
  assert.equal(isSearchable(parseLookup('a@')), false);
  assert.equal(isSearchable(parseLookup('a@b')), true);
});

test('wildcards typed by a person are searched for, not obeyed', () => {
  assert.equal(likeEscape('50%_off\\'), '50\\%\\_off\\\\');
});

test('two ways of writing one number are one person', () => {
  assert.equal(phoneKey('+254712345678'), '712345678');
  assert.equal(phoneKey('0712 345 678'), '712345678');
  assert.equal(phoneKey('712345678'), '712345678');
  assert.equal(phoneKey('12345'), null);
  assert.equal(phoneKey(null), null);
});
