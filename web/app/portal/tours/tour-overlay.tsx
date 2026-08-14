"use client";

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTours } from './tour-provider';
import { useTourAnchor, type AnchorRect } from './use-tour-anchor';

const PAD = 6; // breathing room between the spotlight and the element
const GAP = 12; // distance from spotlight edge to tooltip
const TOOLTIP_W = 320;

type Position = { top: number; left: number; placement: string };

/**
 * Places the tooltip beside the anchor, flipping to the opposite side when the
 * preferred one would leave the viewport, and clamping so it never sits
 * partly off-screen. With no anchor it centres -- used for intro/outro steps.
 */
function positionTooltip(
  rect: AnchorRect | null,
  preferred: string | undefined,
  viewport: { width: number; height: number },
  tooltipHeight: number,
): Position {
  if (!rect) {
    return {
      top: Math.max(16, viewport.height / 2 - tooltipHeight / 2),
      left: Math.max(16, viewport.width / 2 - TOOLTIP_W / 2),
      placement: 'center',
    };
  }

  const spaceBelow = viewport.height - (rect.top + rect.height);
  const spaceAbove = rect.top;
  const spaceRight = viewport.width - (rect.left + rect.width);
  const spaceLeft = rect.left;

  let placement = preferred || 'bottom';

  // Flip when the preferred side cannot fit the tooltip.
  if (placement === 'bottom' && spaceBelow < tooltipHeight + GAP && spaceAbove > spaceBelow) {
    placement = 'top';
  } else if (placement === 'top' && spaceAbove < tooltipHeight + GAP && spaceBelow > spaceAbove) {
    placement = 'bottom';
  } else if (placement === 'right' && spaceRight < TOOLTIP_W + GAP && spaceLeft > spaceRight) {
    placement = 'left';
  } else if (placement === 'left' && spaceLeft < TOOLTIP_W + GAP && spaceRight > spaceLeft) {
    placement = 'right';
  }

  let top: number;
  let left: number;

  switch (placement) {
    case 'top':
      top = rect.top - PAD - GAP - tooltipHeight;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - PAD - GAP - TOOLTIP_W;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left + rect.width + PAD + GAP;
      break;
    case 'bottom':
    default:
      top = rect.top + rect.height + PAD + GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      break;
  }

  // Clamp into the viewport with a 16px margin.
  left = Math.min(Math.max(16, left), Math.max(16, viewport.width - TOOLTIP_W - 16));
  top = Math.min(Math.max(16, top), Math.max(16, viewport.height - tooltipHeight - 16));

  return { top, left, placement };
}

export function TourOverlay() {
  const { activeTour, stepIndex, next, previous, endTour } = useTours();
  const step = activeTour?.steps[stepIndex];

  const { rect, resolved } = useTourAnchor(step?.anchor, Boolean(activeTour));
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState(180);
  const [mounted, setMounted] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setMounted(true);
    const sync = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  // Measure the tooltip so positioning can account for its real height.
  useLayoutEffect(() => {
    if (tooltipRef.current) {
      setTooltipHeight(tooltipRef.current.offsetHeight);
    }
  }, [stepIndex, activeTour, viewport.width]);

  /**
   * Skip-and-continue: a step whose anchor is not in the DOM is stepped over
   * rather than shown against a blank spotlight. This is what keeps a tour
   * usable after the UI moves underneath it.
   *
   * Waits a beat first. A step carrying a `route` navigates before it renders,
   * and a section that fetches its own data mounts its cards a frame or two
   * later -- skipping immediately would step past anchors that were simply not
   * painted yet, which looks identical to a deleted one.
   */
  useEffect(() => {
    if (!activeTour || !step || !resolved) return;
    if (!step.anchor || rect) return;

    const timer = window.setTimeout(() => {
      // Re-check directly: the anchor may have mounted during the grace period.
      if (document.querySelector(`[data-tour="${step.anchor}"]`)) return;
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[tours] step ${stepIndex + 1} of "${activeTour.id}" skipped: no element with data-tour="${step.anchor}"`,
        );
      }
      next();
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [activeTour, step, rect, resolved, stepIndex, next]);

  // Move focus into the tooltip on each step so keyboard and screen-reader
  // users follow the tour rather than being left behind in the page.
  useEffect(() => {
    if (!activeTour) return;
    tooltipRef.current?.focus();
  }, [activeTour, stepIndex]);

  // Keyboard: Esc exits, arrows step, Tab is trapped inside the tooltip.
  useEffect(() => {
    if (!activeTour) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        endTour('SKIPPED');
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previous();
        return;
      }
      if (event.key === 'Tab') {
        const focusables = tooltipRef.current?.querySelectorAll<HTMLElement>('button');
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey && (activeElement === first || activeElement === tooltipRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeTour, next, previous, endTour]);

  // Lock body scroll while a tour runs so the spotlight cannot drift away.
  // Deliberately NOT locking body scroll. Each step scrolls its anchor into
  // view, and a locked body silently defeats that -- anchors below the fold
  // were never reached, so the spotlight sat over the wrong part of the page.
  // The rect is tracked across scroll anyway, so a user scrolling mid-tour is
  // harmless: the spotlight follows.

  if (!mounted || !activeTour || !step) return null;
  // While an anchored step is still resolving -- mid-navigation, or a section
  // still fetching -- fall through with rect === null. positionTooltip centres
  // the tooltip and the scrim renders without a cut-out, so the tour stays on
  // screen instead of blanking until the anchor appears or the step is skipped.

  const position = positionTooltip(rect, step.placement, viewport, tooltipHeight);
  const isLast = stepIndex === activeTour.steps.length - 1;
  const isFirst = stepIndex === 0;

  // Cut a hole in the scrim so the highlighted control keeps its real colours
  // and stays clickable, instead of cloning it into the overlay.
  const spotlightStyle: React.CSSProperties = rect
    ? {
        clipPath: `polygon(
          0% 0%, 0% 100%, ${rect.left - PAD}px 100%,
          ${rect.left - PAD}px ${rect.top - PAD}px,
          ${rect.left + rect.width + PAD}px ${rect.top - PAD}px,
          ${rect.left + rect.width + PAD}px ${rect.top + rect.height + PAD}px,
          ${rect.left - PAD}px ${rect.top + rect.height + PAD}px,
          ${rect.left - PAD}px 100%, 100% 100%, 100% 0%
        )`,
      }
    : {};

  return createPortal(
    <div className="tour-layer">
      <div className="tour-scrim" style={spotlightStyle} aria-hidden onClick={() => endTour('SKIPPED')} />

      {rect ? (
        <div
          className="tour-ring"
          aria-hidden
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : null}

      <div
        className={`tour-tooltip tour-tooltip-${position.placement}`}
        style={{ top: position.top, left: position.left, width: TOOLTIP_W }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        tabIndex={-1}
        ref={tooltipRef}
      >
        <p className="tour-progress">
          Step {stepIndex + 1} of {activeTour.steps.length}
        </p>
        <h2 className="tour-title" id="tour-step-title">
          {step.title}
        </h2>
        <p className="tour-body" id="tour-step-body">
          {step.body}
        </p>

        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={() => endTour('SKIPPED')}>
            Skip
          </button>
          <div className="tour-actions-right">
            {!isFirst ? (
              <button type="button" className="tour-back" onClick={previous}>
                Back
              </button>
            ) : null}
            <button type="button" className="tour-next" onClick={next}>
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
