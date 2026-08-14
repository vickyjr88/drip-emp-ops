"use client";

import { useState } from 'react';
import { useTours } from './tour-provider';

/**
 * The Getting Started hub.
 *
 * Collapsed by default to a single summary row. With 16 tours the expanded
 * list pushed the actual dashboard below the fold, which made the portal feel
 * like it was about onboarding rather than work. Expanding is one click, and
 * the choice is remembered for the session.
 *
 * Visibility is owned by the provider, so the sidebar control can bring the
 * panel back after it has been hidden -- previously hiding it was one-way.
 */
export function TourChecklist() {
  const {
    availableTours,
    progress,
    startTour,
    checklistVisible,
    setChecklistVisible,
    hasViewer,
    activeTour,
  } = useTours();
  const [expanded, setExpanded] = useState(false);

  if (!hasViewer || !checklistVisible || availableTours.length === 0) return null;

  // Stand down while a tour is running. The panel sits above the page content,
  // so leaving it there would both distract from the step being explained and
  // push every anchor below it down the page mid-tour.
  if (activeTour) return null;

  const done = availableTours.filter(
    (tour) => progress[tour.id]?.status === 'COMPLETED',
  ).length;
  const nextUp = availableTours.find(
    (tour) => (progress[tour.id]?.status || 'NOT_STARTED') !== 'COMPLETED',
  );

  return (
    <section className="tour-checklist" aria-labelledby="tour-checklist-title">
      <header className="tour-checklist-head">
        <div className="tour-checklist-headline">
          <p className="portal-kicker">Getting started</p>
          <h2 id="tour-checklist-title">
            {done === availableTours.length
              ? 'You have been through everything'
              : nextUp
                ? `Next: ${nextUp.title}`
                : 'Learn the portal'}
          </h2>
          {!expanded && nextUp ? (
            <p className="tour-checklist-goal">{nextUp.goal}</p>
          ) : null}
        </div>

        <div className="tour-checklist-meta">
          <span className="tour-checklist-count">
            {done} of {availableTours.length} done
          </span>
          {!expanded && nextUp ? (
            <button
              type="button"
              className="portal-ghost-btn"
              onClick={() => startTour(nextUp.id)}
            >
              Start
            </button>
          ) : null}
          <button
            type="button"
            className="portal-ghost-btn"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
          >
            {expanded ? 'Collapse' : `All ${availableTours.length}`}
          </button>
          <button
            type="button"
            className="portal-ghost-btn"
            onClick={() => setChecklistVisible(false)}
          >
            Hide
          </button>
        </div>
      </header>

      {expanded ? (
        <ul className="tour-checklist-list">
          {availableTours.map((tour) => {
            const status = progress[tour.id]?.status || 'NOT_STARTED';
            const isDone = status === 'COMPLETED';
            const inProgress = status === 'IN_PROGRESS';

            return (
              <li key={tour.id} className={isDone ? 'is-done' : undefined}>
                <span className="tour-check" aria-hidden>
                  {isDone ? '✓' : '○'}
                </span>
                <span className="tour-checklist-copy">
                  <strong>{tour.title}</strong>
                  <span className="tour-checklist-goal">{tour.goal}</span>
                </span>
                <button
                  type="button"
                  className="portal-ghost-btn"
                  onClick={() => startTour(tour.id)}
                >
                  {isDone ? 'Replay' : inProgress ? 'Resume' : 'Start'}
                  <span className="sr-only"> the {tour.title} tour</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
