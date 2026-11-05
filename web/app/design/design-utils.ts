/**
 * Helpers for the design center that need no React: the same name and number rules the server enforces (so a mistake is
 * caught as it is typed), the print-fee arithmetic (the server recomputes it; this only shows the shopper the total),
 * colour helpers, a plain-words summary, and turning the shirt drawing into a PNG for the order's preview.
 */

import type { DesignSpec } from '../components/kit-shirt';

export const MAX_NAME = 12;

export type Pricing = { nameFeeKes: number; numberFeeKes: number; nameAndNumberFeeKes: number; artworkFeeKes: number; textFeeKes: number };

export function nameProblem(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length > MAX_NAME) return `Up to ${MAX_NAME} characters.`;
  // Built with the constructor: the project's TypeScript target does not allow the /u flag in a literal.
  if (!new RegExp("^[\\p{L}][\\p{L} '.\\-]*$", 'u').test(text)) return 'Letters, spaces, hyphens, apostrophes and full stops only.';
  return null;
}

export function numberProblem(raw: string): string | null {
  if (!raw.trim()) return null;
  return /^\d{1,2}$/.test(raw.trim()) ? null : 'A number from 0 to 99.';
}

export function printFeeOf(spec: Pick<DesignSpec, 'name' | 'number' | 'items'>, pricing: Pricing): number {
  let fee = 0;
  if (spec.name && spec.number) fee += pricing.nameAndNumberFeeKes;
  else {
    if (spec.name) fee += pricing.nameFeeKes;
    if (spec.number) fee += pricing.numberFeeKes;
  }
  for (const item of spec.items) fee += item.kind === 'artwork' ? pricing.artworkFeeKes : pricing.textFeeKes;
  return fee;
}

export function summarise(spec: DesignSpec): string {
  const parts: string[] = [];
  if (spec.name) parts.push(`name ${spec.name.text}`);
  if (spec.number) parts.push(`number ${spec.number.value}`);
  for (const item of spec.items) parts.push(item.kind === 'text' ? `${item.side} text "${item.text}"` : `${item.side} artwork`);
  return parts.join(', ');
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const isLight = (hex: string) => {
  const [r, g, b] = channels(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 165;
};
export const contrastOn = (hex: string) => (isLight(hex) ? '#111111' : '#ffffff');
export function shade(hex: string, amount: number): string {
  const [r, g, b] = channels(hex).map((c) => Math.max(0, Math.min(255, Math.round(c + 255 * amount))));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------------------
// Preview picture
// ---------------------------------------------------------------------------

const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/** A shirt drawing as a PNG. An SVG drawn as an image cannot load fonts or pictures by address, so both are inlined. */
async function drawingToImage(svg: SVGSVGElement, fontKeys: string[]): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', '800');
  clone.setAttribute('height', '880');

  const faces = await Promise.all(
    fontKeys.map(async (key) => {
      const bytes = await (await fetch(`/kit-fonts/${key}.woff2`)).blob();
      return `@font-face{font-family:'kit-${key}';src:url(${await toDataUrl(bytes)}) format('woff2');}`;
    }),
  );
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = faces.join('');
  clone.insertBefore(style, clone.firstChild);

  for (const image of Array.from(clone.querySelectorAll('image'))) {
    const href = image.getAttribute('href');
    if (href && !href.startsWith('data:')) image.setAttribute('href', await toDataUrl(await (await fetch(href)).blob()));
  }

  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The shirt could not be drawn.'));
      img.src = url;
    });
    return img;
  } finally {
    // Revoked after the browser has the bitmap (drawImage below happens synchronously after this resolves).
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Front and back side by side on one light background, or null when anything fails (a preview is optional). */
export async function renderPreview(front: SVGSVGElement, back: SVGSVGElement, fontKeys: string[]): Promise<Blob | null> {
  try {
    const [a, b] = await Promise.all([drawingToImage(front, fontKeys), drawingToImage(back, fontKeys)]);
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 880;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#f4f4f2';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(a, 0, 0, 800, 880);
    context.drawImage(b, 800, 0, 800, 880);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  } catch {
    return null;
  }
}
