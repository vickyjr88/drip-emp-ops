import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DecideInput, canSendNow, classifyFailure, decide, dueAt, errorCodeOf, followUpConfig, itemsSummary, nextWindowOpens, resolveOutcome, whatsappParams,
} from '../src/cart-lead/lead-followup';

const NOW = new Date('2026-11-24T09:00:00Z'); // 12:00 in Nairobi
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const cfg = { delayMs: 3_600_000, maxAgeMs: 30 * 86_400_000, maxAttempts: 3 };

function input(over: { lead?: Partial<DecideInput['lead']>; facts?: Partial<DecideInput['facts']>; channels?: Partial<DecideInput['channels']> } & Partial<Omit<DecideInput, 'lead' | 'facts' | 'channels'>> = {}): DecideInput {
  return {
    now: NOW,
    phone: '254712345678',
    email: 'shopper@example.com',
    config: cfg,
    ...over,
    lead: { status: 'NEW', state: 'PENDING', createdAt: hoursAgo(3), lastActivityAt: hoursAgo(2), nextAt: null, emailAttempts: 0, whatsapp: null, email: null, reminderSentAt: null, ...over.lead },
    facts: { conversation: false, stopped: false, badNumber: false, sameNumberRecently: false, sameEmailRecently: false, ...over.facts },
    channels: { whatsappReady: true, emailReady: true, ...over.channels },
  };
}

test('settings: on by default, an hour, thirty days, and read from the environment', () => {
  const d = followUpConfig({});
  assert.deepEqual([d.enabled, d.delayMs, d.maxAgeMs, d.batch, d.reserve, d.maxAttempts], [true, 3_600_000, 30 * 86_400_000, 10, 40, 3]);
  assert.equal(followUpConfig({ LEAD_FOLLOWUP_ENABLED: 'false' }).enabled, false);
  assert.equal(followUpConfig({ LEAD_FOLLOWUP_DELAY_MINUTES: '90' }).delayMs, 90 * 60_000);
  assert.equal(followUpConfig({ LEAD_FOLLOWUP_MAX_AGE_DAYS: 'nonsense' }).maxAgeMs, 30 * 86_400_000);
});

test('messages go out between 08:00 and 20:00 Nairobi time only', () => {
  assert.equal(canSendNow(new Date('2026-11-24T04:59:00Z')), false); // 07:59
  assert.equal(canSendNow(new Date('2026-11-24T05:00:00Z')), true);  // 08:00
  assert.equal(canSendNow(new Date('2026-11-24T16:59:00Z')), true);  // 19:59
  assert.equal(canSendNow(new Date('2026-11-24T17:00:00Z')), false); // 20:00
  assert.equal(canSendNow(new Date('2026-11-24T22:00:00Z')), false); // 01:00 next day
});

test('when the window next opens: now inside it, 08:00 today before it, 08:00 tomorrow after it', () => {
  assert.equal(nextWindowOpens(NOW).toISOString(), NOW.toISOString());
  assert.equal(nextWindowOpens(new Date('2026-11-24T02:00:00Z')).toISOString(), '2026-11-24T05:00:00.000Z');
  assert.equal(nextWindowOpens(new Date('2026-11-24T18:00:00Z')).toISOString(), '2026-11-25T05:00:00.000Z');
});

test('a lead is due an hour after the shopper last did anything, so a cart still being added to is not chased', () => {
  const lead = { createdAt: hoursAgo(5), lastActivityAt: hoursAgo(1) };
  assert.equal(dueAt(lead, 3_600_000).toISOString(), NOW.toISOString());
  assert.equal(decide(input({ lead: { lastActivityAt: new Date(NOW.getTime() - 59 * 60_000) } })).action, 'WAIT');
  assert.equal(decide(input({ lead: { lastActivityAt: new Date(NOW.getTime() - 61 * 60_000) } })).action, 'SEND');
});

test('what is said about the items stays short and on one line', () => {
  assert.equal(itemsSummary([{ name: 'Nike Air Force 1', size: '42' }]), 'Nike Air Force 1 (size 42)');
  assert.equal(itemsSummary([{ name: 'Seiko 5', size: 'Standard' }]), 'Seiko 5');
  assert.equal(itemsSummary([{ name: 'A', size: '40' }, { name: 'B' }, { name: 'C' }]), 'A (size 40) and 2 more');
  assert.equal(itemsSummary([]), 'some items');
  assert.equal(itemsSummary([{ name: 'Line\nbreak\t  here' }]), 'Line break here');
  const long = itemsSummary([{ name: 'X'.repeat(200) }, { name: 'Y' }], 60);
  assert.ok(long.length <= 60 && long.endsWith(' and 1 more') && long.includes('…'));
});

