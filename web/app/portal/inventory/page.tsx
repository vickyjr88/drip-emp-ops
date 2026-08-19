"use client";

/**
 * Inventory: what is on the shelf, and every movement that put it there.
 *
 * The movement form covers receiving, adjustments, damage and transfers,
 * because they are the same action with a different reason, and a separate
 * screen per reason would only spread the same three fields across four pages.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ListPager, ListSearch, useListControls } from '../components/list-controls';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { ListExport } from '../components/list-export';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { OfferQuickAdd, OfferTarget } from '../components/offer-quick-add';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDate, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

/**
 * The catalogue, for the movement form's picker.
 *
 * Loaded separately from stock levels because a variant only gets a StockLevel
 * row once stock has been recorded against it -- so a product that has just
 * been added has none, and driving the picker from levels made its first
 * purchase impossible to record.
 */
type CatalogueProduct = {
  id: string; name: string; sku: string; brand?: string | null; isActive: boolean;
  variants: { id: string; sku: string; name: string; isActive: boolean }[];
};

type Store = { id: string; code: string; name: string };

type Level = {
  quantity: number; reserved: number; sellable: number; reorderAt: number; needsReorder: boolean;
  store: Store;
  variant: { id: string; sku: string; name: string; priceKes: string | number; product: { name: string; brand?: string | null } };
};

type Movement = {
  id: string; type: string; quantity: number; reference?: string | null;
  notes?: string | null; createdBy: string; createdAt: string;
  store: Store; variant: { id: string; sku: string; name: string };
};

const MOVEMENT_TYPES = [
  { value: 'PURCHASE', label: 'Received from supplier' },
  { value: 'RETURN', label: 'Customer return' },
  { value: 'ADJUSTMENT', label: 'Stock count adjustment' },
  { value: 'DAMAGE', label: 'Damaged or written off' },
  { value: 'TRANSFER_IN', label: 'Transfer in' },
  { value: 'TRANSFER_OUT', label: 'Transfer out' },
];

