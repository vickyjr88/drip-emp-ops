"use client";

import { useEffect, useState } from 'react';

/**
 * A card whose body folds away on a phone, so a long screen (an order, a product, a customer) is a list of headings to open one at a time
 * instead of one very long scroll. On a desktop it is just a card: the heading is plain and the body is always shown (the folding is CSS, see
 * portal-mobile.css). `summary` is the line shown beside the heading while folded, e.g. "3 sizes" or "KES 8,400".
 */
export function CollapseCard({
  title, summary, defaultOpen = false, forceOpen = false, children, className = '', style, dataTour, bare = false,
}: {
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** Opens the card (and keeps it open) while true: an edit that was started elsewhere on the screen. */
  forceOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  dataTour?: string;
  /** A section inside a card rather than a card of its own: a smaller heading and no frame. */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  return (
    <article className={`${bare ? 'm-collapse-bare' : 'portal-card'} m-collapse${open ? '' : ' is-closed'} ${className}`} style={style} data-tour={dataTour}>
      <button type="button" className="m-collapse-head" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {bare ? <h3>{title}</h3> : <h2>{title}</h2>}
        {summary ? <span className="m-collapse-summary">{summary}</span> : null}
        <span className="m-collapse-chevron" aria-hidden>▾</span>
      </button>
      <div className="m-collapse-body">{children}</div>
    </article>
  );
}
