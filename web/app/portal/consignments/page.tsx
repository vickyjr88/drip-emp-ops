"use client";

/**
 * Consignments: goods out with resellers, and settling them when they return.
 *
 * A pickup is issued from stock on the shop floor, then settled line by line —
 * some sold, some back in the bag — which is how a reseller actually turns up.
 * Overdue pickups are listed first because those are the ones to chase.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { ListExport } from '../components/list-export';
import { usePortalDialog } from '../components/portal-dialog';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, asList, canReadRbacFor, formatDate,
  formatMoney, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Store = { id: string; code: string; name: string };
type Reseller = { id: string; code: string; name: string; priceTier: string; isActive: boolean };

type Level = {
  quantity: number; onConsignment: number;
  store: Store;
  variant: { id: string; sku: string; name: string; priceKes: string | number; product: { name: string } };
};

type Line = {
  id: string; description: string; quantityOut: number;
  quantitySold: number; quantityReturned: number; unitPrice: string | number;
  variant: { id: string; sku: string; name: string; product: { name: string } };
};

type Consignment = {
  id: string; reference: string; status: string; priceTier: string;
  totalValue: string | number; soldValue: string | number; amountPaid: string | number;
  dueDate?: string | null; issuedAt: string; notes?: string | null;
  unitsStillOut: number; balance: number; isOverdue: boolean;
  customer: Reseller; store: Store; lines: Line[];
  payments: Array<{ id: string; amount: string | number; method: string; reference?: string | null }>;
};

type Draft = { variantId: string; quantity: number; label: string };

export default function ConsignmentsPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [stats, setStats] = useState({ unitsHeld: 0, owed: 0, overdue: 0 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showIssue, setShowIssue] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  const [head, setHead] = useState({ customerId: '', storeId: '', notes: '' });
  const [draft, setDraft] = useState<Draft[]>([]);
  const [pick, setPick] = useState({ variantId: '', quantity: '1' });
  /** Search text for the reseller and item autocompletes -- cleared once
   *  something is picked, same pattern as the till's item picker. */
  const [resellerQuery, setResellerQuery] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  // Settlement is per line: sold and returned reported together.
  const [settle, setSettle] = useState<{ id: string; entries: Record<string, { sold: string; returned: string }>; amount: string; method: string; reference: string } | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      const [levelRows, storeRows, resellerRows] = await Promise.all([
        apiRequest<unknown>('/inventory/levels', { method: 'GET' }, authToken),
        apiRequest<Store[]>('/stores', { method: 'GET' }, authToken),
        apiRequest<{ items: Reseller[] }>('/resellers?take=500', { method: 'GET' }, authToken).then((page) => page.items),
      ]);
      setLevels(asList<Level>(levelRows));
      setStores(storeRows);
      setResellers(resellerRows);
      setHead((prev) => ({
        ...prev,
        storeId: prev.storeId || storeRows[0]?.id || '',
        customerId: prev.customerId || resellerRows[0]?.id || '',
      }));
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

  const refreshStats = useCallback(async () => {
    if (!token) return;
    try {
      setStats(await apiRequest<{ unitsHeld: number; owed: number; overdue: number }>('/consignments/stats', { method: 'GET' }, token));
    } catch {
      // Non-fatal: the list itself still loads.
    }
  }, [token]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const fetchConsignmentsPage = useCallback(
    async (
      params: { skip: number; take: number; search: string } & { status: string },
    ): Promise<ServerPage<Consignment>> => {
      if (!token || !profile) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      if (params.status) query.set('status', params.status);
      return apiRequest<ServerPage<Consignment>>(`/consignments?${query}`, { method: 'GET' }, token);
    },
    [token, profile],
  );

  const consignmentsPager = useServerPager<Consignment, { status: string }>({
    fetchPage: (params) => fetchConsignmentsPage(params),
    filters: { status: statusFilter },
    enabled: Boolean(token && profile),
  });

  const [exportRows, setExportRows] = useState<Consignment[]>([]);
  useEffect(() => {
    if (!token || !profile) return;
    const timer = setTimeout(() => {
      void fetchConsignmentsPage({ skip: 0, take: 500, search: consignmentsPager.search, status: statusFilter }).then(
        (page) => setExportRows(page.items),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [fetchConsignmentsPage, consignmentsPager.search, statusFilter, token, profile]);

  const canCreate = hasPermission(profile, 'consignment.create');
  const canUpdate = hasPermission(profile, 'consignment.update');
  const canAddReseller = hasPermission(profile, 'customer.create');

  // Only stock on the shop floor at the chosen store can go out.
  const availableHere = levels.filter((row) => row.store.id === head.storeId && row.quantity > 0);

  const resellerMatches = useMemo(() => {
    const query = resellerQuery.trim().toLowerCase();
    const scored = !query
      ? resellers
      : resellers.filter(
          (reseller) =>
            reseller.name.toLowerCase().includes(query) || reseller.code.toLowerCase().includes(query),
        );
    return scored.slice(0, 25);
  }, [resellers, resellerQuery]);

  const itemMatches = useMemo(() => {
    const query = itemQuery.trim().toLowerCase();
    const scored = !query
      ? availableHere
      : availableHere.filter(
          (row) =>
            row.variant.product.name.toLowerCase().includes(query) ||
            row.variant.name.toLowerCase().includes(query) ||
            row.variant.sku.toLowerCase().includes(query),
        );
    return scored.slice(0, 25);
  }, [availableHere, itemQuery]);

  function addLine() {
    const level = availableHere.find((row) => row.variant.id === pick.variantId);
    if (!level) return;
    const quantity = Number(pick.quantity) || 1;
    setDraft((prev) => {
      const existing = prev.find((line) => line.variantId === level.variant.id);
      if (existing) {
        return prev.map((line) =>
          line.variantId === level.variant.id ? { ...line, quantity: line.quantity + quantity } : line);
      }
      return [...prev, {
        variantId: level.variant.id, quantity,
        label: `${level.variant.product.name} — ${level.variant.name}`,
      }];
    });
    setPick({ variantId: '', quantity: '1' });
    setItemQuery('');
  }

  async function onAddReseller() {
    if (!token) return;
    const result = await dialog.prompt({
      title: 'New Reseller',
      message: 'Adds a trade account, then picks it for this pickup.',
      fields: [
        { name: 'code', label: 'Code', required: true, placeholder: 'e.g. MNJ' },
        { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Mama Njeri Shoes' },
        { name: 'phone', label: 'Phone' },
        { name: 'location', label: 'Location' },
      ],
      confirmLabel: 'Add Reseller',
    });
    if (!result) return;
    try {
      const created = await apiRequest<Reseller>('/resellers', {
        method: 'POST',
        body: JSON.stringify({
          code: result.code,
          name: result.name,
          phone: result.phone || undefined,
          location: result.location || undefined,
        }),
      }, token);
      setResellers((prev) => [...prev, created]);
      setHead((prev) => ({ ...prev, customerId: created.id }));
      setResellerQuery('');
      setFeedback(`${created.name} added.`);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function onIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || draft.length === 0) return;
    setSaving(true);
    try {
      const created = await apiRequest<Consignment>('/consignments', {
        method: 'POST',
        body: JSON.stringify({
          customerId: head.customerId,
          storeId: head.storeId,
          notes: head.notes || undefined,
          lines: draft.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        }),
      }, token);
      setFeedback(`${created.reference} issued — ${formatMoney(created.totalValue)}, due back ${formatDate(created.dueDate)}.`);
      setDraft([]); setHead((prev) => ({ ...prev, notes: '' })); setShowIssue(false);
      await load(token);
      consignmentsPager.reload();
      void refreshStats();
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function onSettle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !settle) return;
    const lines = Object.entries(settle.entries)
      .map(([lineId, value]) => ({
        lineId,
        sold: Number(value.sold) || 0,
        returned: Number(value.returned) || 0,
      }))
      .filter((line) => line.sold > 0 || line.returned > 0);

    if (lines.length === 0 && !settle.amount) {
      setErrorMessage(new Error('Nothing to record — enter what sold, what came back, or a payment.'));
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<Consignment>(`/consignments/${settle.id}/settle`, {
        method: 'POST',
        body: JSON.stringify({
          lines: lines.length ? lines : [{ lineId: Object.keys(settle.entries)[0], sold: 0 }],
          amountPaid: settle.amount ? Number(settle.amount) : undefined,
          method: settle.method,
          reference: settle.reference || undefined,
        }),
      }, token);
      setFeedback(
        result.status === 'SETTLED'
          ? `${result.reference} fully settled and closed.`
          : `${result.reference} updated — ${result.unitsStillOut} unit(s) still out.`,
      );
      setSettle(null);
      await load(token);
      consignmentsPager.reload();
      void refreshStats();
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function onWriteOff(consignment: Consignment) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Write Off',
      message: `Write off the ${consignment.unitsStillOut} unit(s) still out on ${consignment.reference}? The stock is removed and recorded as a loss.`,
      confirmLabel: 'Write Off',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/consignments/${consignment.id}/write-off`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: 'Not returned by reseller' }),
      }, token);
      setFeedback(`${consignment.reference} written off.`);
      await load(token);
      consignmentsPager.reload();
      void refreshStats();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading consignments...</article>
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
            active="consignments"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Consignments"
            pageSubtitle="Stock out with resellers. Unsold goods are due back in three days."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <div className="portal-stat-grid">
              <article className="portal-stat-card">
                <p>Units out</p><h3>{stats.unitsHeld}</h3>
                <span className="portal-stat-note">owned, not sellable</span>
              </article>
              <article className="portal-stat-card">
                <p>Owed</p><h3>{formatMoney(stats.owed)}</h3>
                <span className="portal-stat-note">sold, not yet paid</span>
              </article>
              <article className="portal-stat-card">
                <p>Overdue</p><h3>{stats.overdue}</h3>
                <span className="portal-stat-note">past three days</span>
              </article>
            </div>

            {showIssue && canCreate ? (
              <article className="portal-card" data-tour="consignments.issue">
                <h2 style={{ marginTop: 0 }}>Issue Pickup</h2>
                <p className="portal-muted">
                  Goods leave the shop floor but stay owned until sold or returned. Price is fixed now.
                </p>
                <form className="portal-entity-form" onSubmit={onIssue}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Reseller</span>
                      <input
                        value={resellerQuery}
                        placeholder="Search reseller by name or code…"
                        onChange={(event) => { setResellerQuery(event.target.value); setHead((prev) => ({ ...prev, customerId: '' })); }}
                      />
                      {head.customerId ? (
                        <div className="portal-picked-row">
                          <span>
                            <strong>
                              {resellers.find((reseller) => reseller.id === head.customerId)?.name}
                            </strong>
                            {' '}
                            <span className="portal-muted">
                              ({resellers.find((reseller) => reseller.id === head.customerId)?.priceTier.toLowerCase()})
                            </span>
                          </span>
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => setHead((prev) => ({ ...prev, customerId: '' }))}
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <div className="portal-picker-results">
                          {resellerMatches.length === 0 ? (
                            <p className="portal-muted" style={{ margin: 8 }}>
                              {resellerQuery.trim() ? 'No reseller matches that.' : 'Start typing, or pick from the list.'}
                            </p>
                          ) : (
                            resellerMatches.map((reseller) => (
                              <button
                                key={reseller.id}
                                type="button"
                                className="portal-picker-option"
                                onClick={() => { setHead((prev) => ({ ...prev, customerId: reseller.id })); setResellerQuery(''); }}
                              >
                                <span>{reseller.name}</span>
                                <span className="portal-muted">
                                  {reseller.code} · {reseller.priceTier.toLowerCase()}
                                </span>
                              </button>
                            ))
                          )}
                          {canAddReseller ? (
                            <button type="button" className="portal-picker-option is-action" onClick={() => void onAddReseller()}>
                              <span>+ Add new reseller</span>
                            </button>
                          ) : null}
                        </div>
                      )}
                    </label>
                    <label>
                      <span>From store</span>
                      <select value={head.storeId}
                        onChange={(event) => { setHead((prev) => ({ ...prev, storeId: event.target.value })); setDraft([]); setItemQuery(''); setPick({ variantId: '', quantity: '1' }); }}>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>{store.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Item</span>
                      <input
                        value={itemQuery}
                        placeholder="Search product, size or SKU…"
                        onChange={(event) => { setItemQuery(event.target.value); setPick((prev) => ({ ...prev, variantId: '' })); }}
                      />
                      {pick.variantId ? (
                        <div className="portal-picked-row">
                          <span>
                            <strong>
                              {availableHere.find((row) => row.variant.id === pick.variantId)?.variant.product.name}
                              {' — '}
                              {availableHere.find((row) => row.variant.id === pick.variantId)?.variant.name}
                            </strong>
                          </span>
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => { setPick((prev) => ({ ...prev, variantId: '' })); setItemQuery(''); }}
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <div className="portal-picker-results">
                          {itemMatches.length === 0 ? (
                            <p className="portal-muted" style={{ margin: 8 }}>
                              {itemQuery.trim() ? 'Nothing on the floor matches that.' : 'Start typing, or pick from the list.'}
                            </p>
                          ) : (
                            itemMatches.map((row) => (
                              <button
                                key={row.variant.id}
                                type="button"
                                className="portal-picker-option"
                                onClick={() => { setPick((prev) => ({ ...prev, variantId: row.variant.id })); setItemQuery(''); }}
                              >
                                <span>{row.variant.product.name} — {row.variant.name}</span>
                                <span className="portal-muted">
                                  {row.variant.sku} · {row.quantity} on floor
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </label>
                    <label>
                      <span>Quantity</span>
                      <input type="number" min="1" value={pick.quantity}
                        onChange={(event) => setPick((prev) => ({ ...prev, quantity: event.target.value }))} />
                    </label>
                    <label>
                      <span>&nbsp;</span>
                      <button type="button" className="portal-inline-btn" onClick={addLine} disabled={!pick.variantId}>
                        Add
                      </button>
                    </label>
                  </div>

                  {draft.length > 0 ? (
                    <div className="portal-table-wrap">
                      <table className="portal-data-table is-doc">
                        <thead><tr><th>Item</th><th>Qty</th><th /></tr></thead>
                        <tbody>
                          {draft.map((line) => (
                            <tr key={line.variantId}>
                              <td>{line.label}</td>
                              <td>{line.quantity}</td>
                              <td>
                                <button type="button" className="portal-inline-btn is-danger"
                                  onClick={() => setDraft((prev) => prev.filter((item) => item.variantId !== line.variantId))}>
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="portal-empty-state">Nothing added yet.</div>
                  )}

                  <label>
                    <span>Notes</span>
                    <input value={head.notes}
                      onChange={(event) => setHead((prev) => ({ ...prev, notes: event.target.value }))} />
                  </label>

                  <div className="portal-inline-actions">
                    <button type="submit" className="portal-primary-btn" disabled={saving || draft.length === 0}>
                      {saving ? 'Issuing...' : 'Issue Pickup'}
                    </button>
                    <button type="button" className="portal-ghost-btn"
                      onClick={() => { setShowIssue(false); setDraft([]); }}>
                      Cancel
                    </button>
                  </div>
                </form>
              </article>
            ) : null}

            {settle ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Settle Pickup</h2>
                <p className="portal-muted">
                  Enter how many of each sold and how many came back. Anything left stays out.
                </p>
                <form className="portal-entity-form" onSubmit={onSettle}>
                  <div className="portal-table-wrap">
                    <table className="portal-data-table is-doc">
                      <thead><tr><th>Item</th><th>Still out</th><th>Sold</th><th>Returned</th></tr></thead>
                      <tbody>
                        {consignmentsPager.items.find((row) => row.id === settle.id)?.lines.map((line) => {
                          const stillOut = line.quantityOut - line.quantitySold - line.quantityReturned;
                          return (
                            <tr key={line.id}>
                              <td>{line.variant.product.name} — {line.variant.name}</td>
                              <td>{stillOut}</td>
                              <td>
                                <input type="number" min="0" max={stillOut} style={{ width: 70 }}
                                  value={settle.entries[line.id]?.sold || ''}
                                  onChange={(event) => setSettle((prev) => prev && ({
                                    ...prev,
                                    entries: { ...prev.entries, [line.id]: { ...(prev.entries[line.id] || { sold: '', returned: '' }), sold: event.target.value } },
                                  }))} />
                              </td>
                              <td>
                                <input type="number" min="0" max={stillOut} style={{ width: 70 }}
                                  value={settle.entries[line.id]?.returned || ''}
                                  onChange={(event) => setSettle((prev) => prev && ({
                                    ...prev,
                                    entries: { ...prev.entries, [line.id]: { ...(prev.entries[line.id] || { sold: '', returned: '' }), returned: event.target.value } },
                                  }))} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Payment (KES)</span>
                      <input type="number" min="0" value={settle.amount}
                        onChange={(event) => setSettle((prev) => prev && ({ ...prev, amount: event.target.value }))} />
                    </label>
                    <label>
                      <span>Method</span>
                      <select value={settle.method}
                        onChange={(event) => setSettle((prev) => prev && ({ ...prev, method: event.target.value }))}>
                        {['MPESA', 'CASH', 'BANK_TRANSFER'].map((method) => (
                          <option key={method} value={method}>{method.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Reference</span>
                      <input value={settle.reference}
                        onChange={(event) => setSettle((prev) => prev && ({ ...prev, reference: event.target.value }))} />
                    </label>
                  </div>

                  <div className="portal-inline-actions">
                    <button type="submit" className="portal-primary-btn" disabled={saving}>
                      {saving ? 'Recording...' : 'Record Settlement'}
                    </button>
                    <button type="button" className="portal-ghost-btn" onClick={() => setSettle(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </article>
            ) : null}

            <article className="portal-card" data-tour="consignments.list">
              <div className="portal-card-header-row">
                <div><h2 style={{ margin: 0 }}>Pickups</h2></div>
                {canCreate && !showIssue ? (
                  <button type="button" className="portal-primary-btn" onClick={() => setShowIssue(true)}>
                    Issue Pickup
                  </button>
                ) : null}
              </div>

              <div className="list-toolbar">
                <ServerListSearch pager={consignmentsPager} placeholder="Search reference or reseller…" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {['OPEN', 'SETTLED', 'WRITTEN_OFF'].map((status) => (
                    <option key={status} value={status}>{status.replace('_', ' ')}</option>
                  ))}
                </select>
                <ListExport
                  rows={exportRows}
                  config={{
                    fileName: 'consignments',
                    columns: [
                      { header: 'Reference', value: (row) => row.reference },
                      { header: 'Reseller', value: (row) => row.customer.name },
                      { header: 'Issued', value: (row) => formatDate(row.issuedAt) },
                      { header: 'Due', value: (row) => formatDate(row.dueDate) },
                      { header: 'Status', value: (row) => row.status },
                      { header: 'Value', value: (row) => Number(row.totalValue) },
                      { header: 'Sold', value: (row) => Number(row.soldValue) },
                      { header: 'Paid', value: (row) => Number(row.amountPaid) },
                      { header: 'Still Out', value: (row) => row.unitsStillOut },
                    ],
                  }}
                />
              </div>

              <div className="portal-list-stack">
                {!consignmentsPager.loading && consignmentsPager.items.length === 0 ? (
                  <div className="portal-empty-state">
                    {consignmentsPager.search || statusFilter ? 'No pickups match.' : 'No pickups yet.'}
                  </div>
                ) : (
                  consignmentsPager.items.map((consignment) => (
                    <div key={consignment.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>
                            {consignment.reference} · {consignment.customer.name}
                            {consignment.isOverdue ? ' — OVERDUE' : ''}
                          </strong>
                          <p className="portal-muted">
                            {consignment.store.name} · issued {formatDate(consignment.issuedAt)}
                            {consignment.dueDate ? ` · due ${formatDate(consignment.dueDate)}` : ''}
                          </p>
                          <p>
                            {consignment.unitsStillOut} still out · sold {formatMoney(consignment.soldValue)}
                            {consignment.balance > 0 ? ` · ${formatMoney(consignment.balance)} owing` : ''}
                          </p>
                        </div>
                        <span>{consignment.status.replace('_', ' ')}</span>
                        <div className="portal-action-row">
                          <button type="button" className="portal-inline-btn"
                            onClick={() => setExpanded(expanded === consignment.id ? null : consignment.id)}>
                            {expanded === consignment.id ? 'Hide' : 'Details'}
                          </button>
                          {canUpdate && consignment.status === 'OPEN' ? (
                            <>
                              <button type="button" className="portal-inline-btn"
                                onClick={() => setSettle({
                                  id: consignment.id, entries: {}, amount: '', method: 'MPESA', reference: '',
                                })}>
                                Settle
                              </button>
                              <button type="button" className="portal-inline-btn is-danger"
                                onClick={() => void onWriteOff(consignment)}>
                                Write Off
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {expanded === consignment.id ? (
                        <div className="portal-table-wrap">
                          <table className="portal-data-table is-doc">
                            <thead><tr><th>Item</th><th>Out</th><th>Sold</th><th>Returned</th><th>Still out</th><th>Unit</th></tr></thead>
                            <tbody>
                              {consignment.lines.map((line) => (
                                <tr key={line.id}>
                                  <td>{line.variant.product.name} — {line.variant.name}</td>
                                  <td>{line.quantityOut}</td>
                                  <td>{line.quantitySold}</td>
                                  <td>{line.quantityReturned}</td>
                                  <td>{line.quantityOut - line.quantitySold - line.quantityReturned}</td>
                                  <td>{formatMoney(line.unitPrice)}</td>
                                </tr>
                              ))}
                              {consignment.payments.map((paid) => (
                                <tr key={paid.id}>
                                  <td colSpan={5}>Paid — {paid.method}{paid.reference ? ` (${paid.reference})` : ''}</td>
                                  <td>{formatMoney(paid.amount)}</td>
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
              <ServerListPager pager={consignmentsPager} noun="pickups" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
