"use client";

/**
 * The thumbnail that leads every block, floor plan and unit row.
 *
 * The point of the fallback chain is that a row is never blank: a record
 * without its own image borrows from the thing it belongs to, so an operator
 * scanning a list always has something to recognise. Only when nothing at all
 * is available does the initial stand in, which is still more legible than an
 * empty box.
 *
 * Callers pass the candidates most-specific first and this takes the first one
 * that exists, rather than each list re-deriving that order slightly
 * differently.
 */

type ListThumbProps = {
  /** Image candidates, most specific first. Blank and null entries are skipped. */
  sources: Array<string | null | undefined>;
  /** Alt text, and the source of the placeholder initial. */
  label: string;
};

export function ListThumb({ sources, label }: ListThumbProps) {
  const src = sources.find((candidate) => Boolean(candidate && candidate.trim()));

  if (!src) {
    return (
      <div className="portal-list-thumb is-empty" aria-hidden="true">
        <span>{(label || '?').trim().charAt(0).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <div className="portal-list-thumb">
      {/* Decorative: the row's own text already names the record, so announcing
          the image again would only add noise for a screen reader. */}
      <img src={src} alt="" loading="lazy" />
    </div>
  );
}
