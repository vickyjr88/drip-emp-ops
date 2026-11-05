import { BadRequestException } from '@nestjs/common';

/**
 * Rules for a template staff upload: photos per colour and the print areas marked on them. Pure, so the same checks run
 * on create and update and are tested without a database.
 */

export type Area = { x: number; y: number; w: number; h: number };
export type TemplateColour = { key: string; label: string; hex: string; front: string; back: string };
export type TemplateAreas = { frontCentre?: Area; backName?: Area; backNumber?: Area };

const HEX = /^#[0-9a-f]{6}$/i;
/** Photos come from the media library, so they are addresses on this site's own media route. */
const MEDIA_URL = /^https?:\/\/[^\s/]+\/media\/[^\s?#]+$/i;
const AREA_NAMES = ['frontCentre', 'backName', 'backNumber'] as const;
const MIN_AREA = 0.04;

const fail = (message: string): never => {
  throw new BadRequestException(message);
};

export function cleanArea(raw: any, label: string): Area {
  if (!raw || typeof raw !== 'object') return fail(`Mark the ${label} on the photo.`);
  const [x, y, w, h] = [raw.x, raw.y, raw.w, raw.h].map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return fail(`The ${label} is not valid.`);
  if (x < 0 || y < 0 || w < MIN_AREA || h < MIN_AREA || x + w > 1.001 || y + h > 1.001) {
    return fail(`The ${label} must be inside the photo and not tiny.`);
  }
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return { x: round(x), y: round(y), w: round(Math.min(w, 1 - x)), h: round(Math.min(h, 1 - y)) };
}

/** A jersey needs the back name and number areas; a T-shirt needs a front and a back print area. */
export function cleanAreas(raw: any, kind: 'JERSEY' | 'TSHIRT'): TemplateAreas {
  const out: TemplateAreas = {};
  const needed = kind === 'JERSEY' ? (['backName', 'backNumber'] as const) : (['frontCentre', 'backNumber'] as const);
  for (const name of AREA_NAMES) {
    const wanted = (needed as readonly string[]).includes(name);
    if (raw?.[name]) out[name] = cleanArea(raw[name], labelFor(name, kind));
    else if (wanted) fail(`Mark the ${labelFor(name, kind)} on the photo.`);
  }
  return out;
}

export const labelFor = (name: string, kind: 'JERSEY' | 'TSHIRT') =>
  ({ frontCentre: 'front print area', backName: 'name area', backNumber: kind === 'JERSEY' ? 'number area' : 'back print area' } as Record<string, string>)[name] ?? name;

export function cleanColours(raw: any): TemplateColour[] {
  if (!Array.isArray(raw) || raw.length === 0) return fail('Add at least one colour, with a front and a back photo.');
  if (raw.length > 16) return fail('A template can have up to 16 colours.');
  const seen = new Set<string>();
  return raw.map((c: any, i: number) => {
    const label = String(c?.label ?? '').trim().slice(0, 30);
    if (!label) fail(`Colour ${i + 1} needs a name.`);
    if (!HEX.test(String(c?.hex ?? ''))) fail(`${label}: choose its colour (used for the swatch and the print shop).`);
    const key = String(c?.key || label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `colour-${i + 1}`;
    if (seen.has(key)) fail(`Two colours are both called "${label}".`);
    seen.add(key);
    for (const side of ['front', 'back'] as const) {
      if (!MEDIA_URL.test(String(c?.[side] ?? ''))) fail(`${label}: choose a ${side} photo from your media library.`);
    }
    return { key, label, hex: String(c.hex).toLowerCase(), front: String(c.front), back: String(c.back) };
  });
}

export function cleanAspect(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0.3 && n <= 3 ? Math.round(n * 1000) / 1000 : 1;
}

export const templateKeyFor = (name: string, taken: Set<string>): string => {
  const root = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shirt'}`.slice(0, 48);
  let key = root;
  for (let n = 2; taken.has(key); n++) key = `${root}-${n}`;
  return key;
};
