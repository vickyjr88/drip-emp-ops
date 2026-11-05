import { BadRequestException } from '@nestjs/common';
import {
  KIT_FONT_KEYS, KIT_PATTERNS, KIT_TEMPLATE_KEYS, KitColors, PrintPricing,
} from './kit-catalogue';

/**
 * What a shopper made in the design center, and the rules it must satisfy. Pure functions only: the same code
 * validates a design when it is saved, prices it at checkout and (through the frozen copy on the order line) is what
 * staff print from. The client's idea of the price is never used.
 */

export type DesignItem = {
  id: string;
  kind: 'text' | 'artwork';
  side: 'front' | 'back';
  /** text items only */
  text?: string;
  fontKey?: string;
  color?: string;
  /** artwork items only: an address on this site's own media route */
  artworkUrl?: string;
  /** Centre of the item inside the shirt's print area, 0 to 1 on each axis. */
  x: number;
  y: number;
  /** Width as a fraction of the print area, 0.1 to 1. */
  scale: number;
  rotation: number;
};

export type DesignSpec = {
  v: 1;
  templateKey: string;
  productSlug?: string;
  colors: KitColors;
  name?: { text: string; fontKey: string; color: string };
  number?: { value: string; fontKey: string; color: string };
  items: DesignItem[];
};

export const MAX_NAME_LENGTH = 12;
export const MAX_ITEM_TEXT = 24;
export const MAX_ITEMS = 6;

const HEX = /^#[0-9a-f]{6}$/i;
/** Kit artwork is re-encoded to PNG and stored under the media route, whatever the shopper uploaded. */
const ARTWORK_URL = /^https?:\/\/[^/\s]+\/media\/[0-9a-f-]{36}\.png$/i;

/** Words that may not be printed. Compared after lower-casing, removing look-alike digits and non-letters. */
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'rape', 'nigger', 'nigga', 'faggot', 'nazi', 'hitler', 'isis',
];

export function isBlockedText(text: string): boolean {
  const flat = text
    .toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/\$/g, 's').replace(/@/g, 'a')
    .replace(/[^a-z]/g, '');
  return BLOCKED.some((word) => flat.includes(word));
}

const fail = (message: string): never => {
  throw new BadRequestException(message);
};

const clampNumber = (value: unknown, min: number, max: number, label: string): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) fail(`${label} is out of range.`);
  return n;
};

const colour = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !HEX.test(value)) fail(`${label} must be a colour like #1a2b3c.`);
  return (value as string).toLowerCase();
};

const fontKey = (value: unknown): string => {
  if (typeof value !== 'string' || !KIT_FONT_KEYS.includes(value)) fail('That font is not available.');
  return value as string;
};

/** The name as it is printed: letters, spaces, hyphen, apostrophe and full stop, upper-cased, 12 at most. */
export function cleanName(raw: unknown): string {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!text) return fail('Type a name, or remove it.');
  if (text.length > MAX_NAME_LENGTH) fail(`A name can be up to ${MAX_NAME_LENGTH} characters.`);
  if (!/^[\p{L}][\p{L} '.\-]*$/u.test(text)) fail('A name can use letters, spaces, hyphens, apostrophes and full stops.');
  if (isBlockedText(text)) fail('That name cannot be printed.');
  return text;
}

export function cleanNumber(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,2}$/.test(text)) return fail('A number is 0 to 99.');
  return String(Number(text));
}

function cleanColors(raw: any): KitColors {
  if (!raw || typeof raw !== 'object') fail('The shirt colours are missing.');
  const pattern = raw.pattern;
  if (!KIT_PATTERNS.includes(pattern)) fail('Unknown shirt pattern.');
  if (raw.sleeves !== 'primary' && raw.sleeves !== 'secondary') fail('Unknown sleeve colour.');
  return {
    primary: colour(raw.primary, 'The shirt colour'),
    secondary: colour(raw.secondary, 'The second shirt colour'),
    trim: colour(raw.trim, 'The trim colour'),
    pattern,
    sleeves: raw.sleeves,
  };
}

