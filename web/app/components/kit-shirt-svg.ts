import { SHAPES, VIEWBOX, patternBands, type KitColors } from './kit-geometry';

/**
 * The drawn shirt (no lettering) as an SVG string, for server-side use where React rendering is not available: the PNG
 * for feeds and link previews. It follows the same layering as KitShirt in kit-shirt.tsx and draws from the same
 * geometry (kit-geometry.ts); if one changes, change the other.
 */
export function shirtSvg(templateKey: string, colors: KitColors, side: 'front' | 'back' = 'front'): string {
  const shape = SHAPES[templateKey] ?? SHAPES['jersey-short'];
  const outline = side === 'back' && shape.outlineBack ? shape.outlineBack : shape.outline;
  const neck = side === 'back' ? shape.neckBack : shape.neckFront;
  const sleeve = colors.sleeves === 'secondary' ? colors.secondary : null;

  const bands = patternBands(colors.pattern)
    .map((b) =>
      b.shape === 'rect'
        ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${colors.secondary}"${b.opacity ? ` opacity="${b.opacity}"` : ''}/>`
        : `<polygon points="${b.points}" fill="${colors.secondary}"/>`,
    )
    .join('');
  const [l, r] = [shape.cuffL, shape.cuffR];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX.w} ${VIEWBOX.h}" width="${VIEWBOX.w}" height="${VIEWBOX.h}">
<defs>
<clipPath id="c"><path d="${outline}"/></clipPath>
<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.2"/></linearGradient>
</defs>
<ellipse cx="200" cy="414" rx="118" ry="9" fill="#000" opacity="0.08"/>
<g clip-path="url(#c)"><rect width="400" height="440" fill="${colors.primary}"/>${bands}</g>
${sleeve ? `<g clip-path="url(#c)"><path d="${shape.sleeveL}" fill="${sleeve}"/><path d="${shape.sleeveR}" fill="${sleeve}"/></g>` : ''}
<g clip-path="url(#c)"><rect width="400" height="440" fill="url(#s)"/><path d="${shape.sleeveL}" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="1.5"/><path d="${shape.sleeveR}" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="1.5"/></g>
<line x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}" stroke="${colors.trim}" stroke-width="9"/>
<line x1="${r[0]}" y1="${r[1]}" x2="${r[2]}" y2="${r[3]}" stroke="${colors.trim}" stroke-width="9"/>
${shape.collar && side === 'front' ? `<path d="${shape.collar}" fill="${colors.trim}" stroke="#000" stroke-opacity="0.18"/>` : ''}
<path d="${neck}" fill="none" stroke="${colors.trim}" stroke-width="8" stroke-linejoin="round"/>
<path d="${outline}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="1.6" stroke-linejoin="round"/>
</svg>`;
}
