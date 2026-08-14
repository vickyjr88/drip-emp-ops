"use client";

import { useCallback, useEffect, useState } from 'react';

export type AnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * Resolves a data-tour value to its on-screen rectangle, kept current as the
 * page scrolls or resizes.
 *
 * Returns null when the anchor is absent -- the caller treats that as "skip
 * this step", never as an error. Also returns null for an element that is
 * present but not rendered (display:none, or zero-sized), since spotlighting
 * a zero-area rect would just flash an empty hole in the overlay.
 */
export function useTourAnchor(anchor: string | undefined, enabled: boolean) {
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const [resolved, setResolved] = useState(false);

  const measure = useCallback(() => {
    if (!anchor) {
      setRect(null);
      setResolved(true);
      return;
    }

    const element = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
    if (!element) {
      setRect(null);
      setResolved(true);
      return;
    }

    const box = element.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) {
      setRect(null);
      setResolved(true);
      return;
    }

    setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    setResolved(true);
  }, [anchor]);

  useEffect(() => {
    if (!enabled) return;

    setResolved(false);

    const element = anchor
      ? document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)
      : null;

    // Bring an off-screen anchor into view before measuring, otherwise the
    // first paint spotlights a rect that is about to move.
    if (element) {
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    }

    measure();

    // Re-measure after the frame settles. Starting a tour hides the Getting
    // Started panel, which shifts everything below it up; measuring only once
    // would spotlight where the anchor used to be.
    const settle = window.requestAnimationFrame(() => {
      const current = anchor
        ? document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)
        : null;
      if (current) {
        current.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
      measure();
    });

    const onScroll = () => measure();
    const onResize = () => measure();

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onResize);

    // Catches layout shifts that fire neither scroll nor resize -- a sidebar
    // collapsing, content loading in above the anchor.
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    if (observer && element) observer.observe(element);
    if (observer) observer.observe(document.body);

    /**
     * A step that navigates, or a section that fetches its own data, mounts its
     * anchor after this effect has already run -- so the scroll above never
     * happened and the spotlight would sit wherever the previous page left the
     * viewport. Watch for the anchor arriving, then scroll and measure once.
     */
    let poll: number | undefined;
    if (anchor && !element) {
      const started = Date.now();
      poll = window.setInterval(() => {
        const late = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
        if (late) {
          window.clearInterval(poll);
          poll = undefined;
          observer?.observe(late);
          late.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
          measure();
        } else if (Date.now() - started > 3000) {
          // Give up watching; the overlay's own timer decides whether to skip.
          window.clearInterval(poll);
          poll = undefined;
        }
      }, 100);
    }

    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
      window.cancelAnimationFrame(settle);
      if (poll !== undefined) window.clearInterval(poll);
    };
  }, [anchor, enabled, measure]);

  return { rect, resolved };
}