test('the template values: a first name or "there", no line breaks', () => {
  assert.deepEqual(whatsappParams({ name: 'wanjiku KAMAU', items: 'Boots', link: 'https://x.test/a' }), ['Wanjiku', 'Boots', 'https://x.test/a']);
  assert.equal(whatsappParams({ name: '0712345678', items: 'x', link: 'l' })[0], 'there');
  assert.equal(whatsappParams({ name: 'a@b.co', items: 'x', link: 'l' })[0], 'there');
  assert.equal(whatsappParams({ name: 'Walk-in', items: 'x', link: 'l' })[0], 'there');
  assert.equal(whatsappParams({ name: null, items: '', link: 'l' })[1], 'some items');
  assert.equal(whatsappParams({ name: 'A', items: 'one\ntwo', link: 'l' })[1], 'one two');
});

test('a failure is read as the number, the account, the setup, or unknown', () => {
  assert.equal(classifyFailure('131026'), 'NUMBER');
  assert.equal(classifyFailure('131042'), 'ACCOUNT'); // a payment problem is the shop's, not the customer's
  assert.equal(classifyFailure('131049'), 'ACCOUNT');
  assert.equal(classifyFailure('132001'), 'CONFIG');  // template does not exist
  assert.equal(classifyFailure('190'), 'CONFIG');     // token
  assert.equal(classifyFailure(null, 'Template name does not exist in the translation'), 'CONFIG');
  assert.equal(classifyFailure(null, 'Unusable WhatsApp number "abc"'), 'NUMBER');
  assert.equal(classifyFailure(null, 'WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not configured'), 'CONFIG');
  assert.equal(classifyFailure('131000', 'Something went wrong'), 'OTHER');
  assert.equal(classifyFailure(undefined, undefined), 'OTHER');
});

test('a stored delivery failure gives its code', () => {
  assert.equal(errorCodeOf('131026: Message undeliverable'), '131026');
  assert.equal(errorCodeOf('(#131042) Business eligibility payment issue'), '131042');
  assert.equal(errorCodeOf('no code here'), null);
  assert.equal(errorCodeOf(null), null);
});

// --- decide ---------------------------------------------------------------------------------------------------------

test('a due lead with a phone and an email is chased on both channels', () => {
  assert.deepEqual(decide(input()), { action: 'SEND', whatsapp: true, email: true });
});

test('only the channels the lead has are used', () => {
  assert.deepEqual(decide(input({ email: null })), { action: 'SEND', whatsapp: true, email: false });
  assert.deepEqual(decide(input({ phone: null })), { action: 'SEND', whatsapp: false, email: true });
});

test('a lead with nobody to reach is skipped and marked', () => {
  assert.deepEqual(decide(input({ phone: null, email: null })), { action: 'CLOSE', state: 'SKIPPED', reason: 'NO_CONTACT', note: 'No usable phone number or email address' });
});

test('a customer who already opened a WhatsApp conversation is not chased on either channel, and is marked done', () => {
  const d = decide(input({ facts: { conversation: true } }));
  assert.equal(d.action, 'CLOSE');
  assert.equal((d as any).state, 'DONE');
  assert.equal((d as any).reason, 'CONVERSATION');
});

test('a lead staff already followed up (the WhatsApp button marks it contacted) is done, not chased again', () => {
  const d = decide(input({ lead: { status: 'CONTACTED' } }));
  assert.deepEqual([(d as any).state, (d as any).reason], ['DONE', 'STAFF']);
});

test('a converted or dismissed lead is skipped, whatever its age or channels', () => {
  assert.equal((decide(input({ lead: { status: 'CONVERTED' } })) as any).reason, 'CLOSED');
  assert.equal((decide(input({ lead: { status: 'EXPIRED' } })) as any).reason, 'CLOSED');
});

test('a lead already handled is left alone', () => {
  for (const state of ['DONE', 'FAILED', 'SKIPPED'] as const) assert.deepEqual(decide(input({ lead: { state } })), { action: 'WAIT' });
});

