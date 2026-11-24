import { greetingName } from './follow-up';
import { normalizePhoneNumber } from './phone.util';

/**
 * The receipt for an order, as a WhatsApp message staff send after keying it in: what was bought, what it came to, what has been paid
 * and what is still owing. Like the follow-up it is only a wa.me link that opens the chat with the text ready. Nothing is sent from here;
 * staff read it, change it if they like, and press send. Built on the server so the wording lives in one place and is tested.
 */

export type ReceiptLine = { name: string; size?: string | null; quantity: number; lineTotal: number };
export type ReceiptPayment = { method: string; amount: number };

export type ReceiptInput = {
  orderNumber: string;
  storeName: string;
  placedAt: Date | string;
  name?: string | null;
  phone?: string | null;
  lines: ReceiptLine[];
  discount: number;
  shipping: number;
  total: number;
  paid: number;
  payments: ReceiptPayment[];
};

export type Receipt = { phone: string; message: string; url: string };

const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
const NO_SIZE = /^(standard|one size|default)$/i;
const METHOD: Record<string, string> = { MPESA: 'M-Pesa', CASH: 'cash', CARD: 'card', BANK_TRANSFER: 'bank transfer' };
const MAX_LINES = 12;

function dateLabel(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });
}

/** The receipt for one order, or null when there is no number to send it to or nothing on it. */
export function buildReceipt(input: ReceiptInput): Receipt | null {
  const normalised = input.phone ? normalizePhoneNumber(input.phone) : null;
  const phone = normalised ? normalised.replace(/\D/g, '') : '';
  if (!phone || input.lines.length === 0) return null;

  const shown = input.lines.slice(0, MAX_LINES);
  const rows = shown.map((line, i) => {
    const size = line.size?.trim() && !NO_SIZE.test(line.size.trim()) ? `, size ${line.size.trim()}` : '';
    return `${i + 1}. ${line.name}${size} (x${line.quantity}): ${kes(line.lineTotal)}`;
  });
  if (input.lines.length > shown.length) rows.push(`...and ${input.lines.length - shown.length} more.`);

  const balance = Math.max(0, Math.round((input.total - input.paid) * 100) / 100);
  const methods = [...new Set(input.payments.map((p) => METHOD[p.method] ?? p.method.toLowerCase()))].join(', ');
  const money = [
    ...(input.discount > 0 ? [`Discount: -${kes(input.discount)}`] : []),
    ...(input.shipping > 0 ? [`Delivery: ${kes(input.shipping)}`] : []),
    `Total: ${kes(input.total)}`,
    input.paid > 0 ? `Paid: ${kes(input.paid)}${methods ? ` (${methods})` : ''}` : 'Paid: nothing yet',
    balance > 0 ? `Balance to pay: ${kes(balance)}` : 'Balance: settled',
  ];

  const message = [
    `Hi ${greetingName(input.name)}, thank you for shopping at Drip Emporium (${input.storeName}).`,
    '',
    `Receipt ${input.orderNumber}, ${dateLabel(input.placedAt)}`,
    ...rows,
    '',
    ...money,
    '',
    balance > 0 ? 'Send us the M-Pesa code when you have paid and we will confirm it.' : 'Thank you. We hope to see you again.',
  ].join('\n');

  return { phone, message, url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` };
}
