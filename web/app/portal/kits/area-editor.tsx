"use client";

/**
 * Marks a print area on a photo: a box staff drag and resize over the picture. The result is kept as fractions of the
 * photo (0 to 1), so it lands in the same place however large the photo is shown, on the site as here.
 */

import { useRef, useState } from 'react';
import { dragBox } from '../components/crop-dialog';

export type Area = { x: number; y: number; w: number; h: number };
type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function AreaEditor({ image, area, onChange, label, onAspect }: {
  image: string;
  area: Area | null;
  onChange: (area: Area) => void;
  label: string;
  /** Reports the photo's width divided by its height once it has loaded. */
  onAspect?: (aspect: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; x: number; y: number; box: { x: number; y: number; w: number; h: number } } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const measure = (img: HTMLImageElement) => {
    setSize({ w: img.clientWidth, h: img.clientHeight });
    if (img.naturalWidth && img.naturalHeight) onAspect?.(img.naturalWidth / img.naturalHeight);
  };

  const box = size && area ? { x: area.x * size.w, y: area.y * size.h, w: area.w * size.w, h: area.h * size.h } : null;

  function begin(handle: Handle, event: React.PointerEvent) {
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { handle, x: event.clientX, y: event.clientY, box };
  }
  function move(event: React.PointerEvent) {
    const d = drag.current;
    if (!d || !size) return;
    const next = dragBox(d.handle, d.box, event.clientX - d.x, event.clientY - d.y, size, null);
    onChange({ x: next.x / size.w, y: next.y / size.h, w: next.w / size.w, h: next.h / size.h });
  }
  const end = () => { drag.current = null; };

  return (
    <div className="ae" ref={wrap}>
      <p className="ae-label">{label}</p>
      <div className="ae-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" draggable={false} onLoad={(e) => measure(e.currentTarget)} />
        {box ? (
          <div className="ae-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} onPointerDown={(e) => begin('move', e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
            {HANDLES.map((h) => (
              <span key={h} className={`ae-handle is-${h}`} onPointerDown={(e) => begin(h, e)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
