/**
 * The shirt drawing used everywhere a kit is shown: product cards, the product page, the design center and saved
 * designs. Pure SVG with no state, so it renders on the server for the listing pages and in the browser for the
 * design center.
 *
 * Nothing official is drawn: no crest, sponsor or maker's mark. A shirt is a shape plus colours and a pattern, and a
 * name, number, text or artwork laid over it. When staff attach a licensed photo to a kit, the photo replaces the drawn
 * shirt and the same overlay is placed on it using the print areas marked on the photo.
 */


import type { PointerEvent as ReactPointerEvent } from 'react';
import { SHAPES, VIEWBOX, areasFor, areasFromFractions, patternBands, photoBox, type KitColors, type KitPattern, type PrintArea } from './kit-geometry';

export { VIEWBOX, areasFor, areasFromFractions };
export type { KitColors, KitPattern, PrintArea };

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

/** The CSS family a font key is loaded under (see globals.css, @font-face for each file in /public/kit-fonts). */
export const fontFamily = (fontKey?: string) => `kit-${fontKey || 'condensed'}, Impact, 'Arial Narrow', sans-serif`;

function patternShapes(colors: KitColors, uid: string) {
  const { primary, secondary, pattern } = colors;
  return (
    <g clipPath={`url(#${uid}-clip)`}>
      <rect x={0} y={0} width={400} height={440} fill={primary} />
      {patternBands(pattern).map((band, i) =>
        band.shape === 'rect' ? (
          <rect key={i} x={band.x} y={band.y} width={band.w} height={band.h} fill={secondary} {...(band.opacity ? { opacity: band.opacity } : {})} />
        ) : (
          <polygon key={i} points={band.points} fill={secondary} />
        ),
      )}
    </g>
  );
}

