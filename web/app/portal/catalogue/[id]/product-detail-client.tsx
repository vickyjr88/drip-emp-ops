"use client";

/**
 * One product, and everything you can do to it.
 *
 * The catalogue list could expand a product to *see* its sizes but not add
 * one, so a shoe that arrived in a size the shop had never stocked could not
 * be sold at all without editing the database. The API had the endpoint the
 * whole time; nothing called it.
 *
 * Sizes are edited in place rather than through a modal per field: a shop
 * adding a size usually adds three, and each round trip through a dialog is a
 * reason to give up and do it later.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { ImagePicker } from '../../components/image-picker';
import { usePortalDialog } from '../../components/portal-dialog';
import { OfferQuickAdd, OfferTarget } from '../../components/offer-quick-add';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../../accounting/lib';

type Variant = {
  id: string; sku: string; name: string; isActive: boolean;
  priceKes: string | number;
  resellerPriceKes?: string | number | null;
  wholesalePriceKes?: string | number | null;
  costKes?: string | number | null;
  attributes?: Record<string, unknown> | null;
};

type Product = {
  id: string; sku: string; name: string; slug: string;
  brand?: string | null; description?: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  imageUrls: string[]; featuredImageUrl?: string | null;
  isActive: boolean; variants: Variant[];
};

type Category = { id: string; name: string };

const BLANK_SIZE = {
  name: '', sku: '', priceKes: '', resellerPriceKes: '', wholesalePriceKes: '', costKes: '',
};

const num = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? null : Number(value);

export default function ProductDetailClient({ productId }: { productId: string }) {
  const dialog = usePortalDialog();
  const router = useRouter();

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [details, setDetails] = useState({ name: '', brand: '', description: '', categoryId: '' });
  const [newSize, setNewSize] = useState(BLANK_SIZE);
  const [edits, setEdits] = useState<Record<string, Partial<Variant>>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [offerTarget, setOfferTarget] = useState<OfferTarget | null>(null);

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
      const [next, cats] = await Promise.all([
        apiRequest<Product>(`/products/${productId}`, { method: 'GET' }, authToken),
        apiRequest<Category[]>('/product-categories', { method: 'GET' }, authToken).catch(() => []),
      ]);
      setProduct(next);
      setCategories(cats);
      setDetails({
        name: next.name || '',
        brand: next.brand || '',
        description: next.description || '',
        categoryId: next.categoryId || '',
      });
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void load(token);
  }, [initialized, token, load]);

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!token || saving) return;
    setSaving(true);
    try {
      await apiRequest(`/products/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: details.name.trim(),
          brand: details.brand.trim() || undefined,
          description: details.description.trim() || undefined,
          categoryId: details.categoryId || undefined,
        }),
      }, token);
      setFeedback('Product updated.');
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function addSize(event: FormEvent) {
    event.preventDefault();
    if (!token || saving || !product) return;
    if (!newSize.name.trim() || !newSize.priceKes) {
      setErrorMessage('A size and a retail price are needed.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/products/${productId}/variants`, {
        method: 'POST',
        body: JSON.stringify({
          name: newSize.name.trim(),
          // Derived from the product SKU so it matches the pattern the rest of
          // the catalogue uses, unless the shop types its own.
          sku: (newSize.sku.trim() || `${product.sku}-${newSize.name.trim().replace(/\s+/g, '')}`).toUpperCase(),
          attributes: { size: newSize.name.trim() },
          priceKes: Number(newSize.priceKes),
          resellerPriceKes: num(newSize.resellerPriceKes) ?? undefined,
          wholesalePriceKes: num(newSize.wholesalePriceKes) ?? undefined,
          costKes: num(newSize.costKes) ?? undefined,
        }),
      }, token);
      setFeedback(`${newSize.name} added.`);
      setNewSize(BLANK_SIZE);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function saveVariant(variant: Variant) {
    if (!token) return;
    const edit = edits[variant.id];
    if (!edit) return;
    setSaving(true);
    try {
      await apiRequest(`/products/variants/${variant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(edit.name !== undefined ? { name: String(edit.name) } : {}),
          ...(edit.priceKes !== undefined ? { priceKes: Number(edit.priceKes) } : {}),
          // Null clears a trade price; the API distinguishes that from unset.
          ...(edit.resellerPriceKes !== undefined ? { resellerPriceKes: num(edit.resellerPriceKes as any) } : {}),
          ...(edit.wholesalePriceKes !== undefined ? { wholesalePriceKes: num(edit.wholesalePriceKes as any) } : {}),
          ...(edit.costKes !== undefined ? { costKes: num(edit.costKes as any) } : {}),
        }),
      }, token);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[variant.id];
        return next;
      });
      setFeedback(`${variant.sku} updated.`);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function toggleVariant(variant: Variant) {
    if (!token) return;
    try {
      await apiRequest(`/products/variants/${variant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !variant.isActive }),
      }, token);
      setFeedback(`${variant.sku} ${variant.isActive ? 'hidden' : 'back on sale'}.`);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function deleteVariant(variant: Variant) {
    if (!token) return;
    const ok = await dialog.confirm({
      title: `Delete ${variant.sku}?`,
      message: 'This removes the size entirely. If it has ever been sold, hide it instead.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/products/variants/${variant.id}`, { method: 'DELETE' }, token);
      setFeedback(`${variant.sku} deleted.`);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function setImages(urls: string[]) {
    if (!token || !product) return;
    try {
      await apiRequest(`/products/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          imageUrls: urls,
          // Keep the featured image only while it is still one of them.
          featuredImageUrl: urls.includes(product.featuredImageUrl || '')
            ? product.featuredImageUrl
            : urls[0],
        }),
      }, token);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading product...</article>
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

  if (!product) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card">
              <h2>Product not found</h2>
              <Link href="/portal/catalogue" className="portal-inline-btn">Back to Catalogue</Link>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  const canUpdate = hasPermission(profile, 'product.update');
  const canDelete = hasPermission(profile, 'product.delete');
  const canCreateOffer = hasPermission(profile, 'offer.create');

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="catalogue"
            pageTitle={product.name}
            pageSubtitle={`${product.sku}${product.brand ? ` · ${product.brand}` : ''} · ${product.variants.length} size${product.variants.length === 1 ? '' : 's'}`}
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <div className="portal-inline-actions" style={{ marginBottom: 16 }}>
              <Link href="/portal/catalogue" className="portal-inline-btn">← Catalogue</Link>
              <Link href={`/shop/${product.slug}`} className="portal-inline-btn" target="_blank">
                View on the shop
              </Link>
            </div>

            {/* ---- Sizes: the reason this page exists ------------------- */}
            <article className="portal-card" style={{ marginBottom: 20 }}>
              <h2 style={{ marginTop: 0 }}>Sizes</h2>

              <div className="portal-table-wrap">
                <table className="portal-data-table">
                  <thead>
                    <tr>
                      <th>Size</th><th>SKU</th>
                      <th className="portal-num">Retail</th>
                      <th className="portal-num">Reseller</th>
                      <th className="portal-num">Wholesale</th>
                      <th className="portal-num">Cost</th>
                      <th>Status</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map((variant) => {
                      const edit = edits[variant.id] || {};
                      const dirty = Object.keys(edit).length > 0;
                      const field = (key: keyof Variant) =>
                        edit[key] !== undefined ? String(edit[key] ?? '') : String(variant[key] ?? '');
                      const change = (key: keyof Variant, value: string) =>
                        setEdits((prev) => ({ ...prev, [variant.id]: { ...prev[variant.id], [key]: value } }));

                      return (
                        <tr key={variant.id}>
                          <td>
                            <input className="portal-cell-input" value={field('name')}
                              disabled={!canUpdate}
                              onChange={(event) => change('name', event.target.value)} />
                          </td>
                          <td><code>{variant.sku}</code></td>
                          {(['priceKes', 'resellerPriceKes', 'wholesalePriceKes', 'costKes'] as const).map((key) => (
                            <td key={key} className="portal-num">
                              <input className="portal-cell-input is-num" type="number" min="0"
                                value={field(key)} disabled={!canUpdate}
                                placeholder={key === 'priceKes' ? '' : '—'}
                                onChange={(event) => change(key, event.target.value)} />
                            </td>
                          ))}
                          <td>{variant.isActive ? 'On sale' : 'Hidden'}</td>
                          <td>
                            <span className="portal-inline-actions">
                              {dirty ? (
                                <button type="button" className="portal-inline-btn" disabled={saving}
                                  onClick={() => void saveVariant(variant)}>
                                  Save
                                </button>
                              ) : null}
                              {canUpdate ? (
                                <button type="button" className="portal-linkish"
                                  onClick={() => void toggleVariant(variant)}>
                                  {variant.isActive ? 'Hide' : 'Show'}
                                </button>
                              ) : null}
                              {canCreateOffer && variant.isActive ? (
                                <button type="button" className="portal-linkish"
                                  onClick={() => setOfferTarget({
                                    variantId: variant.id,
                                    sku: variant.sku,
                                    label: `${product.name} · ${variant.name}`,
                                    priceKes: Number(variant.priceKes),
                                    costKes: num(variant.costKes),
                                  })}>
                                  Offer
                                </button>
                              ) : null}
                              {canDelete ? (
                                <button type="button" className="portal-linkish"
                                  onClick={() => void deleteVariant(variant)}>
                                  Delete
                                </button>
                              ) : null}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {canUpdate ? (
                <form className="portal-entity-form" style={{ marginTop: 18 }} onSubmit={addSize}>
                  <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Add a size</h3>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Size</span>
                      <input value={newSize.name} placeholder="EUR 45" required
                        onChange={(event) => setNewSize((p) => ({ ...p, name: event.target.value }))} />
                    </label>
                    <label>
                      <span>SKU (optional)</span>
                      <input value={newSize.sku} placeholder={`${product.sku}-EUR45`}
                        onChange={(event) => setNewSize((p) => ({ ...p, sku: event.target.value }))} />
                    </label>
                    <label>
                      <span>Retail (KES)</span>
                      <input type="number" min="0" required value={newSize.priceKes}
                        onChange={(event) => setNewSize((p) => ({ ...p, priceKes: event.target.value }))} />
                    </label>
                  </div>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Reseller (KES)</span>
                      <input type="number" min="0" value={newSize.resellerPriceKes}
                        onChange={(event) => setNewSize((p) => ({ ...p, resellerPriceKes: event.target.value }))} />
                    </label>
                    <label>
                      <span>Wholesale (KES)</span>
                      <input type="number" min="0" value={newSize.wholesalePriceKes}
                        onChange={(event) => setNewSize((p) => ({ ...p, wholesalePriceKes: event.target.value }))} />
                    </label>
                    <label>
                      <span>Cost (KES)</span>
                      <input type="number" min="0" value={newSize.costKes}
                        onChange={(event) => setNewSize((p) => ({ ...p, costKes: event.target.value }))} />
                    </label>
                  </div>
                  <div className="portal-inline-actions" style={{ marginTop: 12 }}>
                    <button type="submit" className="portal-primary-btn" disabled={saving}>
                      {saving ? 'Adding…' : 'Add size'}
                    </button>
                  </div>
                </form>
              ) : null}
            </article>

            {/* ---- Details --------------------------------------------- */}
            <article className="portal-card" style={{ marginBottom: 20 }}>
              <h2 style={{ marginTop: 0 }}>Details</h2>
              <form className="portal-entity-form" onSubmit={saveDetails}>
                <div className="portal-entity-grid-2">
                  <label>
                    <span>Name</span>
                    <input value={details.name} disabled={!canUpdate}
                      onChange={(event) => setDetails((p) => ({ ...p, name: event.target.value }))} />
                  </label>
                  <label>
                    <span>Brand</span>
                    <input value={details.brand} disabled={!canUpdate}
                      onChange={(event) => setDetails((p) => ({ ...p, brand: event.target.value }))} />
                  </label>
                </div>
                <label>
                  <span>Category</span>
                  <select value={details.categoryId} disabled={!canUpdate}
                    onChange={(event) => setDetails((p) => ({ ...p, categoryId: event.target.value }))}>
                    <option value="">Uncategorised</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Description</span>
                  <textarea rows={3} value={details.description} disabled={!canUpdate}
                    onChange={(event) => setDetails((p) => ({ ...p, description: event.target.value }))} />
                </label>
                {canUpdate ? (
                  <div className="portal-inline-actions">
                    <button type="submit" className="portal-primary-btn" disabled={saving}>
                      {saving ? 'Saving…' : 'Save details'}
                    </button>
                  </div>
                ) : null}
              </form>
            </article>

            {/* ---- Images ---------------------------------------------- */}
            <article className="portal-card">
              <div className="portal-card-head">
                <h2 style={{ margin: 0 }}>Images</h2>
                {canUpdate ? (
                  <button type="button" className="portal-inline-btn" onClick={() => setPickerOpen(true)}>
                    Add images
                  </button>
                ) : null}
              </div>

              {product.imageUrls.length === 0 ? (
                <div className="portal-empty-state">
                  No images yet. A product without a photo rarely sells online.
                </div>
              ) : (
                <div className="portal-image-grid">
                  {product.imageUrls.map((url) => (
                    <figure key={url} className="portal-image-tile">
                      <img src={url} alt="" />
                      <figcaption>
                        {product.featuredImageUrl === url ? (
                          <strong>Featured</strong>
                        ) : canUpdate ? (
                          <button type="button" className="portal-linkish"
                            onClick={() => void apiRequest(`/products/${productId}`, {
                              method: 'PATCH', body: JSON.stringify({ featuredImageUrl: url }),
                            }, token).then(() => load(token))}>
                            Make featured
                          </button>
                        ) : null}
                        {canUpdate ? (
                          <button type="button" className="portal-linkish"
                            onClick={() => void setImages(product.imageUrls.filter((item) => item !== url))}>
                            Remove
                          </button>
                        ) : null}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </article>

            <ImagePicker
              open={pickerOpen}
              token={token}
              multiple
              usedUrls={product.imageUrls}
              title={`Images for ${product.name}`}
              onClose={() => setPickerOpen(false)}
              // onSelect already hands over URLs; onSelectItems is for callers
              // that need the object key too, which this one does not.
              onSelect={(urls) =>
                void setImages([
                  ...product.imageUrls,
                  ...urls.filter((url) => !product.imageUrls.includes(url)),
                ])
              }
            />

            {offerTarget ? (
              <OfferQuickAdd
                target={offerTarget}
                token={token}
                onClose={() => setOfferTarget(null)}
                onDone={(message) => setFeedback(message)}
              />
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
