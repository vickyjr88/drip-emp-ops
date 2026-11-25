"use client";

import { useEffect } from 'react';

/**
 * Gives every table and list toolbar in the portal a phone layout without each screen having to ask.
 *
 *  - A table gets class "is-stack" and each cell is labelled with its column heading, so portal-mobile.css can show a row as a card of
 *    "Heading: value" lines. The first filled column becomes the card's title; a column with no heading (the buttons) is the card's actions.
 *    Tables a screen has already laid out by hand (is-stack) or that opt out (no-stack) are left alone.
 *  - A block of filter boxes that is not a toolbar (three or more fields in a div, nothing to save) is folded the same way.
 *  - A toolbar (search plus filters, dates, export) is marked "has-filters" when it holds more than a search box; the stylesheet then hides the
 *    extra controls behind a "Filters" button that this toggles by tapping the toolbar's own button (drawn by CSS).
 *
 * It only sets classes and attributes, never adds or removes elements, so React's own rendering is not disturbed. On a wide screen none of
 * the classes it sets has any effect.
 */
function labelTable(table: HTMLTableElement) {
  if (table.classList.contains('is-stack') && table.dataset.autoStack !== '1') return;
  if (table.classList.contains('no-stack')) return;
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!headRow) return;

  const headings: string[] = [];
  for (const cell of Array.from(headRow.cells)) {
    const text = (cell.textContent || '').trim();
    for (let i = 0; i < (cell.colSpan || 1); i++) headings.push(text);
  }

  table.classList.add('is-stack');
  table.dataset.autoStack = '1';
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      let index = 0;
      let titled = false;
      for (const cell of Array.from(row.cells)) {
        const heading = headings[index] ?? '';
        const span = cell.colSpan || 1;
        index += span;
        if (cell.classList.contains('is-title') || cell.hasAttribute('data-label')) continue;
        const hasContent = (cell.textContent || '').trim().length > 0 || cell.querySelector('img,input,select,textarea,svg') !== null;
        if (span > 1 && !heading) { continue; }
        if (!heading) {
          // No heading: a column of buttons, or a thumbnail. Buttons are actions; anything else is left unlabelled.
          if (cell.querySelector('button,a')) cell.classList.add('is-actions');
          else if (!hasContent) cell.classList.add('m-hide');
          continue;
        }
        if (!titled && hasContent) { cell.classList.add('is-title'); titled = true; continue; }
        cell.setAttribute('data-label', heading);
        if (!hasContent) cell.classList.add('m-hide');
      }
    }
  }
}

function markToolbars() {
  for (const bar of Array.from(document.querySelectorAll<HTMLElement>('.list-toolbar'))) {
    if (bar.querySelector('.m-filter-btn')) continue; // folded by hand
    const others = Array.from(bar.children).filter((child) => !child.classList.contains('list-search'));
    bar.classList.toggle('has-filters', others.length > 0);
  }
}

/**
 * A block of filter boxes that is not a toolbar: a div (not a form) styled as an entity form, holding three or more fields and no button that
 * saves anything. Marked "m-filterbox" so the stylesheet folds it behind a Filters button, like a toolbar's.
 */
function markFilterBoxes() {
  for (const box of Array.from(document.querySelectorAll<HTMLElement>('.portal-workspace-body div.portal-entity-form'))) {
    if (box.closest('form')) continue;
    if (box.querySelector('button[type="submit"]')) continue;
    // A button that applies a filter does not save anything; one that says it records or creates something marks a real form.
    const saves = Array.from(box.querySelectorAll('.portal-primary-btn')).some((b) => !/filter|apply|search|clear|reset|show|run|refresh/i.test(b.textContent || ''));
    if (saves) continue;
    const fields = box.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), select, textarea').length;
    box.classList.toggle('m-filterbox', fields >= 3);
  }
}

export function MobileEnhancer() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      document.querySelectorAll<HTMLTableElement>('.portal-workspace-body table').forEach(labelTable);
      markToolbars();
      markFilterBoxes();
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(run); };
    run();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    // The toolbar's "Filters" button is drawn by CSS on the toolbar itself, so a tap on the toolbar (not on a control in it) is a tap on it.
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.classList.contains('list-toolbar') && target.classList.contains('has-filters')) target.classList.toggle('is-open');
      if (target?.classList.contains('m-filterbox')) target.classList.toggle('is-open');
    };
    document.addEventListener('click', onClick);
    return () => { observer.disconnect(); document.removeEventListener('click', onClick); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return null;
}