/** A name or number, scaled to fit its print area. Long text is squeezed rather than allowed to spill off the shirt. */
function fitText(text: string, area: PrintArea, fontKey: string, color: string, factor: number, key: string) {
  const size = Math.min(area.h * factor, 220);
  const estimated = text.length * size * 0.5;
  return (
    <text
      key={key}
      x={area.x + area.w / 2}
      y={area.y + area.h / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={fontFamily(fontKey)}
      fontSize={size}
      fill={color}
      {...(estimated > area.w ? { textLength: area.w, lengthAdjust: 'spacingAndGlyphs' as const } : {})}
    >
      {text}
    </text>
  );
}

export type KitShirtProps = {
  templateKey: string;
  colors: KitColors;
  side?: 'front' | 'back';
  name?: DesignSpec['name'];
  number?: DesignSpec['number'];
  items?: DesignItem[];
  /** A photo that replaces the drawn shirt. */
  photo?: string | null;
  /** Width divided by height of the photo, so it is fitted rather than stretched. */
  photoAspect?: number | null;
  /** Print areas to place the overlay by, in the shirt drawing's own units; defaults to the template's. */
  areas?: Record<string, PrintArea>;
  selectedItemId?: string | null;
  onItemPointerDown?: (id: string, event: ReactPointerEvent<SVGElement>) => void;
  className?: string;
  title?: string;
  svgRef?: React.Ref<SVGSVGElement>;
};

export function KitShirt({
  templateKey, colors, side = 'front', name, number, items = [], photo, photoAspect, areas, selectedItemId, onItemPointerDown, className, title, svgRef,
}: KitShirtProps) {
  const shape = SHAPES[templateKey] ?? SHAPES['jersey-short'];
  const uid = `ks-${templateKey}-${side}-${colors.primary.slice(1)}${colors.secondary.slice(1)}${colors.pattern}`;
  const printAreas = areas ?? areasFor(templateKey);
  const outline = side === 'back' && shape.outlineBack ? shape.outlineBack : shape.outline;
  const neck = side === 'back' ? shape.neckBack : shape.neckFront;
  const sleeveColor = colors.sleeves === 'secondary' ? colors.secondary : null;
  const itemArea = side === 'front' ? printAreas.frontCentre : printAreas.backNumber;

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
      role="img"
      aria-label={title ?? 'Shirt'}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      {title ? <title>{title}</title> : null}
      {photo ? (
        (() => {
          const box = photoBox(photoAspect ?? VIEWBOX.w / VIEWBOX.h);
          return <image href={photo} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="none" />;
        })()
      ) : (
        <>
          <defs>
            <clipPath id={`${uid}-clip`}>
              <path d={outline} />
            </clipPath>
            <linearGradient id={`${uid}-shade`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
              <stop offset="0.55" stopColor="#000000" stopOpacity="0" />
              <stop offset="1" stopColor="#000000" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <ellipse cx={200} cy={414} rx={118} ry={9} fill="#000000" opacity={0.08} />
          {patternShapes(colors, uid)}
          {sleeveColor ? (
            <g clipPath={`url(#${uid}-clip)`}>
              <path d={shape.sleeveL} fill={sleeveColor} />
              <path d={shape.sleeveR} fill={sleeveColor} />
            </g>
          ) : null}
          <g clipPath={`url(#${uid}-clip)`}>
            <rect x={0} y={0} width={400} height={440} fill={`url(#${uid}-shade)`} />
            <path d={shape.sleeveL} fill="none" stroke="#000000" strokeOpacity={0.16} strokeWidth={1.5} />
            <path d={shape.sleeveR} fill="none" stroke="#000000" strokeOpacity={0.16} strokeWidth={1.5} />
          </g>
          <line x1={shape.cuffL[0]} y1={shape.cuffL[1]} x2={shape.cuffL[2]} y2={shape.cuffL[3]} stroke={colors.trim} strokeWidth={9} strokeLinecap="butt" />
          <line x1={shape.cuffR[0]} y1={shape.cuffR[1]} x2={shape.cuffR[2]} y2={shape.cuffR[3]} stroke={colors.trim} strokeWidth={9} strokeLinecap="butt" />
          {shape.collar && side === 'front' ? <path d={shape.collar} fill={colors.trim} stroke="#000000" strokeOpacity={0.18} strokeWidth={1} /> : null}
          <path d={neck} fill="none" stroke={colors.trim} strokeWidth={8} strokeLinejoin="round" />
          <path d={outline} fill="none" stroke="#000000" strokeOpacity={0.3} strokeWidth={1.6} strokeLinejoin="round" />
        </>
      )}

      {side === 'back' && name ? fitText(name.text, printAreas.backName, name.fontKey, name.color, 0.82, 'name') : null}
      {side === 'back' && number ? fitText(number.value, printAreas.backNumber, number.fontKey, number.color, 0.9, 'number') : null}

      {items
        .filter((item) => item.side === side)
        .map((item) => {
          const area = itemArea;
          const cx = area.x + item.x * area.w;
          const cy = area.y + item.y * area.h;
          const width = item.scale * area.w;
          const selected = item.id === selectedItemId;
          const handlers = onItemPointerDown ? { onPointerDown: (event: ReactPointerEvent<SVGElement>) => onItemPointerDown(item.id, event) } : {};
          return (
            <g
              key={item.id}
              data-item-id={item.id}
              transform={`rotate(${item.rotation} ${cx} ${cy})`}
              style={onItemPointerDown ? { cursor: 'move', touchAction: 'none' } : undefined}
              {...handlers}
            >
              {item.kind === 'artwork' && item.artworkUrl ? (
                <image href={item.artworkUrl} x={cx - width / 2} y={cy - width / 2} width={width} height={width} preserveAspectRatio="xMidYMid meet" />
              ) : item.text ? (
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily={fontFamily(item.fontKey)}
                  fontSize={Math.min(96, Math.max(10, width / Math.max(1, item.text.length * 0.5)))}
                  fill={item.color}
                >
                  {item.text}
                </text>
              ) : null}
              {selected ? <rect x={cx - width / 2 - 4} y={cy - width / 4 - 4} width={width + 8} height={width / 2 + 8} fill="none" stroke="#2438a8" strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" /> : null}
            </g>
          );
        })}
    </svg>
  );
}
