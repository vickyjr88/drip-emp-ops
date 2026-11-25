"use client";

import { useState } from 'react';

/**
 * Two small things that keep a list usable on a phone without changing it on a desktop.
 *
 * FilterFold: a list's filter boxes (category, dates, sort...) sit behind one "Filters" button, so the search box and the rows come first.
 * RowActions: the one thing you usually do to a row stays as a button; the rest (duplicate, hide, delete...) sit behind "More".
 *
 * On a desktop both render their children exactly as before (the wrappers use display: contents, see portal-mobile.css).
 */
export function FilterFold({ children, count = 0, label = 'Filters' }: { children: React.ReactNode; count?: number; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="portal-inline-btn m-filter-btn" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {label}{count ? ` (${count})` : ''} {open ? '▴' : '▾'}
      </button>
      <div className={`m-filter-body${open ? ' is-open' : ''}`}>{children}</div>
    </>
  );
}

export function RowActions({ primary, children, className = '' }: { primary?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`portal-action-row m-row-actions ${className}`}>
      {primary}
      <button type="button" className="portal-inline-btn m-more-btn" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? 'Less' : 'More'}
      </button>
      <div className={`m-more-panel${open ? ' is-open' : ''}`}>{children}</div>
    </div>
  );
}