test('the backlog reaches back thirty days and no further', () => {
  assert.equal(decide(input({ lead: { createdAt: hoursAgo(24 * 29), lastActivityAt: hoursAgo(24 * 29) } })).action, 'SEND');
  const old = decide(input({ lead: { createdAt: hoursAgo(24 * 31), lastActivityAt: hoursAgo(24 * 31) } }));
  assert.deepEqual([(old as any).state, (old as any).reason], ['SKIPPED', 'TOO_OLD']);
});

test('someone who replied STOP is never messaged on WhatsApp, but may still get the email', () => {
  assert.deepEqual(decide(input({ facts: { stopped: true } })), { action: 'SEND', whatsapp: false, email: true });
  const d = decide(input({ email: null, facts: { stopped: true } }));
  assert.deepEqual([(d as any).state, (d as any).reason], ['SKIPPED', 'STOPPED']);
});

test('a number that came back undeliverable is not tried again, and is marked failed when there is no email', () => {
  assert.deepEqual(decide(input({ facts: { badNumber: true } })), { action: 'SEND', whatsapp: false, email: true });
  const d = decide(input({ email: null, facts: { badNumber: true } }));
  assert.deepEqual([(d as any).state, (d as any).reason], ['FAILED', 'WHATSAPP_FAILED']);
});

test('the same person is not messaged twice in a day because they have two leads', () => {
  const both = decide(input({ facts: { sameNumberRecently: true, sameEmailRecently: true } }));
  assert.deepEqual([(both as any).state, (both as any).reason], ['DONE', 'DUPLICATE']);
  assert.deepEqual(decide(input({ facts: { sameNumberRecently: true } })), { action: 'SEND', whatsapp: false, email: true });
  assert.deepEqual(decide(input({ facts: { sameEmailRecently: true } })), { action: 'SEND', whatsapp: true, email: false });
});

test('the old 24-hour reminder email counts as an email already sent', () => {
  assert.deepEqual(decide(input({ lead: { reminderSentAt: hoursAgo(20) } })), { action: 'SEND', whatsapp: true, email: false });
  assert.deepEqual(decide(input({ lead: { email: 'SENT' } })), { action: 'SEND', whatsapp: true, email: false });
});

test('a channel that is not set up yet is a reason to wait, never to give up on the lead', () => {
  const d = decide(input({ channels: { whatsappReady: false, emailReady: false } }));
  assert.equal(d.action, 'WAIT');
  assert.deepEqual(decide(input({ email: null, channels: { whatsappReady: false } })).action, 'WAIT');
  // But the other channel still goes.
  assert.deepEqual(decide(input({ channels: { whatsappReady: false } })), { action: 'SEND', whatsapp: false, email: true });
});

test('a retry waits for its time', () => {
  const later = new Date(NOW.getTime() + 20 * 60_000);
  assert.deepEqual(decide(input({ lead: { nextAt: later } })), { action: 'WAIT', until: later });
});

test('email is tried up to three times and then left', () => {
  assert.deepEqual(decide(input({ lead: { emailAttempts: 2 } })), { action: 'SEND', whatsapp: true, email: true });
  assert.deepEqual(decide(input({ lead: { emailAttempts: 3 } })), { action: 'SEND', whatsapp: true, email: false });
});

// --- resolveOutcome ---------------------------------------------------------------------------------------------------

const base = { priorWhatsapp: null, priorEmailSent: false, attempts: 0, emailAttempts: 0, hadEmailAddress: true, maxAttempts: 3 } as const;

test('anything that reached the customer makes the lead done', () => {
  assert.deepEqual(resolveOutcome({ ...base, whatsapp: 'SENT', email: 'SENT' }), { state: 'DONE', reason: 'SENT', note: 'Followed up by WhatsApp and email', retry: false });
  assert.equal(resolveOutcome({ ...base, whatsapp: 'SENT', email: 'NONE' }).note, 'Followed up by WhatsApp');
  assert.equal(resolveOutcome({ ...base, whatsapp: 'NONE', email: 'SENT' }).note, 'Followed up by email');
});

test('a number that fails is marked, even when the email got through', () => {
  const r = resolveOutcome({ ...base, whatsapp: 'NUMBER', email: 'SENT' });
  assert.equal(r.state, 'DONE');
  assert.match(r.note, /could not be reached/);
});

