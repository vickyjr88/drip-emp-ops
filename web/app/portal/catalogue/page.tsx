"use client";

/**
 * Catalogue: products and the variants that are actually sold.
 *
 * A product is shown as one row with its variants beneath, because that is how
 * someone thinks about stock — "Air Force 1, do we have a EUR 43" — rather than
 * as a flat list of thirty-five SKUs.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { ListExport } from '../components/list-export';
import { ListThumb } from '../components/list-thumb';
import { ImagePicker } from '../components/image-picker';
import { usePortalDialog } from '../components/portal-dialog';
import { OfferQuickAdd, OfferTarget } from '../components/offer-quick-add';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatMoney,
  hasPermission, loadProfile, roleLabelFor, uploadMedia,
} from '../accounting/lib';

type Variant = {
  id: string; sku: string; name: string; priceKes: string | number;
  costKes?: string | number | null; isActive: boolean;
  resellerPriceKes?: string | number | null;
  wholesalePriceKes?: string | number | null;
  attributes?: Record<string, unknown> | null;
};

type Product = {
  id: string; sku: string; name: string; slug: string; brand?: string | null;
  imageUrls?: string[] | null; featuredImageUrl?: string | null; isActive: boolean;
  category?: { id: string; name: string } | null;
  variants: Variant[];
};

type Category = { id: string; name: string; slug: string };

const BLANK = { sku: '', name: '', brand: '', categoryId: '', description: '' };

/**
 * Every size the shop stocks, smallest to largest.
 *
 * The picker offers this whole span and the user ticks what a given shoe
 * actually came in -- runs vary by model (36-42 on one, 40-45 on another), and
 * gaps within a run are normal rather than exceptional.
 */
const SIZE_RANGE = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46];
/** Stored as "EUR 39" -- matches every variant already in the catalogue. */
const sizeLabel = (size: number) => `EUR ${size}`;
/**
 * The run a new product starts with. Previously every product was created with
 * exactly these sizes and no way to change it, which is why the catalogue has
 * no 40s: the default was silently the only option.
 */
const DEFAULT_SIZES = [39, 41, 42, 43, 44];

