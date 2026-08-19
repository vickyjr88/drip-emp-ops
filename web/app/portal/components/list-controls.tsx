"use client";

/**
 * Search + pagination for client-side lists.
 *
 * Most portal lists render a whole array straight from state. That is fine at
 * a dozen rows and unusable at several hundred -- and several lists were
 * showing only what the API returned on its first page with no way to reach
 * the rest.
 *
 * Two pieces:
 *   useListControls  filters, paginates, and keeps the page in range
 *   ListControls     the search box and page navigation
 *
 * For lists whose API already paginates server-side (audit, units) keep using
 * that -- this is for the ones holding their whole dataset in memory.
 */

import { useEffect, useMemo, useState } from 'react';

export const DEFAULT_PAGE_SIZE = 25;

export type ListControlsState<T> = {
  /** Rows for the current page, after filtering. */
  visible: T[];
  /**
   * Every row matching the search, across all pages. This is what an export
   * should use: the current page is never what someone means by "export", and
   * reproducing the search at the call site would let the two disagree.
   */
  filtered: T[];
  /** Row count after filtering, before paging. */
  filteredCount: number;
  total: number;
  search: string;
  setSearch: (value: string) => void;
  page: number;
  setPage: (page: number) => void;
  pageCount: number;
  pageSize: number;
  /** 1-based index of the first visible row, 0 when empty. */
  from: number;
  to: number;
};

/**
 * @param items      the full dataset
 * @param searchable pulls the searchable text out of a row; joined and matched
 *                   case-insensitively against every whitespace-separated term,
 *                   so "amina 3 bed" narrows the way people expect
 */
export function useListControls<T>(
  items: T[],
  searchable: (item: T) => Array<string | number | null | undefined>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): ListControlsState<T> {
  const safeItems = Array.isArray(items) ? items : [];
  const [search, setSearchRaw] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return safeItems;
    return safeItems.filter((item) => {
      const keys = searchable(item);
      const safeKeys = Array.isArray(keys) ? keys : [];
      const haystack = safeKeys
        .filter((value) => value !== null && value !== undefined)
        .join(' ')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    // `searchable` is typically an inline arrow and would be a new reference
    // every render; depending on it would defeat the memo entirely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeItems, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Deleting rows or narrowing a search can strand the user past the end.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  const setSearch = (value: string) => {
    setSearchRaw(value);
    setPage(1); // a new search always starts at the top
  };

  return {
    visible,
    filtered,
    filteredCount: filtered.length,
    total: safeItems.length,
    search,
    setSearch,
    page: safePage,
    setPage,
    pageCount,
    pageSize,
    from: filtered.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, filtered.length),
  };
}

/** Search box. Render above the list; pairs with ListPager below it. */
export function ListSearch<T>({
  controls,
  placeholder = 'Search…',
  label,
}: {
  controls: ListControlsState<T>;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="list-search">
      <input
        type="search"
        className="list-search-input"
        value={controls.search}
        placeholder={placeholder}
        aria-label={label || placeholder}
        onChange={(event) => controls.setSearch(event.target.value)}
      />
      {controls.search ? (
        <button
          type="button"
          className="list-search-clear"
          onClick={() => controls.setSearch('')}
          aria-label="Clear search"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

/**
 * Row count and page navigation. Always states the range even on a single
 * page -- "Showing 1–12 of 12" is how a user knows nothing is hidden, which is
 * the confusion this whole component exists to remove.
 */
export function ListPager<T>({
  controls,
  noun = 'records',
}: {
  controls: ListControlsState<T>;
  noun?: string;
}) {
  const { from, to, filteredCount, total, page, pageCount, setPage, search } = controls;

  return (
    <div className="list-pager">
      <span className="list-pager-count">
        {filteredCount === 0
          ? `No ${noun}${search ? ' match that search' : ' yet'}`
          : `Showing ${from}–${to} of ${filteredCount.toLocaleString()} ${noun}`}
        {search && filteredCount !== total ? (
          <span className="list-pager-total"> (filtered from {total.toLocaleString()})</span>
        ) : null}
      </span>

      {pageCount > 1 ? (
        <div className="list-pager-nav">
          <button
            type="button"
            className="list-pager-btn"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span className="list-pager-page">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="list-pager-btn"
            onClick={() => setPage(page + 1)}
            disabled={page >= pageCount}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Pagination only, for a list that already has its own search or filters.
 *
 * Several lists in portal/page.tsx (units, customers) had working filters but
 * rendered every match, so a filtered set of 800 still rendered 800 rows.
 * Wrapping their existing filtered array keeps that search as the single
 * source of truth rather than bolting a second one alongside it.
 */
export function usePagination<T>(
  items: T[],
  pageSize: number = DEFAULT_PAGE_SIZE,
): ListControlsState<T> {
  const safeItems = Array.isArray(items) ? items : [];
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(safeItems.length / pageSize));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // Filters live outside this hook, so a narrowing filter can leave the user
  // on a page that no longer exists; reset whenever the set shrinks past it.
  useEffect(() => {
    setPage(1);
  }, [safeItems.length]);

  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;

  return {
    visible: safeItems.slice(start, start + pageSize),
    filtered: safeItems,
    filteredCount: safeItems.length,
    total: safeItems.length,
    search: '',
    setSearch: () => {},
    page: safePage,
    setPage,
    pageCount,
    pageSize,
    from: safeItems.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, safeItems.length),
  };
}