test('a number that fails with no email to fall back on is marked failed', () => {
  assert.deepEqual(resolveOutcome({ ...base, hadEmailAddress: false, whatsapp: 'NUMBER', email: 'NONE' }), { state: 'FAILED', reason: 'WHATSAPP_FAILED', note: 'This number is not on WhatsApp and there is no email address that worked', retry: false });
});

test('a failure worth another go keeps the lead waiting, then gives up after three tries', () => {
  assert.deepEqual(resolveOutcome({ ...base, whatsapp: 'RETRY', email: 'NONE' }), { state: 'PENDING', reason: 'RETRY', note: 'Will try again', retry: true });
  assert.deepEqual(resolveOutcome({ ...base, attempts: 2, whatsapp: 'RETRY', email: 'NONE' }), { state: 'FAILED', reason: 'GAVE_UP', note: 'Not delivered after 3 tries', retry: false });
});

test('a dead number with an email still to try waits for the email', () => {
  const r = resolveOutcome({ ...base, whatsapp: 'NUMBER', email: 'FAILED' });
  assert.deepEqual([r.state, r.retry], ['PENDING', true]);
});

// --- the email and the links ------------------------------------------------------------------------------------------

import { leadFollowUpEmail } from '../src/cart-lead/lead-followup-email';
import { EMAIL_KIND, outreachKindFor, utmLink } from '../src/cart-lead/lead-followup';

test('the follow-up link is tagged, stays on the shop, and falls back to the cart or the shop', () => {
  assert.equal(utmLink('https://dripemporium.store/', '/shop/air-max', 'ABANDONED_CART', 'whatsapp'), 'https://dripemporium.store/shop/air-max?utm_source=whatsapp&utm_medium=auto-followup&utm_campaign=abandoned-cart');
  assert.equal(utmLink('https://dripemporium.store', null, 'ABANDONED_CART', 'email'), 'https://dripemporium.store/cart?utm_source=email&utm_medium=auto-followup&utm_campaign=abandoned-cart');
  assert.equal(utmLink('https://dripemporium.store', undefined, 'WHATSAPP_ORDER', 'whatsapp'), 'https://dripemporium.store/shop?utm_source=whatsapp&utm_medium=auto-followup&utm_campaign=whatsapp-order');
  // A path that could leave the shop is not used.
  assert.match(utmLink('https://dripemporium.store', '//evil.test/x', 'ABANDONED_CART', 'email'), /^https:\/\/dripemporium\.store\/cart\?/);
  assert.equal(outreachKindFor('ABANDONED_CART'), 'FOLLOWUP_CART');
  assert.equal(outreachKindFor('WHATSAPP_ORDER'), 'FOLLOWUP_ORDER');
  assert.equal(EMAIL_KIND, 'LEAD_FOLLOWUP');
});

test('the email lists what was left, escapes what the shopper typed, and says how to stop', () => {
  const { subject, html } = leadFollowUpEmail({
    kind: 'ABANDONED_CART', name: 'wanjiku <b>x</b>',
    lines: [{ name: 'Nike <script>alert(1)</script> AF1', size: '42', quantity: 2 }, { name: 'Seiko 5', size: 'Standard', quantity: 1 }],
    total: 9500, link: 'https://dripemporium.store/cart?utm_source=email',
  });
  assert.equal(subject, 'You left something in your cart');
  assert.ok(!html.includes('<script>'), 'script tags are escaped');
  assert.ok(html.includes('2 x Nike &lt;script&gt;'));
  assert.ok(html.includes('(size 42)'));
  assert.ok(!html.includes('Standard'));
  assert.ok(html.includes('Hi Wanjiku'));
  assert.ok(html.includes('https://dripemporium.store/cart?utm_source=email'));
  assert.ok(/Ignore it, or reply/.test(html));
});

test('an enquiry gets its own subject and wording, and a cart over eight items is cut short', () => {
  const lines = Array.from({ length: 11 }, (_, i) => ({ name: `Item ${i + 1}`, quantity: 1 }));
  const enquiry = leadFollowUpEmail({ kind: 'WHATSAPP_ORDER', name: null, lines, total: 0, link: 'https://x.test/shop' });
  assert.equal(enquiry.subject, 'About the pair you asked about');
  assert.ok(enquiry.html.includes('Hi there'));
  assert.ok(enquiry.html.includes('...and 3 more'));
  assert.ok(!enquiry.html.includes('Total:'));
});
