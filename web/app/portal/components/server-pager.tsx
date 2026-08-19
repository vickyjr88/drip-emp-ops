"use client";

/**
 * Search + filter + pagination for lists whose data lives on the server.
 *
 * Counterpart to list-controls.tsx: that file is for lists holding their
 * whole dataset in memory. This is for the ones where holding the whole
 * dataset in memory is the problem -- most portal lists fetch everything
 * unconditionally today and filter/page client-side, which gets slower and
 * heavier every time a record is added. useServerPager instead re-fetches
 * exactly one page whenever the page number, page size, search text, or any
 * filter changes, and the backend does the filtering.
 *
 * Three pieces:
 *   useServerPager   drives the fetch, exposes page/pageSize/search/filters state
 *   ServerListSearch debounced search box (same look as list-controls' ListSearch)
 *   ServerListPager  row count, page-size select, and jump-to-any-page nav
 */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ServerPage<T> = { items: T[]; total: number; skip: number; take: number };

export const SERVER_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_SERVER_PAGE_SIZE = 25;

/** Debounce delay before a search-text change triggers a fetch. Page/pageSize/filter changes fetch immediately -- only free text typing needs to wait for a pause. */
const SEARCH_DEBOUNCE_MS = 350;

export type ServerPagerState<T, TFilters> = {
  items: T[];
  total: number;
  loading: boolean;
  /** True only on the very first load, so callers can show a full loading state once and quieter feedback (e.g. dimmed rows) on subsequent page/search changes. */
  initialLoading: boolean;
  error: string | null;
  page: number;
  pageCount: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  search: string;
  setSearch: (value: string) => void;
  filters: TFilters;
  /** 1-based index of the first row on the current page, 0 when empty. */
  from: number;
  to: number;
  /** Re-runs the current query. Call after creating/deleting a row so the page reflects the change. */
  reload: () => void;
};

/**
 * @param fetchPage called with the current skip/take/search/filters whenever
 *   any of them change; should hit a PagedQueryDto-backed endpoint and return
 *   its `{ items, total, skip, take }` envelope.
 * @param filters   caller-owned extra filter state (selects, checkboxes, date
 *   ranges...). Passed through to fetchPage verbatim. Changing it resets to
 *   page 1, same as a new search does.
 */
export function useServerPager<T, TFilters extends Record<string, unknown> = Record<string, never>>({
  fetchPage,
  filters: callerFilters,
  pageSizeOptions = SERVER_PAGE_SIZE_OPTIONS,
  defaultPageSize = DEFAULT_SERVER_PAGE_SIZE,
  enabled = true,
}: {
  fetchPage: (params: { skip: number; take: number; search: string } & TFilters) => Promise<ServerPage<T>>;
  /**
   * Caller-owned filter state. Passed through to fetchPage verbatim on every
   * render -- unlike page/pageSize/search, this hook does not own it, so
   * there's no separate setFilters call needed: just update whatever state
   * you're passing in and the next render's value is picked up here.
   */
  filters?: TFilters;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  /**
   * Set false to hold off fetching -- e.g. while an auth token is still
   * loading from storage. `fetchPage` is typically wrapped in a ref (see
   * below) so the effect can't tell "the token arrived" from "a harmless
   * re-render"; `enabled` flipping true is what triggers the first real
   * fetch once the caller is actually ready.
   */
  enabled?: boolean;
}): ServerPagerState<T, TFilters> {
  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const filters = callerFilters ?? ({} as TFilters);
  const previousFiltersKeyRef = useRef<string>('');

  const [data, setData] = useState<ServerPage<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const hasLoadedOnce = useRef(false);

  // fetchPage is typically a fresh arrow function every render; keeping it in
  // a ref means a caller re-rendering doesn't retrigger the effect below --
  // only page/pageSize/search/filters/reload should do that.
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  // A filter change should behave like a new search: go back to page 1
  // rather than staying on (say) page 4 of a now-much-shorter result set.
  // Done here, during render, rather than in the fetch effect below, so the
  // fetch effect's own page/filtersKey dependencies don't race each other.
  let effectivePage = page;
  if (previousFiltersKeyRef.current !== filtersKey) {
    previousFiltersKeyRef.current = filtersKey;
    if (page !== 1) {
      effectivePage = 1;
      setPageRaw(1);
    }
  }

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const skip = (effectivePage - 1) * pageSize;
    fetchPageRef
      .current({ skip, take: pageSize, search: debouncedSearch, ...filters })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        hasLoadedOnce.current = true;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load this list.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // filtersKey stands in for `filters` (a fresh object identity every
    // render otherwise); fetchPage is read from the ref, not depended on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePage, pageSize, debouncedSearch, filtersKey, reloadTick, enabled]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Deleting the last row on a page, or a filter narrowing past the current
  // page, can strand the user past the end -- pull back rather than showing
  // a page that no longer has any rows.
  useEffect(() => {
    if (effectivePage > pageCount) setPageRaw(pageCount);
  }, [effectivePage, pageCount]);

  const setPage = useCallback((next: number) => {
    setPageRaw(Math.max(1, next));
  }, []);

  const setPageSize = useCallback((next: number) => {
    setPageSizeRaw(next);
    setPageRaw(1);
  }, []);

  const setSearch = useCallback((value: string) => {
    setSearchInput(value);
    setPageRaw(1);
  }, []);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? (data as unknown as T[]) : [];
  const from = total === 0 ? 0 : (effectivePage - 1) * pageSize + 1;
  const to = Math.min(effectivePage * pageSize, total);

  return {
    items,
    total,
    loading,
    initialLoading: loading && !hasLoadedOnce.current,
    error,
    page: effectivePage,
    pageCount,
    pageSize,
    setPage,
    setPageSize,
    search: searchInput,
    setSearch,
    filters,
    from,
    to,
    reload,
  };
}

