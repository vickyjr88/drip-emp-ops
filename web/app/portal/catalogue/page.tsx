"use client";

/**
 * Catalogue: products and the variants that are actually sold.
 *
 * A product is shown as one row with its variants beneath, because that is how
 * someone thinks about stock — "Air Force 1, do we have a EUR 43" — rather than
 * as a flat list of thirty-five SKUs.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ListPager, ListSearch, useListControls } from '../components/list-controls';
import { ListExport } from '../components/list-export';
import { ListThumb } from '../components/list-thumb';
import { ImagePicker } from '../components/image-picker';
import { usePortalDialog } from '../components/portal-dialog';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Variant = {
  id: string; sku: string; name: string; priceKes: string | number;
  costKes?: string | number | null; isActive: boolean;
  attributes?: Record<string, unknown> | null;
};

type Product = {
  id: string; sku: string; name: string; slug: string; brand?: string | null;
  imageUrls?: string[] | null; isActive: boolean;
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
  const [images, setImages] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
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
  const canDelete = hasPermission(profile, 'product.delete');

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const unitPrice = Number(price);
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
          })),
        }),
      }, token);
      setFeedback(`${form.name} added with ${DEFAULT_SIZES.length} sizes.`);
      setForm(BLANK); setPrice(''); setImages([]); setShowForm(false);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
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
                      <span>Price (KES)</span>
                      <input type="number" min="0" value={price} placeholder="3499" required
                        onChange={(event) => setPrice(event.target.value)} />
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
                        <ListThumb sources={[product.imageUrls?.[0]]} label={product.name} />
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

                      {expanded === product.id ? (
                        <div className="portal-table-wrap">
                          <table className="portal-data-table is-doc">
                            <thead>
                              <tr><th>Size</th><th>SKU</th><th>Price</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                              {product.variants.map((variant) => (
                                <tr key={variant.id}>
                                  <td>{variant.name}</td>
                                  <td><code>{variant.sku}</code></td>
                                  <td>{formatMoney(variant.priceKes)}</td>
                                  <td>{variant.isActive ? 'Active' : 'Inactive'}</td>
                                </tr>
                              ))}
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
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
