"use client";

import { useTours } from './tour-provider';
import { findTour } from './catalogue';

/**
 * In-context launcher for a single tour -- the "?" that sits in a section
 * header.
 *
 * The Getting Started panel is the only other way in, and it lives on the
 * dashboard. Someone already lost inside Accounting or Payroll should be able
 * to ask for help where they are, rather than navigating away to find it.
 *
 * Renders nothing when the tour does not exist or the user lacks the
 * permission it is gated on, so a section header never shows help for
 * something the reader cannot do.
 */
export function TourLauncher({
  tour: tourId,
  label,
}: {
  tour: string;
  label?: string;
}) {
  const { availableTours, startTour } = useTours();

  const tour = findTour(tourId);
  if (!tour) return null;
  if (!availableTours.some((candidate) => candidate.id === tourId)) return null;

  return (
    <button
      type="button"
      className="tour-launcher"
      onClick={() => startTour(tourId)}
      title={`Show me: ${tour.title}`}
    >
      <span aria-hidden>?</span>
      <span className="sr-only">{label || `Show me how: ${tour.title}`}</span>
    </button>
  );
}

/**
 * Empty-state entry point: "No units yet -- show me how."
 *
 * The highest-intent moment there is. The user is already trying to do the
 * thing and has hit a blank screen, so this is where a tour is most welcome
 * and least intrusive.
 */
export function TourEmptyState({
  tour: tourId,
  children,
}: {
  tour: string;
  children: React.ReactNode;
}) {
  const { availableTours, startTour } = useTours();

  const tour = findTour(tourId);
  const offered = tour && availableTours.some((candidate) => candidate.id === tourId);

  return (
    <p className="tour-empty-state">
      {children}
      {offered ? (
        <>
          {' '}
          <button type="button" className="tour-empty-link" onClick={() => startTour(tourId)}>
            Show me how
          </button>
        </>
      ) : null}
    </p>
  );
}
