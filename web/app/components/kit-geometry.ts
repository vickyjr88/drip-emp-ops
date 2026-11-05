/**
 * The shirt's geometry and colour patterns as plain data, with no React in it, so the browser drawing (kit-shirt.tsx)
 * and the server-side PNG for feeds and link previews (kit-shirt-svg.ts) draw from one source and cannot drift apart.
 */

export type KitPattern = 'solid' | 'stripes' | 'hoops' | 'halves' | 'sash' | 'pinstripe';
export type KitColors = { primary: string; secondary: string; trim: string; pattern: KitPattern; sleeves: 'primary' | 'secondary' };
export type PrintArea = { x: number; y: number; w: number; h: number };

export type DesignItem = {
  id: string;
  kind: 'text' | 'artwork';
  side: 'front' | 'back';
  text?: string;
  fontKey?: string;
  color?: string;
  artworkUrl?: string;
  x: number;
  y: number;
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

export const VIEWBOX = { w: 400, h: 440 };

export type Shape = {
  outline: string;
  outlineBack?: string;
  sleeveL: string;
  sleeveR: string;
  cuffL: [number, number, number, number];
  cuffR: [number, number, number, number];
  neckFront: string;
  neckBack: string;
  collar?: string;
};

export const SHAPES: Record<string, Shape> = {
  'jersey-short': {
    outline: 'M135 50 L40 120 L72 178 L112 152 L112 400 L288 400 L288 152 L328 178 L360 120 L265 50 Q200 105 135 50 Z',
    sleeveL: 'M135 50 L40 120 L72 178 L112 152 L120 80 Z',
    sleeveR: 'M265 50 L360 120 L328 178 L288 152 L280 80 Z',
    cuffL: [40, 120, 72, 178],
    cuffR: [360, 120, 328, 178],
    neckFront: 'M135 50 Q200 105 265 50',
    neckBack: 'M135 50 Q200 72 265 50',
  },
  'jersey-long': {
    outline: 'M135 50 L40 108 L14 288 L56 296 L92 178 L112 152 L112 400 L288 400 L288 152 L308 178 L344 296 L386 288 L360 108 L265 50 Q200 105 135 50 Z',
    sleeveL: 'M135 50 L40 108 L14 288 L56 296 L92 178 L112 152 L120 80 Z',
    sleeveR: 'M265 50 L360 108 L386 288 L344 296 L308 178 L288 152 L280 80 Z',
    cuffL: [14, 288, 56, 296],
    cuffR: [386, 288, 344, 296],
    neckFront: 'M135 50 Q200 105 265 50',
    neckBack: 'M135 50 Q200 72 265 50',
  },
  'jersey-retro': {
    outline: 'M135 50 L40 120 L72 178 L112 152 L112 400 L288 400 L288 152 L328 178 L360 120 L265 50 Q200 105 135 50 Z',
    sleeveL: 'M135 50 L40 120 L72 178 L112 152 L120 80 Z',
    sleeveR: 'M265 50 L360 120 L328 178 L288 152 L280 80 Z',
    cuffL: [40, 120, 72, 178],
    cuffR: [360, 120, 328, 178],
    neckFront: 'M135 50 Q200 105 265 50',
    neckBack: 'M135 50 Q200 72 265 50',
    collar: 'M128 52 L162 36 L200 96 L238 36 L272 52 L248 70 L200 124 L152 70 Z',
  },
  'tee-crew': {
    outline: 'M142 56 L64 108 L90 160 L118 144 L118 396 L282 396 L282 144 L310 160 L336 108 L258 56 Q200 98 142 56 Z',
    sleeveL: 'M142 56 L64 108 L90 160 L118 144 Z',
    sleeveR: 'M258 56 L336 108 L310 160 L282 144 Z',
    cuffL: [64, 108, 90, 160],
    cuffR: [336, 108, 310, 160],
    neckFront: 'M142 56 Q200 98 258 56',
    neckBack: 'M142 56 Q200 76 258 56',
  },
  'tee-vneck': {
    outline: 'M142 56 L64 108 L90 160 L118 144 L118 396 L282 396 L282 144 L310 160 L336 108 L258 56 L200 122 Z',
    outlineBack: 'M142 56 L64 108 L90 160 L118 144 L118 396 L282 396 L282 144 L310 160 L336 108 L258 56 Q200 76 142 56 Z',
    sleeveL: 'M142 56 L64 108 L90 160 L118 144 Z',
    sleeveR: 'M258 56 L336 108 L310 160 L282 144 Z',
    cuffL: [64, 108, 90, 160],
    cuffR: [336, 108, 310, 160],
    neckFront: 'M142 56 L200 122 L258 56',
    neckBack: 'M142 56 Q200 76 258 56',
  },
  'tee-oversized': {
    outline: 'M128 62 L44 122 L70 174 L96 158 L90 402 L310 402 L304 158 L330 174 L356 122 L272 62 Q200 104 128 62 Z',
    sleeveL: 'M128 62 L44 122 L70 174 L96 158 Z',
    sleeveR: 'M272 62 L356 122 L330 174 L304 158 Z',
    cuffL: [44, 122, 70, 174],
    cuffR: [356, 122, 330, 174],
    neckFront: 'M128 62 Q200 104 272 62',
    neckBack: 'M128 62 Q200 82 272 62',
  },
};

export const JERSEY_AREAS: Record<string, PrintArea> = {
  frontChest: { x: 140, y: 108, w: 120, h: 96 },
  frontCentre: { x: 120, y: 120, w: 160, h: 190 },
  backName: { x: 110, y: 92, w: 180, h: 46 },
  backNumber: { x: 120, y: 146, w: 160, h: 190 },
};
export const TEE_AREAS: Record<string, PrintArea> = {
  frontChest: { x: 150, y: 100, w: 100, h: 90 },
  frontCentre: { x: 110, y: 100, w: 180, h: 230 },
  backName: { x: 120, y: 84, w: 160, h: 40 },
  backNumber: { x: 110, y: 130, w: 180, h: 200 },
};

export const areasFor = (templateKey: string) => (templateKey.startsWith('tee') ? TEE_AREAS : JERSEY_AREAS);


/** The coloured bands that make a pattern, as shapes to draw over the base colour inside the shirt's outline. */
export type Band = { shape: 'rect'; x: number; y: number; w: number; h: number; opacity?: number } | { shape: 'polygon'; points: string };

export function patternBands(pattern: KitPattern): Band[] {
  const bands: Band[] = [];
  if (pattern === 'stripes') for (let x = 4; x < 400; x += 40) bands.push({ shape: 'rect', x, y: 0, w: 20, h: 440 });
  else if (pattern === 'hoops') for (let y = 36; y < 440; y += 56) bands.push({ shape: 'rect', x: 0, y, w: 400, h: 28 });
  else if (pattern === 'halves') bands.push({ shape: 'rect', x: 200, y: 0, w: 200, h: 440 });
  else if (pattern === 'sash') bands.push({ shape: 'polygon', points: '118,40 190,40 300,420 226,420' });
  else if (pattern === 'pinstripe') for (let x = 6; x < 400; x += 14) bands.push({ shape: 'rect', x, y: 0, w: 2.4, h: 440, opacity: 0.65 });
  return bands;
}

export const SHAPE_KEYS = Object.keys(SHAPES);

/**
 * Where a photo sits inside the shirt drawing's 400 x 440 box when it is fitted (never stretched). Staff photos can be any
 * shape; the print areas marked on them are fractions of the photo, so they are mapped through this box.
 */
export function photoBox(aspect: number): PrintArea {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : VIEWBOX.w / VIEWBOX.h;
  if (a >= VIEWBOX.w / VIEWBOX.h) {
    const h = VIEWBOX.w / a;
    return { x: 0, y: (VIEWBOX.h - h) / 2, w: VIEWBOX.w, h };
  }
  const w = VIEWBOX.h * a;
  return { x: (VIEWBOX.w - w) / 2, y: 0, w, h: VIEWBOX.h };
}

/** Print areas marked as fractions of a photo, as drawing units; any area not marked falls back to the drawn shirt's own. */
export function areasFromFractions(fractions: Record<string, PrintArea> | null | undefined, aspect: number | null | undefined, kind: 'JERSEY' | 'TSHIRT'): Record<string, PrintArea> {
  const base = kind === 'TSHIRT' ? TEE_AREAS : JERSEY_AREAS;
  if (!fractions) return base;
  const box = photoBox(aspect ?? VIEWBOX.w / VIEWBOX.h);
  const out: Record<string, PrintArea> = { ...base };
  for (const [name, f] of Object.entries(fractions)) {
    if (f && typeof f.x === 'number') out[name] = { x: box.x + f.x * box.w, y: box.y + f.y * box.h, w: f.w * box.w, h: f.h * box.h };
  }
  return out;
}