export default function InventoryPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([]);
  /** What is typed into the Product / size autocomplete. */
  const [variantQuery, setVariantQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [tab, setTab] = useState<'levels' | 'movements'>('levels');
  const [form, setForm] = useState({ variantId: '', storeId: '', type: 'PURCHASE', quantity: '', reference: '' });
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
      const [levelRows, storeRows, productRows] = await Promise.all([
        apiRequest<Level[]>('/inventory/levels', { method: 'GET' }, authToken),
        apiRequest<Store[]>('/stores', { method: 'GET' }, authToken),
        apiRequest<{ items: CatalogueProduct[] }>('/products?take=500', { method: 'GET' }, authToken).then(
          (page) => page.items,
        ),
      ]);
      setLevels(levelRows);
      setStores(storeRows);
      setCatalogue(productRows);
      setForm((prev) => ({ ...prev, storeId: prev.storeId || storeRows[0]?.id || '' }));
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

  const levelRows = useMemo(
    () => levels
      .filter((row) => (!storeFilter || row.store.id === storeFilter) && (!lowOnly || row.needsReorder))
      .map((row) => ({
        ...row,
        productName: row.variant.product.name,
        sku: row.variant.sku,
        size: row.variant.name,
        storeName: row.store.name,
      })),
    [levels, storeFilter, lowOnly],
  );

  /**
   * Every sellable variant, whether or not it has stock anywhere.
   *
   * Quantity is looked up per store so the picker can still show "12 in stock",
   * but a variant with no StockLevel row shows "no stock yet" instead of being
   * omitted -- which is the whole point: that is exactly the variant someone is
   * here to record a first purchase against.
   */
  const variantOptions = useMemo(() => {
    const quantityFor = new Map(
      levels
        .filter((row) => !form.storeId || row.store.id === form.storeId)
        .map((row) => [row.variant.id, row.quantity] as const),
    );
    return catalogue
      .filter((product) => product.isActive)
      .flatMap((product) =>
        product.variants
          .filter((variant) => variant.isActive)
          .map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            label: `${product.name} — ${variant.name}`,
            // Brand and SKU are searchable but not shown: someone types "AF1"
            // or "Nike" as readily as the full product name.
            haystack: `${product.name} ${product.sku} ${product.brand ?? ''} ${variant.name} ${variant.sku}`.toLowerCase(),
            quantity: quantityFor.get(variant.id) ?? null,
          })),
      );
  }, [catalogue, levels, form.storeId]);

  const variantMatches = useMemo(() => {
    const query = variantQuery.trim().toLowerCase();
    // Capped because the list is rendered, not virtualised: a few hundred
    // buttons is a slow first paint for a list nobody scrolls to the end of.
    if (!query) return variantOptions.slice(0, 25);
    return variantOptions.filter((option) => option.haystack.includes(query)).slice(0, 25);
  }, [variantOptions, variantQuery]);

  const selectedVariant = useMemo(
    () => variantOptions.find((option) => option.id === form.variantId),
    [variantOptions, form.variantId],
  );

  const controls = useListControls(levelRows, (row) => [row.productName, row.sku, row.size, row.storeName]);

  const fetchMovementsPage = useCallback(
    async (params: { skip: number; take: number; search: string }): Promise<ServerPage<Movement>> => {
      if (!token || !profile) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      return apiRequest<ServerPage<Movement>>(`/inventory/movements?${query}`, { method: 'GET' }, token);
    },
    [token, profile],
  );

  const movementsPager = useServerPager<Movement>({
    fetchPage: (params) => fetchMovementsPage(params),
    enabled: Boolean(token && profile && tab === 'movements'),
  });

  const canRecord = hasPermission(profile, 'stock-movement.create');
  const canCreateOffer = hasPermission(profile, 'offer.create');

  async function onRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    // Typing a product name without picking a suggestion leaves variantId
    // empty. Checked here rather than with a required attribute: the field
    // holding the id is hidden, and browsers exempt hidden inputs from
    // constraint validation, so the form would have submitted regardless.
    if (!form.variantId) {
      setErrorMessage('Pick a product and size from the list.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/inventory/movements', {
        method: 'POST',
        body: JSON.stringify({ ...form, quantity: Number(form.quantity) }),
      }, token);
      setFeedback('Stock movement recorded.');
      setForm((prev) => ({ ...prev, variantId: '', quantity: '', reference: '' }));
      setVariantQuery('');
      await load(token);
      movementsPager.reload();
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading inventory...</article>
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

  const lowCount = levels.filter((row) => row.needsReorder).length;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="inventory"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Inventory"
            pageSubtitle="Stock on hand and how it got there."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            {canRecord ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Record Movement</h2>
                <form className="portal-entity-form" onSubmit={onRecord}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Store</span>
                      <select value={form.storeId} required
                        onChange={(event) => setForm((prev) => ({ ...prev, storeId: event.target.value }))}>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>{store.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Product / size</span>
                      {/*
                        A search box over a clickable list rather than a select
                        or a datalist. The catalogue is a few hundred variants
                        once every size is listed, so a select is a long scroll;
                        a datalist only registers when the typed text matches an
                        option exactly, which meant a half-typed product name
                        silently selected nothing. Here the match is made by
                        clicking, so what is selected is never in doubt.
                      */}
                      <input
                        value={variantQuery}
                        placeholder="Search product, size or SKU…"
                        onChange={(event) => setVariantQuery(event.target.value)}
                      />
                      {form.variantId ? (
                        <div className="portal-picked-row">
                          <span>
                            <strong>{selectedVariant?.label}</strong>
                            <span className="portal-muted"> · {selectedVariant?.sku}</span>
                          </span>
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => {
                              setForm((prev) => ({ ...prev, variantId: '' }));
                              setVariantQuery('');
                            }}
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <div className="portal-picker-results">
                          {variantMatches.length === 0 ? (
                            <p className="portal-muted" style={{ margin: 8 }}>
                              {variantQuery.trim()
                                ? 'Nothing matches that.'
                                : 'Start typing, or pick from the list.'}
                            </p>
                          ) : (
                            variantMatches.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                className="portal-picker-option"
                                onClick={() => {
                                  setForm((prev) => ({ ...prev, variantId: option.id }));
                                  setVariantQuery('');
                                }}
                              >
                                <span>{option.label}</span>
                                <span className="portal-muted">
                                  {option.sku}
                                  {option.quantity === null
                                    ? ' · no stock yet'
                                    : ` · ${option.quantity} in stock`}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                      {!form.variantId ? (
                        <small className="portal-muted">
                          Products with no stock yet are listed too — that is how a first purchase is recorded.
                        </small>
                      ) : null}
                    </label>
                  </div>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Reason</span>
                      <select value={form.type}
                        onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}>
                        {MOVEMENT_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Quantity</span>
                      <input type="number" min="1" value={form.quantity} required
                        onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))} />
                    </label>
                    <label>
                      <span>Reference</span>
                      <input value={form.reference} placeholder="Delivery note"
                        onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))} />
                    </label>
                  </div>
                  <button type="submit" className="portal-primary-btn" disabled={saving}>
                    {saving ? 'Recording...' : 'Record Movement'}
                  </button>
                </form>
              </article>
            ) : null}

            <article className="portal-card">
              <div className="portal-card-header-row">
                <div className="portal-action-row">
                  <button type="button"
                    className={tab === 'levels' ? 'portal-primary-btn' : 'portal-inline-btn'}
                    onClick={() => setTab('levels')}>
                    Stock Levels
                  </button>
                  <button type="button"
                    className={tab === 'movements' ? 'portal-primary-btn' : 'portal-inline-btn'}
                    onClick={() => setTab('movements')}>
                    Movements
                  </button>
                </div>
                {lowCount > 0 ? (
                  <span className="portal-muted">{lowCount} item(s) at or below reorder level</span>
                ) : null}
              </div>

              {tab === 'levels' ? (
                <>
                  <div className="list-toolbar">
                    <ListSearch controls={controls} placeholder="Search product, SKU or size…" />
                    <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
                      <option value="">All stores</option>
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>{store.name}</option>
                      ))}
                    </select>
                    <label className="portal-check">
                      <input type="checkbox" checked={lowOnly} onChange={(event) => setLowOnly(event.target.checked)} />
                      <span>Low stock only</span>
                    </label>
                    <ListExport
                      rows={controls.filtered}
                      config={{
                        fileName: 'stock-levels',
                        columns: [
                          { header: 'Store', value: (row) => row.storeName },
                          { header: 'Product', value: (row) => row.productName },
                          { header: 'Size', value: (row) => row.size },
                          { header: 'SKU', value: (row) => row.sku },
                          { header: 'On Hand', value: (row) => row.quantity },
                          { header: 'Sellable', value: (row) => row.sellable },
                          { header: 'Reorder At', value: (row) => row.reorderAt },
                        ],
                      }}
                    />
                  </div>

                  <div className="portal-list-stack">
                    {controls.visible.length === 0 ? (
                      <div className="portal-empty-state">No stock matches those filters.</div>
                    ) : (
                      controls.visible.map((row) => (
                        <div key={`${row.variant.id}-${row.store.id}`} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>{row.productName} — {row.size}</strong>
                              <p className="portal-muted">{row.sku} · {row.storeName}</p>
                              <p>{formatMoney(row.variant.priceKes)}</p>
                            </div>
                            <span>{row.sellable} sellable</span>
                            <span>{row.needsReorder ? 'REORDER' : `${row.quantity} on hand`}</span>
                            {/* Stock sitting on the shelf is exactly where the
                                thought "discount this" occurs. */}
                            {canCreateOffer ? (
                              <button
                                type="button"
                                className="portal-inline-btn"
                                onClick={() =>
                                  setOfferTarget({
                                    variantId: row.variant.id,
                                    sku: row.sku,
                                    label: `${row.productName} · ${row.size}`,
                                    priceKes: Number(row.variant.priceKes),
                                    // The levels endpoint does not return
                                    // cost, so the below-cost warning is left
                                    // to the catalogue, which does. Undefined
                                    // means unknown, not zero.
                                    costKes: undefined,
                                  })
                                }
                              >
                                Put on offer
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <ListPager controls={controls} noun="stock rows" />
                </>
              ) : (
                <>
                  <div className="list-toolbar">
                    <ServerListSearch pager={movementsPager} placeholder="Search reference, notes, SKU…" />
                  </div>
                  <div className="portal-table-wrap">
                    <table className="portal-data-table">
                      <thead>
                        <tr><th>When</th><th>Store</th><th>Item</th><th>Reason</th><th>Qty</th><th>Reference</th><th>By</th></tr>
                      </thead>
                      <tbody>
                        {!movementsPager.loading && movementsPager.items.length === 0 ? (
                          <tr><td colSpan={7}>{movementsPager.search ? 'No movements match.' : 'No movements recorded.'}</td></tr>
                        ) : (
                          movementsPager.items.map((movement) => (
                            <tr key={movement.id}>
                              <td>{formatDate(movement.createdAt)}</td>
                              <td>{movement.store.name}</td>
                              <td>{movement.variant.sku}</td>
                              <td>{movement.type}</td>
                              <td>{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}</td>
                              <td>{movement.reference || '—'}</td>
                              <td>{movement.createdBy}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <ServerListPager pager={movementsPager} noun="movements" />
                </>
              )}
            </article>
            {offerTarget && token ? (
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
