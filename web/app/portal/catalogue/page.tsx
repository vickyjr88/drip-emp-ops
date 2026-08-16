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
import { ListPager, ListSearch, useListControls } from '../components/list-controls';
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
/** Shoes sell by size, so a new product starts with the usual run. */
const DEFAULT_SIZES = ['EUR 39', 'EUR 41', 'EUR 42', 'EUR 43', 'EUR 44'];

export default function CataloguePage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
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
      const [rows, cats] = await Promise.all([
        apiRequest<Product[]>('/products', { method: 'GET' }, authToken),
        apiRequest<Category[]>('/product-categories', { method: 'GET' }, authToken),
      ]);
      setProducts(rows);
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

  const rows = useMemo(
    () => products.map((product) => ({
      ...product,
      categoryName: product.category?.name || '',
      brandName: product.brand || '',
      priceFrom: product.variants.length
        ? Math.min(...product.variants.map((variant) => Number(variant.priceKes)))
        : 0,
    })),
    [products],
  );

  const controls = useListControls(rows, (row) => [row.name, row.sku, row.brandName, row.categoryName]);

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
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSavingVariant(null);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
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
          // One variant per size at the same price; edit individually after.
          variants: DEFAULT_SIZES.map((size) => ({
            sku: `${form.sku}-${size.replace(/\s+/g, '')}`,
            name: size,
            attributes: { size },
            priceKes: unitPrice,
            costKes: optionalNumber(cost),
            resellerPriceKes: optionalNumber(resellerPrice),
            wholesalePriceKes: optionalNumber(wholesalePrice),
          })),
        }),
      }, token);
      setFeedback(`${form.name} added with ${DEFAULT_SIZES.length} sizes.`);
      setForm(BLANK); setPrice(''); setCost(''); setResellerPrice('');
      setWholesalePrice(''); setImages([]); setShowForm(false);
      await load(token);
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
                    {products.length} product(s),{' '}
                    {products.reduce((sum, product) => sum + product.variants.length, 0)} variants.
                  </p>
                </div>
                {canCreate && !showForm ? (
                  <button type="button" className="portal-primary-btn" onClick={() => setShowForm(true)}>
                    Add Product
                  </button>
                ) : null}
              </div>

              <div className="list-toolbar">
                <ListSearch controls={controls} placeholder="Search name, SKU or brand…" />
                <ListExport
                  rows={controls.filtered}
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
                {controls.visible.length === 0 ? (
                  <div className="portal-empty-state">
                    {controls.search ? 'No products match that search.' : 'No products yet.'}
                  </div>
                ) : (
                  controls.visible.map((product) => (
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
                                <th>Size</th><th>SKU</th><th>Price</th><th>Cost</th>
                                <th>Margin</th><th>Status</th><th />
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
                                  <td>{formatMoney(variant.priceKes)}</td>
                                  <td>
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
                                  <td>{margin === null ? '—' : `${margin.toFixed(1)}%`}</td>
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
              <ListPager controls={controls} noun="products" />
            </article>
            {offerTarget && token ? (
              <OfferQuickAdd
                target={offerTarget}
                token={token}
                onClose={() => setOfferTarget(null)}
                onDone={(message) => {
                  setFeedback(message);
                  void load(token);
                }}
              />
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
