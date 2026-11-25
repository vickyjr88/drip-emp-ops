import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatNumber, followUpUrl, renderEmail, renderWhatsAppText, summaryLine, templateParams, type AlertEvent } from '../src/alerts/alert-render';

const origin = 'https://dripemporium.store';
const inquiry: AlertEvent = {
  kind: 'inquiry.contact',
  subject: 'Contact form: Wanjiku',
  heading: 'New contact form submission',
  rows: [['Name', 'Wanjiku Kamau'], ['Email', 'w@x.test'], ['Phone', '0712 345 678'], ['Company', '  '], ['Note', null]],
  text: { label: 'Message', value: 'Do you have the Air Max 90 in 42?\nI need it by Friday.' },
  followUp: { phone: '0712 345 678', message: 'Hi Wanjiku, thanks for your message.' },
  portalPath: '/portal/inquiries',
};

test('a phone number is a chat number however it was typed, or nothing', () => {
  assert.equal(chatNumber('0712 345 678'), '254712345678');
  assert.equal(chatNumber('+254 712 345 678'), '254712345678');
  assert.equal(chatNumber('712345678'), '254712345678');
  assert.equal(chatNumber('12'), null);
  assert.equal(chatNumber(null), null);
});

test('the reply link opens the customer\'s chat with the message ready, and there is none without a number', () => {
  assert.equal(followUpUrl(inquiry), `https://wa.me/254712345678?text=${encodeURIComponent('Hi Wanjiku, thanks for your message.')}`);
  assert.equal(followUpUrl({ ...inquiry, followUp: { phone: null } }), null);
  assert.equal(followUpUrl({ ...inquiry, followUp: undefined }), null);
});

test('blank facts are left out, and the summary is one line', () => {
  const line = summaryLine(inquiry);
  assert.equal(line, 'Name: Wanjiku Kamau · Email: w@x.test · Phone: 0712 345 678 · Message: Do you have the Air Max 90 in 42? I need it by Friday.');
  assert.ok(!line.includes('Company'));
  assert.ok(!line.includes('\n'));
});

test('the email carries the facts, the message, a reply button and a portal link, and escapes what a stranger typed', () => {
  const mail = renderEmail({ ...inquiry, rows: [['Name', '<script>x</script>']] }, origin);
  assert.equal(mail.subject, 'Contact form: Wanjiku');
  assert.ok(mail.html.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(!mail.html.includes('<script>'));
  assert.ok(mail.html.includes('Reply on WhatsApp'));
  assert.ok(mail.html.includes('https://dripemporium.store/portal/inquiries'));
});

test('the WhatsApp text, for someone inside the 24 hours, is the whole message with both links', () => {
  const text = renderWhatsAppText(inquiry, origin);
  assert.match(text, /^\*Contact form: Wanjiku\*\nName: Wanjiku Kamau/);
  assert.ok(text.includes('Message:\nDo you have the Air Max 90 in 42?\nI need it by Friday.'));
  assert.ok(text.includes('Reply: https://wa.me/254712345678?text='));
  assert.ok(text.endsWith('Portal: https://dripemporium.store/portal/inquiries'));
});

test('the three template values are single lines, and the third is the way to reply (or the portal when there is no one to reply to)', () => {
  const [one, two, three] = templateParams(inquiry, origin);
  assert.equal(one, 'Contact form: Wanjiku');
  assert.ok(!two.includes('\n') && two.startsWith('Name: Wanjiku Kamau'));
  assert.ok(three.startsWith('Reply: https://wa.me/254712345678'));
  const [, , noReply] = templateParams({ ...inquiry, followUp: undefined }, origin);
  assert.equal(noReply, 'Open: https://dripemporium.store/portal/inquiries');
  const [, , nothing] = templateParams({ ...inquiry, followUp: undefined, portalPath: undefined }, origin);
  assert.equal(nothing, 'Open the portal to follow up.');
});

test('a very long message is cut for the template so it stays inside WhatsApp\'s limits', () => {
  const long = { ...inquiry, text: { label: 'Message', value: 'word '.repeat(400) } };
  const [, two] = templateParams(long, origin);
  assert.ok(two.length <= 500);
  assert.ok(two.endsWith('…'));
});
