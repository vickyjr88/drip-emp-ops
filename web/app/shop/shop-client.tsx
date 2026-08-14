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
import {
  ShopCategory, ShopProduct, fetchCategories, fetchFilters, fetchProducts, priceLabel,
} from '../lib/shop';

/**
 * "36–44" from a list of sizes, or a single size when only one is left.
 *
 * Sorted numerically because "EUR 39" sorts before "EUR 7" as text, and a
 * range built from a text sort would be wrong.
 */
function sizeRange(sizes: string[]) {
  const numbers = sizes
    .map((size) => parseInt(size.replace(/\D/g, ''), 10))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!numbers.length) return '';
  const low = numbers[0];
  const high = numbers[numbers.length - 1];
  return low === high ? String(low) : `${low}–${high}`;
}

export function ShopClient() {
  const router = useRouter();
  const params = useSearchParams();

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
    }).then((rows) => {
      if (cancelled) return;
      setProducts(rows);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [category, brand, size, search, sort, inStockOnly]);

  const setParam = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(next.toString() ? `/shop?${next.toString()}` : '/shop', { scroll: false });
  }, [params, router]);

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

        <section className="lp-container de-filters" aria-label="Filter products">
          <form
            className="de-search"
            onSubmit={(event) => { event.preventDefault(); setParam('search', searchDraft.trim()); }}
          >
            <input
              type="search"
              value={searchDraft}
              placeholder="Search Nike, Jordan, Samba…"
              aria-label="Search products"
              onChange={(event) => setSearchDraft(event.target.value)}
            />
            <button type="submit" className="lp-button lp-button-black">Search</button>
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
              <article key={product.id} className={`de-card${product.anyInStock ? '' : ' is-out'}`}>
                <Link href={`/shop/${product.slug}`} className="de-card-media">
                  {product.imageUrls[0] ? (
                    <img src={product.imageUrls[0]} alt={product.name} loading="lazy" />
                  ) : (
                    <span className="de-card-placeholder" aria-hidden="true">
                      {product.name.charAt(0)}
                    </span>
                  )}
                  {!product.anyInStock ? <span className="de-card-flag">Sold out</span> : null}
                </Link>

                <div className="de-card-body">
                  {product.brand ? <p className="de-card-brand">{product.brand}</p> : null}
                  <h2><Link href={`/shop/${product.slug}`}>{product.name}</Link></h2>
                  <p className="de-card-price">{priceLabel(product)}</p>

                  {/* A range rather than every size: a full 36-46 run would be
                      eleven chips per card and unreadable at a glance. The
                      product page carries the exact grid. */}
                  {product.sizesInStock.length ? (
                    <p className="de-card-sizes">
                      <span>EUR</span>
                      <em>{sizeRange(product.sizesInStock)}</em>
                      {product.sizesInStock.length > 1 ? (
                        <small>{product.sizesInStock.length} sizes</small>
                      ) : null}
                    </p>
                  ) : (
                    <p className="de-card-sizes is-none">Out of stock — ask us</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
