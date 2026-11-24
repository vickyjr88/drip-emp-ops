import { ctaButton, escapeHtml, money } from '../email-log/email-html.util';
import type { FollowUpKind } from './lead-followup';

type Line = { name?: string | null; size?: string | null; quantity?: number | null; priceKes?: number | null };
const NO_SIZE = /^(standard|one size|default)$/i;

/**
 * The email that follows up a lead or an abandoned cart. Customer-facing, so it says plainly why they are getting it and how to stop (reply),
 * links back to what they left, and invents nothing: only what was in the cart, what it comes to, and a way to carry on.
 * Pure (text in, text out), so the escaping of names the shopper typed is tested.
 */
export function leadFollowUpEmail(input: { kind: FollowUpKind; name?: string | null; lines: Line[]; total: number; link: string }): { subject: string; html: string } {
  const first = (input.name ?? '').trim().split(/\s+/)[0] ?? '';
  const greeting = !first || /\d|@/.test(first) || /^(walk-?in|guest|customer)$/i.test(first) ? 'there' : first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();

  const items = (input.lines ?? [])
    .filter((l) => (l?.name ?? '').trim())
    .slice(0, 8)
    .map((l) => {
      const size = (l.size ?? '').trim();
      const label = `${l.quantity && l.quantity > 1 ? `${l.quantity} x ` : ''}${(l.name ?? '').trim()}${size && !NO_SIZE.test(size) ? ` (size ${size})` : ''}`;
      return `<li>${escapeHtml(label)}</li>`;
    })
    .join('');
  const more = Math.max(0, (input.lines ?? []).length - 8);

  const cart = input.kind === 'ABANDONED_CART';
  const subject = cart ? 'You left something in your cart' : 'About the pair you asked about';
  const lead = cart ? "You've got these saved from your last visit:" : 'You asked us about these on WhatsApp:';
  const close = cart
    ? 'Head back whenever you are ready. Nothing has been charged. If you would like us to reserve them or arrange delivery or pickup, just reply to this email.'
    : 'If you would like to go ahead, just reply to this email with where to deliver and how you would like to pay, or take another look below.';

  const html = `<h2>Hi ${escapeHtml(greeting)}, ${cart ? 'your cart is still waiting' : 'still interested?'}</h2>
      <p>${lead}</p>
      <ul style="margin:0 0 16px">${items}${more ? `<li>...and ${more} more</li>` : ''}</ul>
      ${input.total > 0 ? `<p><strong>Total: ${money(input.total)}</strong></p>` : ''}
      <p>${close}</p>
      ${ctaButton(input.link, cart ? 'Return to your cart' : 'Take another look')}
      <p style="color:#5b6480;font-size:13px">You are getting this one message because you started an order at Drip Emporium. Not interested? Ignore it, or reply and tell us, and we will not write again.</p>`;
  return { subject, html };
}
