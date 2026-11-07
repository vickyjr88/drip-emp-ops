import { normalizePhoneNumber } from './phone.util';

/**
 * The WhatsApp message staff send to follow up on a cart someone left, or on an order: what was in it, what it comes to, and
 * a link to each product so the customer can look again or pick up where they stopped. Built here rather than in the portal
 * so the wording lives in one place, the product links use the real storefront address, and it is tested.
 *
 * Nothing is sent from here. The result is a wa.me link that opens the conversation with the text ready; staff read it,
 * change it if they like, and press send themselves.
 */

export type FollowUpLine = {
  name: string;
  size?: string | null;
  quantity: number;
  /** What one costs the customer. */
  unitPrice: number;
  /** The product page on the storefront (/shop/x, /watches/x, /kits/x); absent for a size typed by hand, which has no page. */
  path?: string | null;
};

export type FollowUpKind = 'ABANDONED_CART' | 'WHATSAPP_ORDER' | 'ORDER';

export type FollowUpInput = {
  kind: FollowUpKind;
  name?: string | null;
  phone?: string | null;
  lines: FollowUpLine[];
  total: number;
  /** ORDER only. */
  orderNumber?: string;
  orderStatus?: string;
  balance?: number;
  /** The storefront's own address, no trailing slash. */
  origin: string;
};

export type FollowUp = { phone: string; message: string; url: string };

const MAX_LINES = 8;
const NO_SIZE = /^(standard|one size|default)$/i;

/** The page a product lives at on the storefront: shoes in the shop, watches and kits in their own sections. */
export function productPath(product: { slug: string; line?: string | null }): string {
  if (product.line === 'WATCH') return `/watches/${product.slug}`;
  if (product.line === 'KIT') return `/kits/${product.slug}`;
  return `/shop/${product.slug}`;
}

const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

/** "Wanjiru Kamau" becomes "Wanjiru"; a walk-in, or no name at all, becomes "there". */
export function greetingName(name?: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  if (!first || /^(walk-?in|guest|customer)$/i.test(first)) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** The link carries a tag, so a visit that comes back through it shows up in Insights as WhatsApp follow-up traffic. */
function tagged(origin: string, path: string, campaign: string): string {
  return `${origin}${path}?utm_source=whatsapp&utm_medium=followup&utm_campaign=${campaign}`;
}

function itemsBlock(lines: FollowUpLine[], origin: string, campaign: string): string {
  const shown = lines.slice(0, MAX_LINES);
  const seen = new Set<string>();
  const rows = shown.map((line, i) => {
    // "Standard" is what a product with no sizes (a watch) is stored as; it is not something to tell a customer.
    const size = line.size?.trim() && !NO_SIZE.test(line.size.trim()) ? `, size ${line.size.trim()}` : '';
    const head = `${i + 1}. ${line.name}${size} (x${line.quantity}): ${kes(line.unitPrice * line.quantity)}`;
    // One link per product, even when it appears in two sizes.
    if (!line.path || seen.has(line.path)) return head;
    seen.add(line.path);
    return `${head}\n   ${tagged(origin, line.path, campaign)}`;
  });
  const more = lines.length - shown.length;
  if (more > 0) rows.push(`...and ${more} more.`);
  return rows.join('\n');
}

/** The opening and closing lines for each situation, so the middle (the items and the total) reads the same everywhere. */
function wording(input: FollowUpInput): { intro: string; outro: string; campaign: string } | null {
  const hi = `Hi ${greetingName(input.name)}, it's Drip Emporium.`;
  switch (input.kind) {
    case 'ABANDONED_CART':
      return {
        intro: `${hi} You left these in your cart:`,
        outro: "Still keen? Reply here and we'll reserve them for you and arrange delivery or pickup.",
        campaign: 'abandoned-cart',
      };
    case 'WHATSAPP_ORDER':
      return {
        intro: `${hi} Following up on the order you asked about:`,
        outro: 'Shall we go ahead? Tell us where to deliver and how you would like to pay.',
        campaign: 'whatsapp-order',
      };
    case 'ORDER': {
      const ref = input.orderNumber ? ` ${input.orderNumber}` : '';
      switch (input.orderStatus) {
        case 'PENDING':
          return {
            intro: `${hi} Thank you for your order${ref}:`,
            outro: `${input.balance && input.balance > 0 ? `Balance to pay: ${kes(input.balance)}. ` : ''}How would you like to pay? Once it is in we will get your order ready.`,
            campaign: 'order-payment',
          };
        case 'PAID':
        case 'PACKED':
          return { intro: `${hi} Your order${ref} is confirmed and we are getting it ready:`, outro: 'We will message you to arrange delivery.', campaign: 'order-update' };
        case 'SHIPPED':
          return { intro: `${hi} Your order${ref} is on its way:`, outro: 'Let us know when it arrives, or if you need anything.', campaign: 'order-update' };
        case 'DELIVERED':
          return {
            intro: `${hi} We hope you are enjoying your order${ref}:`,
            outro: 'If you like them, a photo of you wearing them would make our day. Tell us if you would like to see what is new.',
            campaign: 'order-thanks',
          };
        default:
          // A cancelled or refunded order is not something to follow up on.
          return null;
      }
    }
  }
}

/** The follow-up for one cart or order, or null when there is nobody to send it to or nothing to say. */
export function buildFollowUp(input: FollowUpInput): FollowUp | null {
  const normalised = input.phone ? normalizePhoneNumber(input.phone) : null;
  const phone = normalised ? normalised.replace(/\D/g, '') : '';
  if (!phone || input.lines.length === 0) return null;
  const text = wording(input);
  if (!text) return null;

  const message = [
    text.intro,
    '',
    itemsBlock(input.lines, input.origin, text.campaign),
    '',
    `Total: ${kes(input.total)}`,
    '',
    text.outro,
  ].join('\n');

  return { phone, message, url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` };
}