function cleanItem(raw: any, index: number): DesignItem {
  if (!raw || typeof raw !== 'object') fail('A design item is not valid.');
  const kind = raw.kind;
  const side = raw.side;
  if (kind !== 'text' && kind !== 'artwork') fail('A design item has an unknown type.');
  if (side !== 'front' && side !== 'back') fail('A design item has an unknown side.');
  const base = {
    id: String(raw.id || `item-${index}`).slice(0, 40),
    kind,
    side,
    x: clampNumber(raw.x, 0, 1, 'Position'),
    y: clampNumber(raw.y, 0, 1, 'Position'),
    scale: clampNumber(raw.scale, 0.1, 1, 'Size'),
    rotation: clampNumber(raw.rotation ?? 0, -180, 180, 'Rotation'),
  } as DesignItem;

  if (kind === 'text') {
    const text = String(raw.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) fail('Type some text, or remove the text item.');
    if (text.length > MAX_ITEM_TEXT) fail(`Text can be up to ${MAX_ITEM_TEXT} characters.`);
    if (isBlockedText(text)) fail('That text cannot be printed.');
    return { ...base, text, fontKey: fontKey(raw.fontKey), color: colour(raw.color, 'The text colour') };
  }
  const url = String(raw.artworkUrl ?? '');
  if (!ARTWORK_URL.test(url)) fail('The artwork must be an image uploaded here.');
  return { ...base, artworkUrl: url };
}

export type KitRules = { allowName: boolean; allowNumber: boolean; allowArtwork: boolean; templateKey: string };

/** Checks a design against the rules for the kit it is for and returns the cleaned copy that is stored and printed. */
export function cleanDesign(raw: any, rules: KitRules): DesignSpec {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) fail('This design is not in a supported format.');
  if (!KIT_TEMPLATE_KEYS.includes(raw.templateKey)) fail('Unknown shirt template.');
  if (raw.templateKey !== rules.templateKey) fail('This design was made for a different shirt.');

  const spec: DesignSpec = {
    v: 1,
    templateKey: raw.templateKey,
    ...(raw.productSlug ? { productSlug: String(raw.productSlug).slice(0, 120) } : {}),
    colors: cleanColors(raw.colors),
    items: [],
  };

  if (raw.name) {
    if (!rules.allowName) fail('A name cannot be printed on this shirt.');
    spec.name = { text: cleanName(raw.name.text), fontKey: fontKey(raw.name.fontKey), color: colour(raw.name.color, 'The name colour') };
  }
  if (raw.number) {
    if (!rules.allowNumber) fail('A number cannot be printed on this shirt.');
    spec.number = { value: cleanNumber(raw.number.value), fontKey: fontKey(raw.number.fontKey), color: colour(raw.number.color, 'The number colour') };
  }
  const items = Array.isArray(raw.items) ? raw.items : [];
  if (items.length > MAX_ITEMS) fail(`A design can have up to ${MAX_ITEMS} items.`);
  if (items.length && !rules.allowArtwork) fail('Artwork and text cannot be added to this shirt.');
  spec.items = items.map((item: unknown, index: number) => cleanItem(item, index));
  return spec;
}

export function isPersonalised(spec: DesignSpec): boolean {
  return Boolean(spec.name || spec.number || spec.items.length);
}

/** The print fee for a design, in whole shillings. */
export function printFee(spec: DesignSpec, pricing: PrintPricing): number {
  let fee = 0;
  if (spec.name && spec.number) fee += pricing.nameAndNumberFeeKes;
  else {
    if (spec.name) fee += pricing.nameFeeKes;
    if (spec.number) fee += pricing.numberFeeKes;
  }
  for (const item of spec.items) fee += item.kind === 'artwork' ? pricing.artworkFeeKes : pricing.textFeeKes;
  return Math.round(fee);
}

/** What staff see in the print queue, in words. */
export function describeDesign(spec: DesignSpec): string {
  const parts: string[] = [];
  if (spec.name) parts.push(`Name "${spec.name.text}" (${spec.name.fontKey})`);
  if (spec.number) parts.push(`Number ${spec.number.value} (${spec.number.fontKey})`);
  for (const item of spec.items) {
    parts.push(item.kind === 'text' ? `${item.side} text "${item.text}" (${item.fontKey})` : `${item.side} artwork`);
  }
  return parts.join('; ');
}
