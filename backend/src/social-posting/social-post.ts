import { createHash } from 'crypto';

/** What the engine needs to know about a product that could be posted. Built from the storefront's own view of it. */
export type PostableProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  categoryName: string | null;
  imageUrl: string;
  priceFrom: number;
  priceTo: number;
  /** The best offer right now, when one is running. */
  offer: { price: number; was: number } | null;
  sizesInStock: string[];
  stockUnits: number;
  createdAt: Date;
};

export type PostContext = { origin: string; whatsapp: string; location: string; pageUrl?: string | null };

const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
const hash = (text: string) => createHash('sha256').update(text).digest().readUInt32BE(0);

/** Opening lines. One is chosen per product and day, so the Page does not read like the same post repeated. */
const OPENERS = [
  'Pick of the day ✨',
  'Still available 👀',
  'Fresh in stock 🔥',
  'Step up your style 👟',
  'Ready when you are 🛍️',
  'Have you seen this one? 😍',
  'Straight from our shelf 💯',
];

/** A product's own page, tagged so Insights counts the visit as coming from that channel, by the engine (campaign `autopost`) or the Status kit (`status`). */
export function postLink(origin: string, slug: string, channel: 'facebook' | 'threads' | 'whatsapp', campaign: 'autopost' | 'status' = 'autopost'): string {
  return `${origin.replace(/\/+$/, '')}/shop/${slug}?utm_source=${channel}&utm_medium=social&utm_campaign=${campaign}`;
}

/**
 * Sizes as short as they can be read: ["EUR 36","EUR 37","EUR 38","EUR 41"] -> "EUR 36–38, 41". Numbers that follow each other are a range, a shared
 * prefix ("EUR ") is said once, and anything that is not a number (S, M, L) is kept as it is, in the order given.
 */
export function compactSizes(sizes: string[]): string {
  const unique = [...new Set(sizes.map((s) => s.trim()).filter(Boolean))];
  const parsed = unique.map((s) => /^(.*?)(\d+)$/.exec(s));
  if (!unique.length) return '';
  const prefix = parsed[0]?.[1] ?? '';
  if (parsed.some((m) => !m || m[1] !== prefix)) return unique.join(', ');
  const numbers = parsed.map((m) => Number(m![2])).sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < numbers.length; ) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j += 1;
    runs.push(j > i ? `${numbers[i]}–${numbers[j]}` : String(numbers[i]));
    i = j + 1;
  }
  return `${prefix}${runs.join(', ')}`;
}

/** Kenyan numbers as people write them: 254113206481 -> 0113 206 481. Anything else is returned as given. */
export function formatKenyanPhone(digits: string): string {
  const d = digits.replace(/\D/g, '');
  const m = /^254(\d{3})(\d{3})(\d{3})$/.exec(d);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : digits;
}

/** The text that goes with a Status: the details and a tagged link, short enough to read in a glance. Status replies reach the shop's chat, so it says to reply. */
export function buildStatusCaption(product: PostableProduct, ctx: PostContext): string {
  const price = product.offer
    ? `🔥 ${kes(product.offer.price)} (was ${kes(product.offer.was)})`
    : product.priceFrom === product.priceTo || !product.priceTo ? `💰 ${kes(product.priceFrom)}` : `💰 From ${kes(product.priceFrom)}`;
  const sizes = compactSizes(product.sizesInStock);
  return [
    product.name,
    price,
    sizes ? `📏 ${sizes}` : null,
    '',
    '💬 Reply to this status to order',
    `🛒 ${postLink(ctx.origin, product.slug, 'whatsapp', 'status')}`,
  ].filter((l) => l !== null).join('\n');
}

/** Sizes in a short readable run: ["40","41","42"] -> "40, 41, 42". More than ten are cut so the post stays short. */
function sizeLine(sizes: string[]): string | null {
  const unique = [...new Set(sizes.map((s) => s.trim()).filter(Boolean))];
  if (!unique.length) return null;
  const numeric = unique.every((s) => /^\d+(\.\d+)?$/.test(s));
  const ordered = numeric ? unique.sort((a, b) => Number(a) - Number(b)) : unique;
  const shown = ordered.slice(0, 10).join(', ');
  return ordered.length > 10 ? `${shown} and more` : shown;
}

