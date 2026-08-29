"use client";

/**
 * The catalogue.
 *
 * Size is a first-class filter and appears on every card, because in a shoe
 * shop the question is almost never "what do you have" — it is "do you have
 * my size". The current site hides sizes behind a details page, which means a
 * shopper opens five products to find one that fits.
 *
 * Filters live in the query string so a filtered view can be shared, survives
 * a refresh, and the back button behaves.
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../components/elite-layout';
import { ProductSearch } from '../components/product-search';
import { ProductCard } from '../components/product-card';
import { useCustomerAuth } from '../lib/customer-auth';
import { useCaptureReferral } from '../lib/use-capture-referral';
import {
  ShopCategory, ShopProduct, fetchCategories, fetchFilters, fetchProducts,
} from '../lib/shop';

/** The label beside this shrinks to icon-only below ~400px -- see .de-search
 *  button in globals.css -- so the button still reads as "search" once its
 *  text is hidden rather than becoming a plain black square. */
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M10.5 3a7.5 7.5 0 0 1 5.807 12.246l4.473 4.474a1 1 0 0 1-1.32 1.497l-.094-.083-4.474-4.473A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ShopClient() {
  const router = useRouter();
  const params = useSearchParams();
  const auth = useCustomerAuth();
  // The account page's "Your referral link" points here (the shop root, the
  // most general page to share) -- without this, that link never captured
  // attribution at all, since useCaptureReferral was previously mounted only
  // on the product detail page.
  useCaptureReferral();

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const category = params.get('category') || '';
  const brand = params.get('brand') || '';
  const size = params.get('size') || '';
  const search = params.get('search') || '';
  const sort = params.get('sort') || '';
  const inStockOnly = params.get('inStockOnly') === 'true';

  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => setSearchDraft(search), [search]);

  /**
   * Whether a search ignores the chosen category.
   *
   * Defaults on: someone who types "Jordan" while browsing Sandals is looking
   * for Jordans, not for a Jordan sandal, and previously got an empty result
   * with nothing on screen explaining that the category was still filtering.
   * Unticking keeps the search inside the current category.
   */
  const [searchAllCategories, setSearchAllCategories] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchCategories(), fetchFilters()]).then(([cats, filters]) => {
      if (cancelled) return;
      setCategories(cats);
      setBrands(filters.brands);
      setSizes(filters.sizes);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchProducts({
      category, brand, size, search, sort,
      inStockOnly: inStockOnly ? 'true' : undefined,
    }, auth.token).then((rows) => {
      if (cancelled) return;
      setProducts(rows);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // auth.token in the deps so signing in/out while the grid is open
    // re-fetches with the new tier's pricing.
  }, [category, brand, size, search, sort, inStockOnly, auth.token]);

  /**
   * Applies several parameters at once.
   *
   * Two setParam calls in a row would both read the same `params` snapshot, so
   * the second would overwrite the first -- which matters for search, where the
   * term is set and the category cleared in the same action.
   */
  const setParams = useCallback((changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(next.toString() ? `/shop?${next.toString()}` : '/shop', { scroll: false });
  }, [params, router]);

  const setParam = useCallback(
    (key: string, value: string) => setParams({ [key]: value }),
    [setParams],
  );

  /**
   * Runs the full-grid search. Shared by the form's submit and by the
   * dropdown's "see all results", so both apply the category scope the same
   * way rather than drifting apart.
   */
  const submitSearch = useCallback(() => {
    const term = searchDraft.trim();
    setParams({
      search: term,
      // Only cleared when there is a term: unticking the box on an empty
      // search should not also drop the category someone is browsing.
      ...(term && searchAllCategories ? { category: '' } : {}),
    });
  }, [searchDraft, searchAllCategories, setParams]);

  const hasFilters = Boolean(category || brand || size || search || inStockOnly);
  const heading = useMemo(() => {
    if (search) return `"${search}"`;
    const found = categories.find((item) => item.slug === category);
    return found ? found.name : 'All Shoes';
  }, [search, category, categories]);

  return (
    <EliteLayout active="shop">
      <main className="lp-main-content de-shop">
        <section className="lp-container de-shop-head">
          <h1>{heading}</h1>
          <p>{loading ? 'Loading…' : `${products.length} style${products.length === 1 ? '' : 's'}`}</p>
        </section>

        <section className="lp-container" aria-label="Filter products">
          <div className="de-filters">
            <form
              className="de-search"
              onSubmit={(event) => { event.preventDefault(); submitSearch(); }}
            >
              <ProductSearch
                value={searchDraft}
                onChange={setSearchDraft}
                onSubmit={submitSearch}
                // Suggestions follow the same scope the submitted search would:
                // ticking "all categories" widens the dropdown too, so what is
                // previewed is what pressing Enter returns.
                category={searchAllCategories ? '' : category}
              />
              <button type="submit" className="lp-button lp-button-black de-search-submit" aria-label="Search">
                <SearchIcon />
                <span className="de-search-submit-label">Search</span>
              </button>
              {/* Sits inside the form so it is read as part of searching, not
                  as another filter -- and so it applies on submit rather than
                  re-running the query on its own. */}
              {category ? (
                <label className="de-check de-search-scope">
                  <input
                    type="checkbox"
                    checked={searchAllCategories}
                    onChange={(event) => setSearchAllCategories(event.target.checked)}
                  />
                  <span>Search all categories</span>
                </label>
              ) : null}
            </form>

            <div className="de-filter-row">
              <label>
                <span>Category</span>
                <select value={category} onChange={(event) => setParam('category', event.target.value)}>
                  <option value="">All</option>
                  {categories.map((item) => (
                    <option key={item.slug} value={item.slug}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Brand</span>
                <select value={brand} onChange={(event) => setParam('brand', event.target.value)}>
                  <option value="">All</option>
                  {brands.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span>Sort</span>
                <select value={sort} onChange={(event) => setParam('sort', event.target.value)}>
                  <option value="">Newest</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>

            {/* Size as buttons rather than a dropdown: a shopper can see at a
                glance which sizes the shop carries without opening a menu. */}
            <div className="de-size-filter">
              <span>Size</span>
              <div className="de-size-chips">
                <button
                  type="button"
                  className={`de-chip${size ? '' : ' is-on'}`}
                  onClick={() => setParam('size', '')}
                >
                  Any
                </button>
                {sizes.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`de-chip${size === item ? ' is-on' : ''}`}
                    onClick={() => setParam('size', size === item ? '' : item)}
                  >
                    {item.replace('EUR ', '')}
                  </button>
                ))}
              </div>
            </div>

            <div className="de-filter-foot">
              <label className="de-check">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(event) => setParam('inStockOnly', event.target.checked ? 'true' : '')}
                />
                <span>In stock only</span>
              </label>
              {hasFilters ? <Link href="/shop" className="de-clear">Clear all</Link> : null}
            </div>
          </div>
        </section>

        <section className="lp-container de-grid-wrap">
          {!loading && products.length === 0 ? (
            <div className="de-empty">
              <p>Nothing matches those filters.</p>
              <Link href="/shop" className="lp-button lp-button-ghost">Clear filters</Link>
            </div>
          ) : null}

          <div className="de-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