export default function CataloguePage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [price, setPrice] = useState('');
  // The three trade tiers and the buying cost. Cost is what makes margin and
  // cost of goods work at all: without it every report reads 100% margin.
  const [cost, setCost] = useState('');
  const [resellerPrice, setResellerPrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  /** Sizes ticked for the product being created, as numbers from SIZE_RANGE. */
  const [sizes, setSizes] = useState<number[]>(DEFAULT_SIZES);
  /** The product being duplicated, or null when the panel is closed. */
  const [duplicateOf, setDuplicateOf] = useState<Product | null>(null);
  const [duplicateForm, setDuplicateForm] = useState({ sku: '', name: '' });
  const [duplicating, setDuplicating] = useState(false);
  /** variantId -> draft cost, while a row is being edited. */
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [savingVariant, setSavingVariant] = useState<string | null>(null);
  /** The variant being put on offer, or null when the dialog is closed. */
  const [offerTarget, setOfferTarget] = useState<OfferTarget | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Managing images on a product that already exists, which is most of them:
  // the create form only ever covered new ones.
  const [imageFor, setImageFor] = useState<Product | null>(null);
  const [editPickerOpen, setEditPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      const cats = await apiRequest<Category[]>('/product-categories', { method: 'GET' }, authToken);
      setCategories(cats);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
  }, [setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void load(token);
  }, [initialized, token, load]);

  const fetchProductsPage = useCallback(
    async (params: { skip: number; take: number; search: string }): Promise<ServerPage<Product>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      return apiRequest<ServerPage<Product>>(`/products?${query}`, { method: 'GET' }, token);
    },
    [token],
  );

  const productsPager = useServerPager<Product>({
    fetchPage: (params) => fetchProductsPage(params),
    enabled: Boolean(token),
  });

  const [exportRows, setExportRows] = useState<Product[]>([]);
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      void fetchProductsPage({ skip: 0, take: 500, search: productsPager.search }).then((page) =>
        setExportRows(page.items),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [fetchProductsPage, productsPager.search, token]);

  const shapeRow = (product: Product) => ({
    ...product,
    categoryName: product.category?.name || '',
    brandName: product.brand || '',
    priceFrom: product.variants.length
      ? Math.min(...product.variants.map((variant) => Number(variant.priceKes)))
      : 0,
  });

  const rows = useMemo(() => productsPager.items.map(shapeRow), [productsPager.items]);
  const exportRowsShaped = useMemo(() => exportRows.map(shapeRow), [exportRows]);

  const canCreate = hasPermission(profile, 'product.create');
  const canUpdate = hasPermission(profile, 'product.update');
  const canCreateOffer = hasPermission(profile, 'offer.create');
  const canDelete = hasPermission(profile, 'product.delete');

  /**
   * Saves one variant's buying cost.
   *
   * Cost is edited per size rather than per product because sizes are often
   * bought at different prices, and it is the per-variant figure that cost of
   * goods and margin are calculated from.
   */
  async function onSaveCost(variantId: string) {
    if (!token || savingVariant) return;
    const raw = (costDrafts[variantId] ?? '').trim();
    setSavingVariant(variantId);
    try {
      await apiRequest(`/products/variants/${variantId}`, {
        method: 'PATCH',
        // Clearing the field sets cost back to unrecorded rather than to zero.
        body: JSON.stringify({ costKes: raw === '' ? null : Number(raw) }),
      }, token);
      setCostDrafts((prev) => {
        const next = { ...prev };
        delete next[variantId];
        return next;
      });
      setFeedback('Cost updated.');
      await load(token);
      productsPager.reload();
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSavingVariant(null);
    }
  }

  /**
   * Creates a copy of a product with its whole size run and price tiers.
   *
   * The copy is inactive and unstocked, so it lands in the list needing a
   * deliberate Reactivate before it can be sold -- a colourway that has not
   * been received yet should not be orderable.
   */
  async function onDuplicate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !duplicateOf) return;
    setDuplicating(true);
    try {
      const created = await apiRequest<Product>(`/products/${duplicateOf.id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({
          sku: duplicateForm.sku.trim().toUpperCase(),
          name: duplicateForm.name.trim(),
        }),
      }, token);
      setFeedback(
        `${created.name} created from ${duplicateOf.name} with ${created.variants.length} size(s). It is inactive until you reactivate it.`,
      );
      setDuplicateOf(null);
      setDuplicateForm({ sku: '', name: '' });
      await load(token);
      productsPager.reload();
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setDuplicating(false);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    // A product with no variants cannot be sold at all, so this is refused
    // here rather than creating a shell someone has to notice and fix later.
    if (sizes.length === 0) {
      setErrorMessage('Pick at least one size — a product with no sizes cannot be sold.');
      return;
    }
    setSaving(true);
    try {
      const unitPrice = Number(price);
      // Blank stays blank rather than becoming 0: an unset cost is "we have
      // not recorded it", which the reports flag, while 0 would claim the
      // shoes were free and show a 100% margin as though it were real.
      const optionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value));
      await apiRequest('/products', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          categoryId: form.categoryId || undefined,
          imageUrls: images.length ? images : undefined,
          // One variant per ticked size at the same price; edit individually
          // after. Sorted so the sizes read smallest-first however they were
          // ticked, which is also the order the table shows them in.
          variants: [...sizes].sort((a, b) => a - b).map((size) => ({
            sku: `${form.sku}-EUR${size}`,
            name: sizeLabel(size),
            attributes: { size: sizeLabel(size) },
            priceKes: unitPrice,
            costKes: optionalNumber(cost),
            resellerPriceKes: optionalNumber(resellerPrice),
            wholesalePriceKes: optionalNumber(wholesalePrice),
          })),
        }),
      }, token);
      setFeedback(`${form.name} added with ${sizes.length} size${sizes.length === 1 ? '' : 's'}.`);
      setForm(BLANK); setPrice(''); setCost(''); setResellerPrice('');
      setWholesalePrice(''); setImages([]); setSizes(DEFAULT_SIZES); setShowForm(false);
      await load(token);
      productsPager.reload();
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  /** Writes the gallery back, optionally changing which image is featured. */
  async function saveImages(product: Product, urls: string[], featured?: string) {
    if (!token) return;
    try {
      await apiRequest(`/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ imageUrls: urls, ...(featured ? { featuredImageUrl: featured } : {}) }),
      }, token);
      setImageFor((prev) => (prev && prev.id === product.id ? { ...prev, imageUrls: urls } : prev));
      await load(token);
      productsPager.reload();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function onUploadImages(product: Product, files: FileList | null) {
    if (!token || !files?.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(Array.from(files).map((file) => uploadMedia(file, token)));
      const urls = uploaded.map((item) => item.url).filter(Boolean);
      await saveImages(product, [...(product.imageUrls || []), ...urls]);
      setFeedback(`${urls.length} image(s) added to ${product.name}.`);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(product: Product) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Product',
      message: `Delete ${product.name} and its ${product.variants.length} variants? A product that has sold cannot be deleted — deactivate it instead so order history stays intact.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/products/${product.id}`, { method: 'DELETE' }, token);
      setFeedback(`${product.name} deleted.`);
      await load(token);
      productsPager.reload();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function onToggle(product: Product) {
    if (!token) return;
    try {
      await apiRequest(`/products/${product.id}`, {
        method: 'PATCH', body: JSON.stringify({ isActive: !product.isActive }),
      }, token);
      setFeedback(`${product.name} ${product.isActive ? 'deactivated' : 'reactivated'}.`);
      await load(token);
      productsPager.reload();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading catalogue...</article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card">
              <h2>Authentication required</h2>
              <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                Go to Portal Login
              </Link>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="catalogue"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Catalogue"
            pageSubtitle="Products and the sizes they come in."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            {showForm && canCreate ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Add Product</h2>
                <p className="portal-muted">
                  Creates one variant per size at the same price. Adjust individual sizes afterwards.
                </p>
                <form className="portal-entity-form" onSubmit={onCreate}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>SKU</span>
                      <input value={form.sku} placeholder="AF1-WHT" required
                        onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value.toUpperCase() }))} />
                    </label>
                    <label>
                      <span>Name</span>
                      <input value={form.name} placeholder="Air Force 1 White" required
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
                    </label>
                  </div>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Brand</span>
                      <input value={form.brand} placeholder="Nike"
                        onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))} />
                    </label>
                    <label>
                      <span>Category</span>
                      <select value={form.categoryId}
                        onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}>
                        <option value="">Uncategorised</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Retail price (KES)</span>
                      <input type="number" min="0" value={price} placeholder="3499" required
                        onChange={(event) => setPrice(event.target.value)} />
                    </label>
                  </div>

                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Cost (KES)</span>
                      <input type="number" min="0" value={cost} placeholder="2000"
                        onChange={(event) => setCost(event.target.value)} />
                      <small className="portal-muted">
                        What you paid. Without it margin and cost of goods read as zero.
                      </small>
                    </label>
                    <label>
                      <span>Reseller price (KES)</span>
                      <input type="number" min="0" value={resellerPrice} placeholder="2800"
                        onChange={(event) => setResellerPrice(event.target.value)} />
                      <small className="portal-muted">Competing shops. Falls back to retail.</small>
                    </label>
                    <label>
                      <span>Wholesale price (KES)</span>
                      <input type="number" min="0" value={wholesalePrice} placeholder="2500"
                        onChange={(event) => setWholesalePrice(event.target.value)} />
                      <small className="portal-muted">Bulk. The keenest of the three.</small>
                    </label>
                  </div>

                  <label>
                    <span>Sizes</span>
                    <div className="portal-size-picker">
                      {SIZE_RANGE.map((size) => {
                        const picked = sizes.includes(size);
                        return (
                          <button
                            key={size}
                            type="button"
                            aria-pressed={picked}
                            className={`portal-size-toggle${picked ? ' is-picked' : ''}`}
                            onClick={() =>
                              setSizes((prev) =>
                                prev.includes(size)
                                  ? prev.filter((value) => value !== size)
                                  : [...prev, size],
                              )
                            }
                          >
                            {size}
                          </button>
                        );
                      })}
                    </div>
                    <div className="portal-inline-actions">
                      <button type="button" className="portal-inline-btn"
                        onClick={() => setSizes(SIZE_RANGE)}>
                        All
                      </button>
                      <button type="button" className="portal-inline-btn"
                        onClick={() => setSizes(DEFAULT_SIZES)}>
                        Usual run
                      </button>
                      <button type="button" className="portal-inline-btn"
                        onClick={() => setSizes([])}>
                        Clear
                      </button>
                    </div>
                    <small className="portal-muted">
                      {sizes.length
                        ? `${sizes.length} size${sizes.length === 1 ? '' : 's'}, all at the price above. Adjust individually afterwards.`
                        : 'Pick at least one size.'}
                    </small>
                  </label>

                  <label>
                    <span>Images</span>
                    <div className="portal-inline-actions">
                      <button type="button" className="portal-inline-btn" onClick={() => setPickerOpen(true)}>
                        Choose Existing
                      </button>
                    </div>
                    {images.length ? (
                      <p className="portal-muted">{images.length} image(s) selected</p>
                    ) : null}
                  </label>
                  <ImagePicker
                    open={pickerOpen}
                    token={token}
                    multiple
                    onClose={() => setPickerOpen(false)}
                    onSelect={(urls) => setImages((prev) => [...prev, ...urls.filter((u) => !prev.includes(u))])}
                    usedUrls={images}
                    title="Choose product images"
                  />

                  <div className="portal-inline-actions">
                    <button type="submit" className="portal-primary-btn" disabled={saving}>
                      {saving ? 'Saving...' : 'Add Product'}
                    </button>
                    <button type="button" className="portal-ghost-btn" onClick={() => setShowForm(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </article>
            ) : null}

            <article className="portal-card">
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Products</h2>
                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                    {productsPager.total} product(s).
                  </p>
                </div>
                {canCreate && !showForm ? (
                  <button type="button" className="portal-primary-btn" onClick={() => setShowForm(true)}>
                    Add Product
                  </button>
                ) : null}
              </div>

              <div className="list-toolbar">
                <ServerListSearch pager={productsPager} placeholder="Search name, SKU or brand…" />
                <ListExport
                  rows={exportRowsShaped}
                  config={{
                    fileName: 'catalogue',
                    columns: [
                      { header: 'SKU', value: (row) => row.sku },
                      { header: 'Name', value: (row) => row.name },
                      { header: 'Brand', value: (row) => row.brandName },
                      { header: 'Category', value: (row) => row.categoryName },
                      { header: 'Variants', value: (row) => row.variants.length },
                      { header: 'Price From', value: (row) => row.priceFrom },
                      { header: 'Active', value: (row) => (row.isActive ? 'Yes' : 'No') },
                    ],
                  }}
                />
              </div>

              <div className="portal-list-stack">
                {!productsPager.loading && rows.length === 0 ? (
                  <div className="portal-empty-state">
                    {productsPager.search ? 'No products match that search.' : 'No products yet.'}
                  </div>
                ) : (
                  rows.map((product) => (
                    <div key={product.id} className="portal-record">
                      <div className="portal-list-row has-thumb">
                        <ListThumb sources={[product.featuredImageUrl, product.imageUrls?.[0]]} label={product.name} />
                        <div>
                          <strong>
                            {product.name}
                            {product.isActive ? '' : ' (inactive)'}
                          </strong>
                          <p className="portal-muted">
                            {product.sku}
                            {product.brandName ? ` · ${product.brandName}` : ''}
                            {product.categoryName ? ` · ${product.categoryName}` : ''}
                          </p>
                          <p>
                            {product.variants.length} size(s) from {formatMoney(product.priceFrom)}
                          </p>
                        </div>
                        <div className="portal-action-row">
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => setExpanded(expanded === product.id ? null : product.id)}
                          >
                            {expanded === product.id ? 'Hide Sizes' : 'Sizes'}
                          </button>
                          <Link href={`/portal/catalogue/${product.id}`} className="portal-inline-btn">
                            Manage
                          </Link>
                          {canCreate ? (
                            <button
                              type="button"
                              className="portal-inline-btn"
                              onClick={() => {
                                setDuplicateOf(product);
                                // Prefilled from the source so the usual case --
                                // another colourway -- is an edit rather than
                                // retyping the model name from scratch.
                                setDuplicateForm({ sku: '', name: product.name });
                              }}
                            >
                              Duplicate
                            </button>
                          ) : null}
                          {canUpdate ? (
                            <button
                              type="button"
                              className="portal-inline-btn"
                              onClick={() => setImageFor(imageFor?.id === product.id ? null : product)}
                            >
                              {product.imageUrls?.length
                                ? `Images (${product.imageUrls.length})`
                                : 'Add Images'}
                            </button>
                          ) : null}
                          {canUpdate ? (
                            <button type="button" className="portal-inline-btn" onClick={() => void onToggle(product)}>
                              {product.isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDelete(product)}>
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {duplicateOf?.id === product.id ? (
                        <div className="portal-media-section">
                          <h3 style={{ margin: 0 }}>Duplicate {product.name}</h3>
                          <p className="portal-muted" style={{ margin: '4px 0 12px' }}>
                            Copies the description, images and all {product.variants.length} size(s)
                            with their prices. Stock is not copied, and the copy starts inactive.
                          </p>
                          <form className="portal-entity-form" onSubmit={onDuplicate}>
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>New SKU</span>
                                <input
                                  value={duplicateForm.sku}
                                  placeholder={`${product.sku}-2`}
                                  required
                                  onChange={(event) => setDuplicateForm((prev) => ({
                                    ...prev, sku: event.target.value.toUpperCase(),
                                  }))}
                                />
                                <small className="portal-muted">
                                  Each size gets its own SKU built from this one.
                                </small>
                              </label>
                              <label>
                                <span>New name</span>
                                <input
                                  value={duplicateForm.name}
                                  placeholder="Air Force 1 Black"
                                  required
                                  onChange={(event) => setDuplicateForm((prev) => ({
                                    ...prev, name: event.target.value,
                                  }))}
                                />
                              </label>
                            </div>
                            <div className="portal-inline-actions">
                              <button type="submit" className="portal-primary-btn" disabled={duplicating}>
                                {duplicating ? 'Copying...' : 'Create Copy'}
                              </button>
                              <button
                                type="button"
                                className="portal-ghost-btn"
                                onClick={() => setDuplicateOf(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : null}

                      {imageFor?.id === product.id ? (
                        <div className="portal-media-section">
                          <div className="portal-card-header-row">
                            <div>
                              <h3 style={{ margin: 0 }}>Images</h3>
                              <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                Mark one as featured — that is the image shoppers see on a card,
                                in search results and when the link is shared.
                              </p>
                            </div>
                            <div className="portal-inline-actions">
                              <button
                                type="button"
                                className="portal-inline-btn"
                                disabled={uploading}
                                onClick={() => fileInputRef.current?.click()}
                              >
                                {uploading ? 'Uploading...' : 'Upload'}
                              </button>
                              <button
                                type="button"
                                className="portal-inline-btn"
                                onClick={() => setEditPickerOpen(true)}
                              >
                                Choose Existing
                              </button>
                            </div>
                          </div>

                          {product.imageUrls?.length ? (
                            <div className="portal-project-gallery-grid" style={{ marginTop: 12 }}>
                              {product.imageUrls.map((url, index) => (
                                <div
                                  key={`${url}-${index}`}
                                  className={`portal-project-gallery-item${
                                    (product.featuredImageUrl || product.imageUrls?.[0]) === url ? ' is-featured' : ''
                                  }`}
                                >
                                  <img src={url} alt="" className="portal-project-gallery-thumb" />
                                  <div className="portal-gallery-item-actions">
                                    {(product.featuredImageUrl || product.imageUrls?.[0]) === url ? (
                                      <span className="portal-featured-badge">Featured</span>
                                    ) : (
                                      <button
                                        type="button"
                                        className="portal-inline-btn"
                                        onClick={() =>
                                          void saveImages(product, product.imageUrls || [], url)
                                        }
                                      >
                                        Make Featured
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="portal-inline-btn is-danger"
                                      onClick={() =>
                                        void saveImages(
                                          product,
                                          (product.imageUrls || []).filter((item) => item !== url),
                                        )
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="portal-empty-state" style={{ marginTop: 12 }}>
                              No images yet. A product without a photo is the one shoppers scroll past.
                            </div>
                          )}

                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            onChange={(event) => {
                              void onUploadImages(product, event.target.files);
                              event.target.value = '';
                            }}
                          />
                          <ImagePicker
                            open={editPickerOpen}
                            token={token}
                            multiple
                            onClose={() => setEditPickerOpen(false)}
                            onSelect={(urls) => {
                              const existing = product.imageUrls || [];
                              void saveImages(product, [
                                ...existing,
                                ...urls.filter((url) => !existing.includes(url)),
                              ]);
                            }}
                            usedUrls={product.imageUrls || []}
                            title={`Images for ${product.name}`}
                          />
                        </div>
                      ) : null}

                      {expanded === product.id ? (
                        <div className="portal-table-wrap">
                          <table className="portal-data-table is-doc">
                            <thead>
                              <tr>
                                <th>Size</th><th>SKU</th>
                                <th className="portal-num">Retail</th>
                                <th className="portal-num">Reseller</th>
                                <th className="portal-num">Wholesale</th>
                                <th className="portal-num">Cost</th>
                                <th className="portal-num">Margin</th>
                                <th>Status</th><th />
                              </tr>
                            </thead>
                            <tbody>
                              {product.variants.map((variant) => {
                                const cost =
                                  variant.costKes === null || variant.costKes === undefined
                                    ? null
                                    : Number(variant.costKes);
                                const priceValue = Number(variant.priceKes);
                                const margin =
                                  cost === null || !priceValue
                                    ? null
                                    : ((priceValue - cost) / priceValue) * 100;
                                const draft = costDrafts[variant.id];
                                const editing = draft !== undefined;
                                return (
                                <tr key={variant.id}>
                                  <td>{variant.name}</td>
                                  <td><code>{variant.sku}</code></td>
                                  <td className="portal-num">{formatMoney(variant.priceKes)}</td>
                                  <td className="portal-num">
                                    {/* Falls back to retail, which is what the
                                        API does when a tier is unset -- showing
                                        a dash would imply a shop cannot buy. */}
                                    {variant.resellerPriceKes
                                      ? formatMoney(variant.resellerPriceKes)
                                      : <span className="portal-muted">{formatMoney(variant.priceKes)}</span>}
                                  </td>
                                  <td className="portal-num">
                                    {variant.wholesalePriceKes
                                      ? formatMoney(variant.wholesalePriceKes)
                                      : <span className="portal-muted">{formatMoney(variant.priceKes)}</span>}
                                  </td>
                                  <td className="portal-num">
                                    {editing ? (
                                      <span className="portal-inline-actions">
                                        <input
                                          type="number"
                                          min="0"
                                          autoFocus
                                          value={draft}
                                          style={{ width: 92 }}
                                          onChange={(event) =>
                                            setCostDrafts((prev) => ({
                                              ...prev,
                                              [variant.id]: event.target.value,
                                            }))
                                          }
                                        />
                                        <button
                                          type="button"
                                          className="portal-inline-btn"
                                          disabled={savingVariant === variant.id}
                                          onClick={() => void onSaveCost(variant.id)}
                                        >
                                          {savingVariant === variant.id ? 'Saving' : 'Save'}
                                        </button>
                                        <button
                                          type="button"
                                          className="portal-inline-btn"
                                          onClick={() =>
                                            setCostDrafts((prev) => {
                                              const next = { ...prev };
                                              delete next[variant.id];
                                              return next;
                                            })
                                          }
                                        >
                                          Cancel
                                        </button>
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        className="portal-linkish"
                                        onClick={() =>
                                          setCostDrafts((prev) => ({
                                            ...prev,
                                            [variant.id]: cost === null ? '' : String(cost),
                                          }))
                                        }
                                      >
                                        {/* An unset cost is called out rather than shown as a
                                            dash: it is the reason margin reads 100%. */}
                                        {cost === null ? 'Set cost' : formatMoney(cost)}
                                      </button>
                                    )}
                                  </td>
                                  <td className="portal-num">{margin === null ? '—' : `${margin.toFixed(1)}%`}</td>
                                  <td>{variant.isActive ? 'Active' : 'Inactive'}</td>
                                  <td>
                                    {/* Straight from the row: someone looking
                                        at a size that is not moving should not
                                        have to find it again elsewhere. */}
                                    {canCreateOffer ? (
                                      <button
                                        type="button"
                                        className="portal-linkish"
                                        onClick={() =>
                                          setOfferTarget({
                                            variantId: variant.id,
                                            sku: variant.sku,
                                            label: `${product.name} · ${variant.name}`,
                                            priceKes: priceValue,
                                            costKes: cost,
                                          })
                                        }
                                      >
                                        Put on offer
                                      </button>
                                    ) : null}
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
              <ServerListPager pager={productsPager} noun="products" />
            </article>
            {offerTarget && token ? (
              <OfferQuickAdd
                target={offerTarget}
                token={token}
                onClose={() => setOfferTarget(null)}
                onDone={(message) => {
                  setFeedback(message);
                  void load(token);
                  productsPager.reload();
                }}
              />
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
