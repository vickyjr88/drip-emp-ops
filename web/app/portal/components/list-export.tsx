"use client";

/**
 * CSV export for portal lists, with an optional date range.
 *
 * Exports run entirely in the browser against the rows the list already holds
 * -- the same array that feeds search and pagination. That means no new
 * endpoints, and what you download is exactly what you were looking at,
 * including whatever search or filter was applied. A server-side export would
 * be a second implementation of the same filtering, free to disagree with the
 * screen.
 *
 * The trade-off: a list that only fetched its first page can only export that
 * page. Every list wired up here holds its full dataset (that is why they page
 * client-side), and the row count is shown in the dialog so the number is never
 * a surprise.
 */

import { useMemo, useState } from 'react';

export type ExportColumn<T> = {
  /** Column header, written verbatim into the file. */
  header: string;
  /** Cell value. Return null/undefined for blank rather than "null". */
  value: (row: T) => string | number | null | undefined;
};

export type ExportConfig<T> = {
  /** Base of the filename; the range and date are appended. */
  fileName: string;
  columns: Array<ExportColumn<T>>;
  /**
   * Pulls the date a row should be filtered on. Omit for lists with no
   * meaningful date -- brokers, tax rates, blocks -- and the range controls
   * are hidden rather than shown doing nothing.
   */
  dateOf?: (row: T) => string | Date | null | undefined;
  /** What the date field means, e.g. "Received" or "Due". Shown in the dialog. */
  dateLabel?: string;
};

/**
 * Escapes one CSV cell.
 *
 * Quotes anything containing a comma, quote or newline, and doubles inner
 * quotes, per RFC 4180. A leading =, +, - or @ is prefixed with a single quote:
 * spreadsheets treat those as formulas, so a customer named "=cmd" would
 * otherwise execute on open. That is a real attack against exported data, not a
 * theoretical one.
 */
function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv<T>(rows: T[], columns: Array<ExportColumn<T>>): string {
  const safeRows = Array.isArray(rows) ? rows : [];
  const header = columns.map((column) => escapeCell(column.header)).join(',');
  const body = safeRows.map((row) =>
    columns.map((column) => escapeCell(column.value(row))).join(','),
  );
  // CRLF and a UTF-8 BOM: without the BOM Excel reads the file as the local
  // codepage and mangles any non-ASCII name.
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

function download(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Filters rows to a date range.
 *
 * `to` is pushed to the end of its day, so picking the same date for both ends
 * returns that day rather than nothing -- which is what happens if you compare
 * against midnight and is the most common way a date filter appears broken.
 * Rows with no date are excluded when a range is set: including them would mean
 * a filtered export containing rows that cannot be in the range.
 */
export function filterByDate<T>(
  rows: T[],
  dateOf: ((row: T) => string | Date | null | undefined) | undefined,
  from: string,
  to: string,
): T[] {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!dateOf || (!from && !to)) return safeRows;

  const start = from ? parseDate(from) : null;
  const end = to ? parseDate(to) : null;
  if (end) end.setHours(23, 59, 59, 999);

  return safeRows.filter((row) => {
    const date = parseDate(dateOf(row));
    if (!date) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });
}

/**
 * Export button plus its date-range popover.
 *
 * `rows` should be the filtered set, not the current page -- exporting only
 * what happens to be on screen is almost never what someone means by "export".
 */
export function ListExport<T>({
  rows,
  config,
  disabled,
}: {
  rows: T[];
  config: ExportConfig<T>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const ranged = useMemo(
    () => filterByDate(rows, config.dateOf, from, to),
    [rows, config.dateOf, from, to],
  );

  const supportsDates = Boolean(config.dateOf);

  function onExport() {
    const stamp = new Date().toISOString().slice(0, 10);
    const range = from || to ? `_${from || 'start'}_to_${to || stamp}` : '';
    download(toCsv(ranged, config.columns), `${config.fileName}${range}_${stamp}.csv`);
    setOpen(false);
  }

  // Without a date field there is nothing to configure, so skip the popover and
  // export on the first click.
  if (!supportsDates) {
    return (
      <button
        type="button"
        className="portal-inline-btn"
        onClick={() => download(toCsv(rows, config.columns), `${config.fileName}_${new Date().toISOString().slice(0, 10)}.csv`)}
        disabled={disabled || rows.length === 0}
      >
        Export CSV
      </button>
    );
  }

  return (
    <div className="list-export">
      <button
        type="button"
        className="portal-inline-btn"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        disabled={disabled || rows.length === 0}
      >
        Export CSV
      </button>

      {open ? (
        <div className="list-export-popover" role="dialog" aria-label="Export options">
          <p className="list-export-title">
            Export {ranged.length.toLocaleString()} row{ranged.length === 1 ? '' : 's'}
          </p>
          <p className="list-export-hint">
            {config.dateLabel ? `${config.dateLabel} between` : 'Between'} these dates. Leave blank
            for all.
          </p>

          <div className="list-export-dates">
            <label>
              <span>From</span>
              <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>

          {rows.length !== ranged.length ? (
            <p className="list-export-note">
              {(rows.length - ranged.length).toLocaleString()} row
              {rows.length - ranged.length === 1 ? '' : 's'} excluded by this range.
            </p>
          ) : null}

          <div className="list-export-actions">
            {from || to ? (
              <button
                type="button"
                className="portal-inline-btn"
                onClick={() => {
                  setFrom('');
                  setTo('');
                }}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              className="portal-primary-btn list-export-go"
              onClick={onExport}
              disabled={ranged.length === 0}
            >
              Download
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