/** Search box. Debounced internally by useServerPager -- typing doesn't fire a request per keystroke. */
export function ServerListSearch<T, TFilters extends Record<string, unknown>>({
  pager,
  placeholder = 'Search…',
  label,
}: {
  pager: ServerPagerState<T, TFilters>;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="list-search">
      <input
        type="search"
        className="list-search-input"
        value={pager.search}
        placeholder={placeholder}
        aria-label={label || placeholder}
        onChange={(event) => pager.setSearch(event.target.value)}
      />
      {pager.search ? (
        <button
          type="button"
          className="list-search-clear"
          onClick={() => pager.setSearch('')}
          aria-label="Clear search"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

/** Page numbers to render either side of the current page, collapsing runs into a single "…" the way most paginated UIs do once there are too many pages to show in full. */
function pageWindow(current: number, pageCount: number): Array<number | '…'> {
  const delta = 2;
  const pages: Array<number | '…'> = [];
  const start = Math.max(2, current - delta);
  const end = Math.min(pageCount - 1, current + delta);

  pages.push(1);
  if (start > 2) pages.push('…');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < pageCount - 1) pages.push('…');
  if (pageCount > 1) pages.push(pageCount);

  return pages;
}

/**
 * Row count, page-size selector, and jump-to-any-page navigation.
 *
 * Unlike list-controls.tsx's Previous/Next-only ListPager, this renders the
 * actual page numbers (with "…" gaps once there are many pages) plus a
 * direct "go to page" input, so reaching page 40 of 60 doesn't mean 39 clicks.
 */
export function ServerListPager<T, TFilters extends Record<string, unknown>>({
  pager,
  noun = 'records',
  pageSizeOptions = SERVER_PAGE_SIZE_OPTIONS,
}: {
  pager: ServerPagerState<T, TFilters>;
  noun?: string;
  pageSizeOptions?: number[];
}) {
  const { from, to, total, page, pageCount, pageSize, setPage, setPageSize, search, loading } = pager;
  const [jumpValue, setJumpValue] = useState('');

  function onJumpSubmit(event: FormEvent) {
    event.preventDefault();
    const target = Number(jumpValue);
    if (Number.isFinite(target) && target >= 1 && target <= pageCount) {
      setPage(Math.trunc(target));
    }
    setJumpValue('');
  }

  return (
    <div className="list-pager">
      <span className="list-pager-count">
        {total === 0
          ? `No ${noun}${search ? ' match that search' : ' yet'}`
          : `Showing ${from}–${to} of ${total.toLocaleString()} ${noun}`}
        {loading ? <span className="list-pager-total"> · updating…</span> : null}
      </span>

      <div className="list-pager-nav">
        <label className="list-pager-size">
          <span>Per page</span>
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        {pageCount > 1 ? (
          <>
            <button
              type="button"
              className="list-pager-btn"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </button>

            <div className="list-pager-pages">
              {pageWindow(page, pageCount).map((entry, index) =>
                entry === '…' ? (
                  <span key={`gap-${index}`} className="list-pager-gap">
                    …
                  </span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    className={`list-pager-page-btn${entry === page ? ' is-active' : ''}`}
                    aria-current={entry === page ? 'page' : undefined}
                    onClick={() => setPage(entry)}
                  >
                    {entry}
                  </button>
                ),
              )}
            </div>

            <button
              type="button"
              className="list-pager-btn"
              onClick={() => setPage(page + 1)}
              disabled={page >= pageCount}
            >
              Next
            </button>

            {pageCount > 7 ? (
              <form className="list-pager-jump" onSubmit={onJumpSubmit}>
                <span>Go to</span>
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={jumpValue}
                  onChange={(event) => setJumpValue(event.target.value)}
                  placeholder={String(page)}
                  aria-label="Go to page"
                />
              </form>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
