"use client";

/**
 * Orders: taking one, and moving it along afterwards.
 *
 * The till and the order list share a screen because in a shop they are the
 * same job — ring up the sale in front of you, then check what is still owed
 * on the ones behind it.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { ListExport } from '../components/list-export';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDate, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Store = { id: string; code: string; name: string };

type Level = {
  quantity: number; sellable: number;
  store: Store;
  variant: { id: string; sku: string; name: string; priceKes: string | number; product: { name: string } };
};

type OrderLine = {
  id: string; description: string; quantity: number;
  unitPrice: string | number; lineTotal: string | number;
};

type Order = {
  id: string; orderNumber: string; status: string; channel: string;
  total: string | number; amountPaid: string | number; placedAt: string;
  customerName?: string | null; customerPhone?: string | null;
  store: Store; lines: OrderLine[];
  payments: Array<{ id: string; amount: string | number; method: string; reference?: string | null }>;
};

const CHANNELS = ['IN_STORE', 'WHATSAPP', 'INSTAGRAM', 'WEBSITE'];
const METHODS = ['MPESA', 'CASH', 'CARD', 'BANK_TRANSFER'];

type Draft = { variantId: string; quantity: number; label: string; price: number };

export default function OrdersPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showTill, setShowTill] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  const [head, setHead] = useState({ storeId: '', channel: 'IN_STORE', customerName: '', customerPhone: '' });
  const [draft, setDraft] = useState<Draft[]>([]);
  const [pick, setPick] = useState({ variantId: '', quantity: '1' });
  const [payment, setPayment] = useState({ orderId: '', amount: '', method: 'MPESA', reference: '' });

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      const [levelRows, storeRows] = await Promise.all([
        apiRequest<Level[]>('/inventory/levels', { method: 'GET' }, authToken),
        apiRequest<Store[]>('/stores', { method: 'GET' }, authToken),
      ]);
      setLevels(levelRows);
      setStores(storeRows);
      setHead((prev) => ({ ...prev, storeId: prev.storeId || storeRows[0]?.id || '' }));
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

  const orderFilters = useMemo(() => ({ status: statusFilter || undefined }), [statusFilter]);

  const fetchOrdersPage = useCallback(
    async (params: {
      skip: number;
      take: number;
      search: string;
      status?: string;
    }): Promise<ServerPage<Order>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      if (params.status) query.set('status', params.status);
      return apiRequest<ServerPage<Order>>(`/orders?${query}`, { method: 'GET' }, token);
    },
    [token],
  );

  const ordersPager = useServerPager<Order, typeof orderFilters>({
    fetchPage: (params) => fetchOrdersPage(params),
    filters: orderFilters,
    enabled: Boolean(token),
  });

  const [exportRows, setExportRows] = useState<Order[]>([]);
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      void fetchOrdersPage({ skip: 0, take: 500, search: ordersPager.search, ...orderFilters }).then((page) =>
        setExportRows(page.items),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [fetchOrdersPage, ordersPager.search, orderFilters, token]);

  const rows = useMemo(
    () =>
      ordersPager.items.map((order) => ({
        ...order,
        who: order.customerName || 'Walk-in',
        storeName: order.store.name,
        balance: Number(order.total) - Number(order.amountPaid),
      })),
    [ordersPager.items],
  );

  const exportRowsShaped = useMemo(
    () =>
      exportRows.map((order) => ({
        ...order,
        who: order.customerName || 'Walk-in',
        storeName: order.store.name,
        balance: Number(order.total) - Number(order.amountPaid),
      })),
    [exportRows],
  );

  const canCreate = hasPermission(profile, 'order.create');
  const canUpdate = hasPermission(profile, 'order.update');
  const canPay = hasPermission(profile, 'order-payment.create');

  // Only what the chosen store actually has, so a sale cannot be rung up
  // against stock sitting in the other shop.
  const availableHere = levels.filter((row) => row.store.id === head.storeId && row.sellable > 0);
  const draftTotal = draft.reduce((sum, line) => sum + line.price * line.quantity, 0);

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
        variantId: level.variant.id,
        quantity,
        label: `${level.variant.product.name} — ${level.variant.name}`,
        price: Number(level.variant.priceKes),
      }];
    });
    setPick({ variantId: '', quantity: '1' });
  }

  async function onPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || draft.length === 0) return;
    setSaving(true);
    try {
      const order = await apiRequest<Order>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          storeId: head.storeId,
          channel: head.channel,
          customerName: head.customerName || undefined,
          customerPhone: head.customerPhone || undefined,
          lines: draft.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        }),
      }, token);
      setFeedback(`${order.orderNumber} placed — ${formatMoney(order.total)}.`);
      setDraft([]);
      setHead((prev) => ({ ...prev, customerName: '', customerPhone: '' }));
      setShowTill(false);
      await load(token);
      ordersPager.reload();
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function onSetStatus(order: Order, status: string) {
    if (!token) return;
    try {
      await apiRequest(`/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, token);
      setFeedback(`${order.orderNumber} is now ${status}.`);
      await load(token);
      ordersPager.reload();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function onPay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !payment.orderId) return;
    try {
      await apiRequest(`/orders/${payment.orderId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payment.amount),
          method: payment.method,
          reference: payment.reference || undefined,
        }),
      }, token);
      setFeedback('Payment recorded.');
      setPayment({ orderId: '', amount: '', method: 'MPESA', reference: '' });
      await load(token);
      ordersPager.reload();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading orders...</article>
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
            active="orders"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Orders"
            pageSubtitle="Ring up a sale, then chase what is still owed."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            {showTill && canCreate ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>New Order</h2>
                <form className="portal-entity-form" onSubmit={onPlace}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Store</span>
                      <select value={head.storeId}
                        onChange={(event) => { setHead((prev) => ({ ...prev, storeId: event.target.value })); setDraft([]); }}>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>{store.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Channel</span>
                      <select value={head.channel}
                        onChange={(event) => setHead((prev) => ({ ...prev, channel: event.target.value }))}>
                        {CHANNELS.map((channel) => (
                          <option key={channel} value={channel}>{channel.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Customer name</span>
                      <input value={head.customerName} placeholder="Walk-in"
                        onChange={(event) => setHead((prev) => ({ ...prev, customerName: event.target.value }))} />
                    </label>
                    <label>
                      <span>Phone</span>
                      <input value={head.customerPhone} placeholder="+254…"
                        onChange={(event) => setHead((prev) => ({ ...prev, customerPhone: event.target.value }))} />
                    </label>
                  </div>

                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Item</span>
                      <select value={pick.variantId}
                        onChange={(event) => setPick((prev) => ({ ...prev, variantId: event.target.value }))}>
                        <option value="">Choose…</option>
                        {availableHere.map((row) => (
                          <option key={row.variant.id} value={row.variant.id}>
                            {row.variant.product.name} — {row.variant.name} ({row.sellable} left)
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Quantity</span>
                      <input type="number" min="1" value={pick.quantity}
                        onChange={(event) => setPick((prev) => ({ ...prev, quantity: event.target.value }))} />
                    </label>
                    <label>
                      <span>&nbsp;</span>
                      <button type="button" className="portal-inline-btn" onClick={addLine} disabled={!pick.variantId}>
                        Add to Order
                      </button>
                    </label>
                  </div>

                  {draft.length > 0 ? (
                    <div className="portal-table-wrap">
                      <table className="portal-data-table is-doc">
                        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th /></tr></thead>
                        <tbody>
                          {draft.map((line) => (
                            <tr key={line.variantId}>
                              <td>{line.label}</td>
                              <td>{line.quantity}</td>
                              <td>{formatMoney(line.price)}</td>
                              <td>{formatMoney(line.price * line.quantity)}</td>
                              <td>
                                <button type="button" className="portal-inline-btn is-danger"
                                  onClick={() => setDraft((prev) => prev.filter((item) => item.variantId !== line.variantId))}>
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td colSpan={3}><strong>Total</strong></td>
                            <td colSpan={2}><strong>{formatMoney(draftTotal)}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="portal-empty-state">Nothing added yet.</div>
                  )}

                  <div className="portal-inline-actions">
                    <button type="submit" className="portal-primary-btn" disabled={saving || draft.length === 0}>
                      {saving ? 'Placing...' : `Place Order — ${formatMoney(draftTotal)}`}
                    </button>
                    <button type="button" className="portal-ghost-btn" onClick={() => { setShowTill(false); setDraft([]); }}>
                      Cancel
                    </button>
                  </div>
                </form>
              </article>
            ) : null}

            {payment.orderId && canPay ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Record Payment</h2>
                <form className="portal-entity-form" onSubmit={onPay}>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Amount (KES)</span>
                      <input type="number" min="1" value={payment.amount} required
                        onChange={(event) => setPayment((prev) => ({ ...prev, amount: event.target.value }))} />
                    </label>
                    <label>
                      <span>Method</span>
                      <select value={payment.method}
                        onChange={(event) => setPayment((prev) => ({ ...prev, method: event.target.value }))}>
                        {METHODS.map((method) => (
                          <option key={method} value={method}>{method.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Reference</span>
                      <input value={payment.reference} placeholder="M-Pesa code"
                        onChange={(event) => setPayment((prev) => ({ ...prev, reference: event.target.value }))} />
                    </label>
                  </div>
                  <div className="portal-inline-actions">
                    <button type="submit" className="portal-primary-btn">Record Payment</button>
                    <button type="button" className="portal-ghost-btn"
                      onClick={() => setPayment({ orderId: '', amount: '', method: 'MPESA', reference: '' })}>
                      Cancel
                    </button>
                  </div>
                </form>
              </article>
            ) : null}

            <article className="portal-card">
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Orders</h2>
                </div>
                {canCreate && !showTill ? (
                  <button type="button" className="portal-primary-btn" onClick={() => setShowTill(true)}>
                    New Order
                  </button>
                ) : null}
              </div>

              <div className="list-toolbar">
                <ServerListSearch pager={ordersPager} placeholder="Search order number, name or phone…" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {['PENDING', 'PAID', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <ListExport
                  rows={exportRowsShaped}
                  config={{
                    fileName: 'orders',
                    columns: [
                      { header: 'Order', value: (row) => row.orderNumber },
                      { header: 'Date', value: (row) => formatDate(row.placedAt) },
                      { header: 'Store', value: (row) => row.storeName },
                      { header: 'Customer', value: (row) => row.who },
                      { header: 'Channel', value: (row) => row.channel },
                      { header: 'Status', value: (row) => row.status },
                      { header: 'Total', value: (row) => Number(row.total) },
                      { header: 'Paid', value: (row) => Number(row.amountPaid) },
                      { header: 'Balance', value: (row) => row.balance },
                    ],
                  }}
                />
              </div>

              <div className="portal-list-stack">
                {!ordersPager.loading && rows.length === 0 ? (
                  <div className="portal-empty-state">
                    {ordersPager.search || statusFilter ? 'No orders match.' : 'No orders yet.'}
                  </div>
                ) : (
                  rows.map((order) => (
                    <div key={order.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{order.orderNumber}</strong>
                          <p className="portal-muted">
                            {order.who} · {order.storeName} · {order.channel.replace('_', ' ')} ·{' '}
                            {formatDate(order.placedAt)}
                          </p>
                          <p>
                            {formatMoney(order.total)}
                            {order.balance > 0 ? ` · ${formatMoney(order.balance)} owing` : ' · settled'}
                          </p>
                        </div>
                        <span>{order.status}</span>
                        <div className="portal-action-row">
                          <button type="button" className="portal-inline-btn"
                            onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                            {expanded === order.id ? 'Hide' : 'Details'}
                          </button>
                          {canPay && order.balance > 0 ? (
                            <button type="button" className="portal-inline-btn"
                              onClick={() => setPayment({ orderId: order.id, amount: String(order.balance), method: 'MPESA', reference: '' })}>
                              Take Payment
                            </button>
                          ) : null}
                          {canUpdate && order.status === 'PAID' ? (
                            <button type="button" className="portal-inline-btn" onClick={() => void onSetStatus(order, 'PACKED')}>
                              Mark Packed
                            </button>
                          ) : null}
                          {canUpdate && order.status === 'PACKED' ? (
                            <button type="button" className="portal-inline-btn" onClick={() => void onSetStatus(order, 'SHIPPED')}>
                              Mark Shipped
                            </button>
                          ) : null}
                          {canUpdate && order.status === 'SHIPPED' ? (
                            <button type="button" className="portal-inline-btn" onClick={() => void onSetStatus(order, 'DELIVERED')}>
                              Mark Delivered
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {expanded === order.id ? (
                        <div className="portal-table-wrap">
                          <table className="portal-data-table is-doc">
                            <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
                            <tbody>
                              {order.lines.map((line) => (
                                <tr key={line.id}>
                                  <td>{line.description}</td>
                                  <td>{line.quantity}</td>
                                  <td>{formatMoney(line.unitPrice)}</td>
                                  <td>{formatMoney(line.lineTotal)}</td>
                                </tr>
                              ))}
                              {order.payments.map((paid) => (
                                <tr key={paid.id}>
                                  <td colSpan={3}>Paid — {paid.method}{paid.reference ? ` (${paid.reference})` : ''}</td>
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
              <ServerListPager pager={ordersPager} noun="orders" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
