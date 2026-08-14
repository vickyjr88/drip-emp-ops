"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

/**
 * Single-line carousel shared by the About page's core values and the home
 * page's "How We Help" cards.
 *
 * Built on native overflow scrolling with CSS scroll-snap rather than a
 * transform slider or a carousel dependency: the track is draggable by touch,
 * scrollable by wheel and focusable for keyboard users for free, and the cards
 * stay present and reachable if JS never runs. The arrows are a layer on top.
 *
 * `perView` only sets the desktop card width (via a CSS custom property); the
 * responsive breakpoints in globals.css override it on smaller screens, where
 * three cards would be unreadable regardless of what the caller asked for.
 */
export function CardCarousel({
  children,
  label,
  perView = 4,
  className,
}: {
  children: ReactNode[];
  label: string;
  perView?: number;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const syncArrows = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    // 1px tolerance: fractional scroll widths mean scrollLeft rarely lands
    // exactly on the maximum.
    setAtStart(track.scrollLeft <= 1);
    setAtEnd(track.scrollLeft >= track.scrollWidth - track.clientWidth - 1);
  }, []);

  useEffect(() => {
    syncArrows();
    const track = trackRef.current;
    if (!track) return;

    track.addEventListener('scroll', syncArrows, { passive: true });
    window.addEventListener('resize', syncArrows);
    return () => {
      track.removeEventListener('scroll', syncArrows);
      window.removeEventListener('resize', syncArrows);
    };
  }, [syncArrows, children.length]);

  const scrollByCard = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    // Advance by whatever is actually on screen, so the step matches the
    // breakpoint without hardcoding a card width here.
    const card = track.querySelector<HTMLElement>('.lp-carousel-item');
    const step = card ? card.offsetWidth + 20 : track.clientWidth * 0.8;
    track.scrollBy({ left: step * direction, behavior: 'smooth' });
  }, []);

  if (children.length === 0) {
    return null;
  }

  // Everything fits, so the controls would be dead weight.
  const needsControls = children.length > perView;

  return (
    <div
      className={`lp-carousel${className ? ` ${className}` : ''}`}
      style={{ ['--lp-carousel-per-view' as string]: String(perView) }}
    >
      <div ref={trackRef} className="lp-carousel-track" tabIndex={0} role="group" aria-label={label}>
        {children.map((child, index) => (
          <div key={index} className="lp-carousel-item">
            {child}
          </div>
        ))}
      </div>

      {needsControls ? (
        <div className="lp-carousel-controls">
          <button
            type="button"
            className="lp-carousel-arrow"
            onClick={() => scrollByCard(-1)}
            disabled={atStart}
            aria-label={`Previous ${label.toLowerCase()}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <button
            type="button"
            className="lp-carousel-arrow"
            onClick={() => scrollByCard(1)}
            disabled={atEnd}
            aria-label={`Next ${label.toLowerCase()}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
