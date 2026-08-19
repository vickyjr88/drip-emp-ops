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
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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
  /**
   * Null for a product that has never had an image: the column is Json? and the
   * API returns it raw. Declared honestly so every use has to handle it -- it
   * was string[] before, which typechecked while crashing the page on the six
   * of seven products that have no images.
   */
  imageUrls?: string[] | null; featuredImageUrl?: string | null;
  isActive: boolean; variants: Variant[];
};

type Category = { id: string; name: string };

type Store = { id: string; name: string };

/** One variant's stock in one store, as /inventory/levels returns it. */
type Level = { variant: { id: string }; store: { id: string }; quantity: number };

/**
 * Stock-in reasons only, with the inventory page's wording.
 *
 * This panel is for a delivery arriving, so the outward types (SALE, DAMAGE,
 * TRANSFER_OUT) are deliberately absent -- writing stock off from the page
 * where you price it is not a mistake worth making easy. The inventory page
 * still offers the full set.
 */
const MOVEMENT_TYPES = [
  { value: 'PURCHASE', label: 'Received from supplier' },
  { value: 'RETURN', label: 'Customer return' },
  { value: 'TRANSFER_IN', label: 'Transfer in' },
  { value: 'ADJUSTMENT', label: 'Stock count adjustment' },
];

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

  // Restock: stores and current levels, plus the quantities being entered.
  const [stores, setStores] = useState<Store[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [restock, setRestock] = useState({ storeId: '', type: 'PURCHASE', reference: '' });
  /** variantId -> quantity typed against that size. */
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiving, setReceiving] = useState(false);

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
      const [next, cats, storeRows, levelRows] = await Promise.all([
        apiRequest<Product>(`/products/${productId}`, { method: 'GET' }, authToken),
        apiRequest<Category[]>('/product-categories', { method: 'GET' }, authToken).catch(() => []),
        // Both are optional extras for the restock panel: a user without stock
        // permissions still gets the rest of the page rather than an error.
        apiRequest<Store[]>('/stores', { method: 'GET' }, authToken).catch(() => []),
        apiRequest<Level[]>('/inventory/levels', { method: 'GET' }, authToken).catch(() => []),
      ]);
      setProduct(next);
      setCategories(cats);
      setStores(storeRows);
      setLevels(levelRows);
      setRestock((prev) => ({ ...prev, storeId: prev.storeId || storeRows[0]?.id || '' }));
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

  /**
   * Stock for this product's sizes in the chosen store.
   *
   * /inventory/levels has no product filter, so the whole set is fetched and
   * narrowed here -- cheap next to a bespoke endpoint, and the page already
   * knows which variants are its own.
   */
  const stockByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const level of levels) {
      if (restock.storeId && level.store.id !== restock.storeId) continue;
      map.set(level.variant.id, (map.get(level.variant.id) ?? 0) + level.quantity);
    }
    return map;
  }, [levels, restock.storeId]);

  const pendingReceipts = useMemo(
    () => Object.entries(receiveQty)
      .map(([variantId, raw]) => ({ variantId, quantity: Number(String(raw).trim()) }))
      .filter((entry) => Number.isFinite(entry.quantity) && entry.quantity > 0),
    [receiveQty],
  );

  /**
   * Records one movement per size that has a quantity against it.
   *
   * A delivery is several sizes of the same shoe at once, so entering them
   * one at a time through the inventory page is six round trips for one box.
   * The API takes a single movement per call, so these are sent in sequence
   * and the outcome is reported per size: a partial success has to be visible,
   * because the sizes that landed must not be entered a second time.
   */
  async function onReceiveStock(event: FormEvent) {
    event.preventDefault();
    if (!token || receiving) return;
    if (!restock.storeId) {
      setErrorMessage('Choose which store the stock arrived at.');
      return;
    }
    if (pendingReceipts.length === 0) {
      setErrorMessage('Enter a quantity against at least one size.');
      return;
    }

    setReceiving(true);
    const failures: string[] = [];
    let recorded = 0;
    for (const entry of pendingReceipts) {
      const size = product?.variants.find((variant) => variant.id === entry.variantId)?.name ?? entry.variantId;
      try {
        await apiRequest('/inventory/movements', {
          method: 'POST',
          body: JSON.stringify({
            variantId: entry.variantId,
            storeId: restock.storeId,
            type: restock.type,
            quantity: entry.quantity,
            reference: restock.reference.trim() || undefined,
          }),
        }, token);
        recorded += 1;
        // Cleared as it succeeds, so a retry after a partial failure resends
        // only what did not land.
        setReceiveQty((prev) => {
          const next = { ...prev };
          delete next[entry.variantId];
          return next;
        });
      } catch (error) {
        failures.push(`${size}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    setReceiving(false);

    if (failures.length) {
      setErrorMessage(
        `Recorded ${recorded} of ${pendingReceipts.length}. Still to do — ${failures.join('; ')}`,
      );
    } else {
      setFeedback(`Stock recorded for ${recorded} size${recorded === 1 ? '' : 's'}.`);
      setRestock((prev) => ({ ...prev, reference: '' }));
    }
    await load(token);
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

  /**
   * The gallery, always an array.
   *
   * imageUrls is null for a product that has never had an image -- which is
   * most of them -- and the six places below that read it would each need their
   * own guard otherwise. Array.isArray rather than `?? []` because the column
   * is Json: a value that is neither null nor an array is malformed data, and
   * an empty gallery is a better answer than a crash.
   */
  const images = Array.isArray(product.imageUrls) ? product.imageUrls : [];

  const canUpdate = hasPermission(profile, 'product.update');
  const canDelete = hasPermission(profile, 'product.delete');
  const canCreateOffer = hasPermission(profile, 'offer.create');
  // Restocking is a stock permission, not a catalogue one: someone who prices
  // products is not necessarily someone who receives deliveries.
  const canRecordStock = hasPermission(profile, 'stock-movement.create') && stores.length > 0;

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

              {canRecordStock ? (
                <div className="portal-restock-bar">
                  <label>
                    <span>Store</span>
                    <select
                      value={restock.storeId}
                      onChange={(event) => setRestock((prev) => ({ ...prev, storeId: event.target.value }))}
                    >
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>{store.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Reason</span>
                    <select
                      value={restock.type}
                      onChange={(event) => setRestock((prev) => ({ ...prev, type: event.target.value }))}
                    >
                      {MOVEMENT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Reference</span>
                    <input
                      value={restock.reference}
                      placeholder="Delivery note"
                      onChange={(event) => setRestock((prev) => ({ ...prev, reference: event.target.value }))}
                    />
                  </label>
                  <p className="portal-muted">
                    Type quantities in the Receive column, then record them all at once.
                    In-stock figures are for the chosen store.
                  </p>
                </div>
              ) : null}

              <div className="portal-table-wrap">
                <table className="portal-data-table">
                  <thead>
                    <tr>
                      <th>Size</th><th>SKU</th>
                      <th className="portal-num">Retail</th>
                      <th className="portal-num">Reseller</th>
                      <th className="portal-num">Wholesale</th>
                      <th className="portal-num">Cost</th>
                      {canRecordStock ? (
                        <>
                          <th className="portal-num">In stock</th>
                          <th className="portal-num">Receive</th>
                        </>
                      ) : null}
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
                          {canRecordStock ? (
                            <>
                              <td className="portal-num">
                                {stockByVariant.get(variant.id) ?? 0}
                              </td>
                              <td className="portal-num">
                                <input
                                  className="portal-cell-input is-num"
                                  type="number"
                                  min="1"
                                  placeholder="—"
                                  value={receiveQty[variant.id] ?? ''}
                                  // A hidden size can still be received: stock
                                  // arriving is a fact about the box, not about
                                  // whether the shop is currently selling it.
                                  onChange={(event) => setReceiveQty((prev) => ({
                                    ...prev, [variant.id]: event.target.value,
                                  }))}
                                />
                              </td>
                            </>
                          ) : null}
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

              {canRecordStock ? (
                <form className="portal-inline-actions" style={{ marginTop: 14 }} onSubmit={onReceiveStock}>
                  <button
                    type="submit"
                    className="portal-primary-btn"
                    disabled={receiving || pendingReceipts.length === 0}
                  >
                    {receiving
                      ? 'Recording...'
                      : pendingReceipts.length
                        ? `Record ${pendingReceipts.length} movement${pendingReceipts.length === 1 ? '' : 's'}`
                        : 'Record stock'}
                  </button>
                  {pendingReceipts.length ? (
                    <button
                      type="button"
                      className="portal-ghost-btn"
                      onClick={() => setReceiveQty({})}
                    >
                      Clear
                    </button>
                  ) : null}
                </form>
              ) : null}

              {canUpdate ? (
                <form className="portal-entity-form" style={{ marginTop: 18 }} onSubmit={addSize}>
                  <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Add a size</h3>
                  {product.variants.length ? (
                    <label style={{ marginBottom: 12 }}>
                      <span>Copy prices from</span>
                      <select
                        value=""
                        onChange={(event) => {
                          const source = product.variants.find((variant) => variant.id === event.target.value);
                          if (!source) return;
                          // Only the four prices. Size and SKU are what make a
                          // variant distinct -- copying those would produce a
                          // duplicate the API rejects on the unique SKU.
                          setNewSize((prev) => ({
                            ...prev,
                            priceKes: String(source.priceKes ?? ''),
                            resellerPriceKes: source.resellerPriceKes == null ? '' : String(source.resellerPriceKes),
                            wholesalePriceKes: source.wholesalePriceKes == null ? '' : String(source.wholesalePriceKes),
                            costKes: source.costKes == null ? '' : String(source.costKes),
                          }));
                          setFeedback(`Prices copied from ${source.name}. Set the size and add it.`);
                        }}
                      >
                        <option value="">Choose a size to copy…</option>
                        {product.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.name} — {formatMoney(variant.priceKes)}
                          </option>
                        ))}
                      </select>
                      <small className="portal-muted">
                        Fills the four prices below. A new size usually costs and sells
                        for the same as the rest of the run.
                      </small>
                    </label>
                  ) : null}
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

              {images.length === 0 ? (
                <div className="portal-empty-state">
                  No images yet. A product without a photo rarely sells online.
                </div>
              ) : (
                <div className="portal-image-grid">
                  {images.map((url) => (
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
                            onClick={() => void setImages(images.filter((item) => item !== url))}>
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
              usedUrls={images}
              title={`Images for ${product.name}`}
              onClose={() => setPickerOpen(false)}
              // onSelect already hands over URLs; onSelectItems is for callers
              // that need the object key too, which this one does not.
              onSelect={(urls) =>
                void setImages([
                  ...images,
                  ...urls.filter((url) => !images.includes(url)),
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
