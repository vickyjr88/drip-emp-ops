"use client";

/**
 * Crop an image from the media library.
 *
 * Cropping REPLACES the image: saving sends the chosen rectangle to the API, which overwrites the picture under the
 * same address. The library keeps one image, everything already using it shows the cropped version, and the previous
 * version is kept so the crop can be undone from the media manager.
 *
 * The box is drawn on the scaled picture and converted to the picture's own pixels on save, so what is cut is exactly
 * what is shown regardless of how the image is scaled to fit the screen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../accounting/lib';
import { MediaItem, freshUrl } from './media-types';

type Box = { x: number; y: number; w: number; h: number };
type Size = { w: number; h: number };
type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Smallest box, in screen pixels, that can be dragged to: small enough to be precise, big enough to grab. */
const MIN_BOX = 28;

const PRESETS: Array<{ key: string; label: string; ratio: number | 'original' | null }> = [
  { key: 'free', label: 'Free', ratio: null },
  { key: '1:1', label: 'Square 1:1', ratio: 1 },
  { key: 'original', label: 'Original shape', ratio: 'original' },
  { key: '4:5', label: 'Portrait 4:5', ratio: 4 / 5 },
  { key: '3:4', label: 'Portrait 3:4', ratio: 3 / 4 },
  { key: '4:3', label: 'Landscape 4:3', ratio: 4 / 3 },
  { key: '16:9', label: 'Wide 16:9', ratio: 16 / 9 },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** The largest box of this shape (any shape when `ratio` is null) at `fill` of the picture, centred on `centre`. */
export function fitBox(disp: Size, ratio: number | null, centre: { x: number; y: number }, fill = 0.8): Box {
  let w = disp.w * fill;
  let h = disp.h * fill;
  if (ratio) {
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
  }
  return {
    x: clamp(centre.x - w / 2, 0, disp.w - w),
    y: clamp(centre.y - h / 2, 0, disp.h - h),
    w,
    h,
  };
}

/** The box after dragging `handle` by (dx, dy) from `start`, kept inside the picture and (if set) in shape. */
export function dragBox(handle: Handle, start: Box, dx: number, dy: number, disp: Size, ratio: number | null): Box {
  if (handle === 'move') {
    return {
      ...start,
      x: clamp(start.x + dx, 0, disp.w - start.w),
      y: clamp(start.y + dy, 0, disp.h - start.h),
    };
  }

  // Edges (only offered when the shape is free): move one side, keep the other.
  if (handle === 'n' || handle === 's' || handle === 'e' || handle === 'w') {
    let { x, y, w, h } = start;
    if (handle === 'e') w = clamp(start.w + dx, MIN_BOX, disp.w - start.x);
    if (handle === 'w') {
      x = clamp(start.x + dx, 0, start.x + start.w - MIN_BOX);
      w = start.x + start.w - x;
    }
    if (handle === 's') h = clamp(start.h + dy, MIN_BOX, disp.h - start.y);
    if (handle === 'n') {
      y = clamp(start.y + dy, 0, start.y + start.h - MIN_BOX);
      h = start.y + start.h - y;
    }
    return { x, y, w, h };
  }

  // Corners: the opposite corner stays put and the dragged one follows the pointer.
  const signX = handle.includes('e') ? 1 : -1;
  const signY = handle.includes('s') ? 1 : -1;
  const anchorX = signX > 0 ? start.x : start.x + start.w;
  const anchorY = signY > 0 ? start.y : start.y + start.h;
  const pointerX = (signX > 0 ? start.x + start.w : start.x) + dx;
  const pointerY = (signY > 0 ? start.y + start.h : start.y) + dy;

  const maxW = signX > 0 ? disp.w - anchorX : anchorX;
  const maxH = signY > 0 ? disp.h - anchorY : anchorY;
  let w = Math.min(Math.max((pointerX - anchorX) * signX, MIN_BOX), maxW);
  let h = Math.min(Math.max((pointerY - anchorY) * signY, MIN_BOX), maxH);
  if (ratio) {
    w = Math.min(Math.max(w, h * ratio), maxW, maxH * ratio);
    h = w / ratio;
  }
  return { x: signX > 0 ? anchorX : anchorX - w, y: signY > 0 ? anchorY : anchorY - h, w, h };
}

export function CropDialog({
  image,
  token,
  onClose,
  onCropped,
}: {
  image: MediaItem;
  token: string | null;
  onClose: () => void;
  /** Receives the image after the crop: same id and address, new picture. */
  onCropped: (cropped: MediaItem) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ handle: Handle; startX: number; startY: number; box: Box } | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [disp, setDisp] = useState<Size | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [presetKey, setPresetKey] = useState('free');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0];
  const ratio = preset.ratio === 'original' ? (natural ? natural.w / natural.h : null) : preset.ratio;

  const dispRef = useRef<Size | null>(null);

  const measure = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.clientWidth) return;
    const next = { w: img.clientWidth, h: img.clientHeight };
    const prev = dispRef.current;
    dispRef.current = next;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    setDisp(next);
    setBox((current) => {
      if (!current) return fitBox(next, null, { x: next.w / 2, y: next.h / 2 });
      // The picture was resized (window, rotation): the box scales with it so it still frames the same part.
      if (prev && prev.w && prev.w !== next.w) {
        const k = next.w / prev.w;
        return { x: current.x * k, y: current.y * k, w: current.w * k, h: current.h * k };
      }
      return current;
    });
  }, []);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(img);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  function choosePreset(key: string) {
    setPresetKey(key);
    if (!disp || !box) return;
    const chosen = PRESETS.find((p) => p.key === key) ?? PRESETS[0];
    const nextRatio = chosen.ratio === 'original' ? (natural ? natural.w / natural.h : null) : chosen.ratio;
    // Keep the box's centre; a shape change re-fits it, a switch to "Free" leaves it as it is.
    if (nextRatio) setBox(fitBox(disp, nextRatio, { x: box.x + box.w / 2, y: box.y + box.h / 2 }, 0.8));
  }

  function begin(handle: Handle, event: React.PointerEvent) {
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { handle, startX: event.clientX, startY: event.clientY, box };
  }

  function move(event: React.PointerEvent) {
    const d = drag.current;
    if (!d || !disp) return;
    setBox(dragBox(d.handle, d.box, event.clientX - d.startX, event.clientY - d.startY, disp, ratio));
  }

  function end() {
    drag.current = null;
  }

  const scale = natural && disp ? natural.w / disp.w : 1;
  const out = box ? { w: Math.round(box.w * scale), h: Math.round(box.h * scale) } : null;

  async function save() {
    if (!box || !token) return;
    setSaving(true);
    setError(null);
    try {
      const cropped = await apiRequest<MediaItem>(
        '/media/crop',
        {
          method: 'POST',
          body: JSON.stringify({
            assetId: image.id,
            x: Math.round(box.x * scale),
            y: Math.round(box.y * scale),
            width: Math.round(box.w * scale),
            height: Math.round(box.h * scale),
          }),
        },
        token,
      );
      onCropped(cropped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the crop.');
      setSaving(false);
    }
  }

  const free = preset.ratio === null;
  const handles: Handle[] = free ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] : ['nw', 'ne', 'se', 'sw'];

  return (
    <div className="portal-dialog-overlay portal-crop-overlay" role="dialog" aria-modal="true" aria-label="Crop image">
      <div className="portal-dialog portal-crop-dialog">
        <div className="portal-dialog-title-row">
          <p className="portal-dialog-title">Crop image</p>
          <span className="portal-muted portal-crop-name">{image.fileName}</span>
        </div>
        <p className="portal-dialog-message">
          Drag the box or its handles. Saving replaces this image with the cropped picture everywhere it is used. The earlier version is kept, and you can restore it from the Media library.
        </p>

        <div className="portal-crop-presets" role="group" aria-label="Crop shape">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`portal-crop-preset${presetKey === p.key ? ' is-active' : ''}`}
              onClick={() => choosePreset(p.key)}
              aria-pressed={presetKey === p.key}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="portal-crop-stage-wrap">
          <div className="portal-crop-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imgRef} src={freshUrl(image)} alt="" draggable={false} onLoad={measure} className="portal-crop-image" />
            {/* The dimming outside the box lives in its own clipped layer: left on the box itself it spilled over the whole dialog. */}
            {box ? (
              <div className="portal-crop-dim" aria-hidden="true">
                <div className="portal-crop-dim-hole" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />
              </div>
            ) : null}
            {box ? (
              <div
                className="portal-crop-box"
                style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                onPointerDown={(event) => begin('move', event)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                data-testid="crop-box"
              >
                {handles.map((handle) => (
                  <span
                    key={handle}
                    className={`portal-crop-handle is-${handle}`}
                    onPointerDown={(event) => begin(handle, event)}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                    data-handle={handle}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <p className="portal-muted portal-crop-readout">
          {out ? (
            <>
              Crop: <strong>{out.w} × {out.h} px</strong>
              {natural ? ` of ${natural.w} × ${natural.h}` : ''}
              {Math.min(out.w, out.h) < 400 ? ' · small: may look soft on a large screen' : ''}
            </>
          ) : (
            'Loading image…'
          )}
        </p>

        {error ? <div className="portal-card portal-error">{error}</div> : null}

        <div className="portal-dialog-actions">
          <button type="button" className="portal-ghost-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="portal-primary-btn" onClick={() => void save()} disabled={saving || !box}>
            {saving ? 'Saving…' : 'Save crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