/** The post text. Same facts every time (name, price, sizes, how to buy), a different opening and hashtags by product and day. */
export function buildCaption(product: PostableProduct, ctx: PostContext, day: string): string {
  const opener = OPENERS[hash(`${product.id}:${day}`) % OPENERS.length];
  const price = product.offer
    ? `🔥 ${kes(product.offer.price)} (was ${kes(product.offer.was)})`
    : product.priceFrom === product.priceTo || !product.priceTo
      ? `💰 ${kes(product.priceFrom)}`
      : `💰 From ${kes(product.priceFrom)}`;
  const sizes = sizeLine(product.sizesInStock);
  const brandTag = product.brand ? `#${product.brand.replace(/[^A-Za-z0-9]/g, '')}` : '';
  const lines = [
    opener,
    '',
    product.name,
    price,
    sizes ? `📏 Sizes available: ${sizes}` : null,
    '',
    `🛒 Order online: ${postLink(ctx.origin, product.slug, 'facebook')}`,
    ctx.whatsapp ? `💬 WhatsApp: ${ctx.whatsapp}` : null,
    ctx.location ? `📍 ${ctx.location}` : null,
    '',
    ['#DripEmporium', '#NairobiShoes', brandTag].filter(Boolean).join(' '),
  ];
  return lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Threads allows 500 characters a post; a margin is left because emoji and links are counted generously. */
export const THREADS_LIMIT = 480;
const length = (text: string) => Array.from(text).length;

/**
 * The same post for Threads: shorter and plainer, always within its 500 characters. Name, price, the link and WhatsApp come first;
 * when the text is too long the location goes, then the sizes, then the name is cut, so the link and the price are never lost.
 */
export function buildThreadsCaption(product: PostableProduct, ctx: PostContext, day: string): string {
  const opener = OPENERS[hash(`${product.id}:${day}:threads`) % OPENERS.length];
  const price = product.offer
    ? `🔥 ${kes(product.offer.price)} (was ${kes(product.offer.was)})`
    : product.priceFrom === product.priceTo || !product.priceTo ? `💰 ${kes(product.priceFrom)}` : `💰 From ${kes(product.priceFrom)}`;
  const sizes = sizeLine(product.sizesInStock);
  const link = `🛒 ${postLink(ctx.origin, product.slug, 'threads')}`;
  const compose = (name: string, opts: { sizes: boolean; location: boolean; whatsapp: boolean }) =>
    [opener, '', name, opts.sizes && sizes ? `${price} · 📏 ${sizes}` : price, '', link, opts.whatsapp && ctx.whatsapp ? `💬 ${ctx.whatsapp}` : null, opts.location && ctx.location ? `📍 ${ctx.location}` : null]
      .filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  for (const opts of [
    { sizes: true, location: true, whatsapp: true },
    { sizes: true, location: false, whatsapp: true },
    { sizes: false, location: false, whatsapp: true },
    { sizes: false, location: false, whatsapp: false },
  ]) {
    const text = compose(product.name, opts);
    if (length(text) <= THREADS_LIMIT) return text;
  }
  const bare = { sizes: false, location: false, whatsapp: false };
  // Measured with a one-letter name: an empty one would collapse a blank line and read one character short.
  const maxName = THREADS_LIMIT - length(compose('x', bare)) + 1;
  return compose(`${Array.from(product.name).slice(0, Math.max(10, maxName - 1)).join('').trim()}…`, bare);
}

/** Whether a product is good enough to put on the brand's Page unattended. */
export function isPostable(p: (Omit<Partial<PostableProduct>, 'imageUrl'> & { imageUrl?: string | null }) | null | undefined): p is PostableProduct {
  if (!p) return false;
  if (!p.name || p.name.trim().length < 3 || p.name.length > 120) return false;
  if (!p.imageUrl || !/^https:\/\//i.test(p.imageUrl)) return false;
  if (!p.priceFrom || p.priceFrom <= 0) return false;
  if (!p.slug || !p.id) return false;
  return true;
}

// --- when ---------------------------------------------------------------------------------------------------------------

const NAIROBI_OFFSET_MS = 3 * 3_600_000;

/** "2026-11-08" and minutes since midnight, Nairobi time (no daylight saving there, always UTC+3). */
export function nairobiParts(now: Date): { day: string; minutes: number } {
  const local = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  return { day: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

const parseTime = (t: string): number | null => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Normalises "9:00" to "09:00", drops anything that is not a time, sorts, removes repeats, keeps six at most. */
export function cleanTimes(times: string[]): string[] {
  const minutes = [...new Set(times.map(parseTime).filter((m): m is number => m !== null))].sort((a, b) => a - b).slice(0, 6);
  return minutes.map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
}

/** How long after its time a slot can still be posted. A deploy or an outage may delay a post, but a slot hours old is dropped. */
export const SLOT_GRACE_MINUTES = 90;

/** The slots that are due now: their time has passed, by no more than the grace. Each is "day@HH:MM". */
export function dueSlots(now: Date, times: string[]): Array<{ slotKey: string; scheduledFor: Date }> {
  const { day, minutes } = nairobiParts(now);
  const out: Array<{ slotKey: string; scheduledFor: Date }> = [];
  for (const time of cleanTimes(times)) {
    const at = parseTime(time)!;
    if (minutes >= at && minutes - at <= SLOT_GRACE_MINUTES) {
      out.push({ slotKey: `${day}@${time}`, scheduledFor: new Date(Date.parse(`${day}T${time}:00.000Z`) - NAIROBI_OFFSET_MS) });
    }
  }
  return out;
}

/** The next time a post is due after `now`, Nairobi wall time, for the screen. */
export function nextSlot(now: Date, times: string[]): Date | null {
  const list = cleanTimes(times);
  if (!list.length) return null;
  const { day, minutes } = nairobiParts(now);
  for (const time of list) if (parseTime(time)! > minutes) return new Date(Date.parse(`${day}T${time}:00.000Z`) - NAIROBI_OFFSET_MS);
  const tomorrow = new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${tomorrow}T${list[0]}:00.000Z`) - NAIROBI_OFFSET_MS);
}

// --- which ---------------------------------------------------------------------------------------------------------------

export type PickInput = {
  candidates: PostableProduct[];
  /** When each product was last posted to this channel. */
  lastPosted: Map<string, Date>;
  /** The brand of the most recent post, so two of the same brand do not run back to back when there is a choice. */
  lastBrand?: string | null;
  now: Date;
  cooldownDays: number;
};

/** How attractive a product is to post, from what the shelf can sell: sizes to choose from, depth of stock, a running offer, newness. */
export function score(p: PostableProduct, now: Date): number {
  const ageDays = (now.getTime() - p.createdAt.getTime()) / 86_400_000;
  return Math.min(p.sizesInStock.length, 6) * 2 + Math.min(p.stockUnits, 20) / 5 + (p.offer ? 3 : 0) + (ageDays < 14 ? 3 : 0);
}

/**
 * The next product to post. Never-posted products come first (best score first), then whichever was posted longest ago. A product
 * posted within the cooldown is passed over; if that leaves nothing (a small shop), the one posted longest ago goes again, as long
 * as it was at least a week ago. Two posts of the same brand in a row are avoided when there is another choice.
 */
export function pickProduct(input: PickInput): PostableProduct | null {
  const { candidates, lastPosted, now, cooldownDays } = input;
  const dayMs = 86_400_000;
  const since = (p: PostableProduct) => {
    const at = lastPosted.get(p.id);
    return at ? (now.getTime() - at.getTime()) / dayMs : Infinity;
  };
  const order = (a: PostableProduct, b: PostableProduct) => {
    const sa = since(a), sb = since(b);
    if (sa !== sb) return sb - sa; // longest ago (or never) first
    return score(b, now) - score(a, now) || a.id.localeCompare(b.id);
  };
  let pool = candidates.filter((p) => since(p) >= cooldownDays).sort(order);
  if (!pool.length) pool = candidates.filter((p) => since(p) >= 7).sort(order);
  if (!pool.length) return null;
  const brand = (input.lastBrand ?? '').toLowerCase();
  return (brand ? pool.find((p) => (p.brand ?? '').toLowerCase() !== brand) : null) ?? pool[0];
}
