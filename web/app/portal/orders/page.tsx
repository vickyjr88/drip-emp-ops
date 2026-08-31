"use client";

/**
 * Orders: taking one, and moving it along afterwards.
 *
 * The till and the order list share a screen because in a shop they are the
 * same job — ring up the sale in front of you, then check what is still owed
 * on the ones behind it.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { ListExport } from '../components/list-export';
import { ListThumb } from '../components/list-thumb';
import { usePortalDialog } from '../components/portal-dialog';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, asList, canReadRbacFor, formatDate,
  formatMoney, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Store = { id: string; code: string; name: string };
type Customer = { id: string; firstName: string; lastName: string; email: string; phone: string };

type Level = {
  quantity: number; sellable: number;
  store: Store;
  variant: { id: string; sku: string; name: string; priceKes: string | number; product: { name: string } };
};

/**
 * The full catalogue, for picking something to order in even when nothing is
 * on the shelf -- either a normal variant that happens to be at zero right
 * now, or one that is never stocked at all (isDropShip).
 */
type CatalogueProduct = {
  id: string; name: string; brand?: string | null;
  variants: { id: string; sku: string; name: string; priceKes: string | number; isActive: boolean; isDropShip: boolean }[];
};

type FulfillmentType = 'STOCK' | 'SUPPLIER_ORDER';
type FulfillmentStatus = 'AWAITING_SUPPLIER' | 'ORDERED_FROM_SUPPLIER' | 'RECEIVED' | 'HANDED_TO_CUSTOMER';

type OrderLine = {
  id: string; description: string; quantity: number;
  unitPrice: string | number; lineTotal: string | number;
  fulfillmentType: FulfillmentType; fulfillmentStatus: FulfillmentStatus | null;
  variant?: { product?: { name: string; featuredImageUrl?: string | null; imageUrls?: string[] | null } | null } | null;
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

type CartLeadLine = { variantId: string; sku: string; name: string; size: string; quantity: number; priceKes: number };
type CartLead = {
  id: string; source: 'WHATSAPP_ORDER' | 'ABANDONED_CART'; status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'EXPIRED';
  customerName?: string | null; customerPhone?: string | null; customerEmail?: string | null;
  lines: CartLeadLine[]; total: string | number; message?: string | null;
  lastActivityAt: string; createdAt: string;
  /** Resolved server-side from the first line's variantId -- the cart's own
   *  snapshot never stored an image, so this is looked up at read time. */
  firstLineImageUrl?: string | null;
};

type Draft = {
  variantId: string; quantity: number; label: string; price: number;
  fulfillmentType: FulfillmentType;
};

export default function OrdersPage() {
  const router = useRouter();
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueProduct[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showTill, setShowTill] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [awaitingSupplierOnly, setAwaitingSupplierOnly] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  const [head, setHead] = useState({ storeId: '', channel: 'IN_STORE', customerId: '', customerName: '', customerPhone: '' });
  const [draft, setDraft] = useState<Draft[]>([]);
  const [pick, setPick] = useState({ variantId: '', quantity: '1' });
  /** Item search across the whole catalogue, not just what is on the shelf here. */
  const [itemQuery, setItemQuery] = useState('');
  /** Search text for the customer autocomplete. Blank once a customer is
   *  picked, same pattern as the item and reseller pickers elsewhere. */
  const [customerQuery, setCustomerQuery] = useState('');
  const [payment, setPayment] = useState({ orderId: '', amount: '', method: 'MPESA', reference: '' });
  /** Set while the till is being used to ring up a specific lead, so placing the order can mark that lead converted afterwards. */
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      const [levelRows, storeRows, productRows, customerRows] = await Promise.all([
        apiRequest<unknown>('/inventory/levels', { method: 'GET' }, authToken),
        apiRequest<Store[]>('/stores', { method: 'GET' }, authToken),
        apiRequest<unknown>('/products?take=500', { method: 'GET' }, authToken),
        // Only needed to fill the customer picker -- a role without
        // customer.read simply gets the free-text fallback instead.
        apiRequest<unknown>('/customers?take=500', { method: 'GET' }, authToken).catch(() => []),
      ]);
      setLevels(asList<Level>(levelRows));
      setStores(storeRows);
      setCatalogue(asList<CatalogueProduct>(productRows));
      setCustomers(asList<Customer>(customerRows));
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

  const orderFilters = useMemo(
    () => ({ status: statusFilter || undefined, awaitingSupplier: awaitingSupplierOnly || undefined }),
    [statusFilter, awaitingSupplierOnly],
  );

  const fetchOrdersPage = useCallback(
    async (params: {
      skip: number;
      take: number;
      search: string;
      status?: string;
      awaitingSupplier?: boolean;
    }): Promise<ServerPage<Order>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      if (params.status) query.set('status', params.status);
      if (params.awaitingSupplier) query.set('awaitingSupplier', 'true');
      return apiRequest<ServerPage<Order>>(`/orders?${query}`, { method: 'GET' }, token);
    },
    [token],
  );

  const ordersPager = useServerPager<Order, typeof orderFilters>({
    fetchPage: (params) => fetchOrdersPage(params),
    filters: orderFilters,
    enabled: Boolean(token),
  });

  const [leadSourceFilter, setLeadSourceFilter] = useState('');
  const leadFilters = useMemo(() => ({ source: leadSourceFilter || undefined }), [leadSourceFilter]);

  const fetchLeadsPage = useCallback(
    async (params: { skip: number; take: number; search: string; source?: string }): Promise<ServerPage<CartLead>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      // A lead already turned into an order, or dismissed, has nothing left
      // for staff to act on -- the default view is only the outstanding ones
      // (NEW or already CONTACTED but still unresolved). Dismissed/converted
      // leads live in their own history view instead of cluttering this one.
      query.set('outstanding', 'true');
      if (params.search) query.set('search', params.search);
      if (params.source) query.set('source', params.source);
      return apiRequest<ServerPage<CartLead>>(`/cart-leads?${query}`, { method: 'GET' }, token);
    },
    [token],
  );

  const leadsPager = useServerPager<CartLead, typeof leadFilters>({
    fetchPage: (params) => fetchLeadsPage(params),
    filters: leadFilters,
    enabled: Boolean(token),
  });

  async function onDismissLead(lead: CartLead) {
    if (!token) return;
    try {
      await apiRequest(`/cart-leads/${lead.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'EXPIRED' }) }, token);
      leadsPager.reload();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  /** Pre-fills the till with this lead's items and contact so staff ring it up as a real order instead of retyping it. */
  function onStartOrderFromLead(lead: CartLead) {
    setHead((prev) => ({
      ...prev,
      channel: lead.source === 'WHATSAPP_ORDER' ? 'WHATSAPP' : prev.channel,
      customerId: '',
      customerName: lead.customerName || '',
      customerPhone: lead.customerPhone || '',
    }));
    // The name field reads from customerQuery until a customer is picked from
    // the autocomplete (see its value binding below) -- without also setting
    // this, the prefill would be invisible even though head.customerName is
    // correctly set underneath it.
    setCustomerQuery(lead.customerName || '');
    setDraft(
      lead.lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        label: `${line.name} (${line.size})`,
        price: line.priceKes,
        fulfillmentType: 'STOCK' as FulfillmentType,
      })),
    );
    setConvertingLeadId(lead.id);
    setShowTill(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

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
  const canAddCustomer = hasPermission(profile, 'customer.create');

  const customerMatches = useMemo(() => {
    const query = customerQuery.trim().toLowerCase();
    const scored = !query
      ? customers
      : customers.filter((customer) => {
          const name = `${customer.firstName} ${customer.lastName}`.trim().toLowerCase();
          return name.includes(query) || customer.phone?.toLowerCase().includes(query) || customer.email?.toLowerCase().includes(query);
        });
    return scored.slice(0, 25);
  }, [customers, customerQuery]);

  // Sellable quantity here, per variant -- the picker uses this to decide
  // whether a line rings up as STOCK or has to become a SUPPLIER_ORDER.
  const sellableHere = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of levels) {
      if (row.store.id !== head.storeId) continue;
      map.set(row.variant.id, row.sellable);
    }
    return map;
  }, [levels, head.storeId]);

  /**
   * Every active variant in the catalogue, whether or not it is on the
   * shelf here. A variant with nothing sellable at this store -- including
   * one that is never stocked at all -- is offered too, just flagged as a
   * supplier order rather than left out. That is the whole point: "we don't
   * have it, but the supplier does" should not mean it cannot be sold.
   */
  const itemOptions = useMemo(() => {
    const options: Array<{
      variantId: string; sku: string; label: string; price: number;
      sellable: number; mustOrder: boolean;
    }> = [];
    for (const product of catalogue) {
      for (const variant of product.variants) {
        if (!variant.isActive) continue;
        const sellable = sellableHere.get(variant.id) ?? 0;
        options.push({
          variantId: variant.id,
          sku: variant.sku,
          label: `${product.name} — ${variant.name}`,
          price: Number(variant.priceKes),
          sellable,
          // A drop-ship variant is never on the shelf, so it always has to
          // be ordered in, even if some stray StockLevel row said otherwise.
          mustOrder: variant.isDropShip || sellable <= 0,
        });
      }
    }
    return options;
  }, [catalogue, sellableHere]);

  const itemMatches = useMemo(() => {
    const query = itemQuery.trim().toLowerCase();
    const scored = !query
      ? itemOptions
      : itemOptions.filter(
          (option) => option.label.toLowerCase().includes(query) || option.sku.toLowerCase().includes(query),
        );
    // Capped, same reasoning as elsewhere: a few hundred rendered rows is a
    // slow first paint for a list nobody scrolls to the end of.
    return scored.slice(0, 25);
  }, [itemOptions, itemQuery]);

  const draftTotal = draft.reduce((sum, line) => sum + line.price * line.quantity, 0);

  function addLine() {
    const option = itemOptions.find((row) => row.variantId === pick.variantId);
    if (!option) return;
    const quantity = Number(pick.quantity) || 1;
    const fulfillmentType: FulfillmentType = option.mustOrder ? 'SUPPLIER_ORDER' : 'STOCK';
    setDraft((prev) => {
      const existing = prev.find((line) => line.variantId === option.variantId);
      if (existing) {
        return prev.map((line) =>
          line.variantId === option.variantId ? { ...line, quantity: line.quantity + quantity } : line);
      }
      return [...prev, {
        variantId: option.variantId,
        quantity,
        label: option.label,
        price: option.price,
        fulfillmentType,
      }];
    });
    setPick({ variantId: '', quantity: '1' });
    setItemQuery('');
  }

  async function onAddCustomer() {
    if (!token) return;
    const result = await dialog.prompt({
      title: 'New Customer',
      message: 'Adds a customer record, then picks it for this order.',
      fields: [
        { name: 'firstName', label: 'First name', required: true },
        { name: 'lastName', label: 'Last name', required: true },
        { name: 'phone', label: 'Phone', required: true, placeholder: '+254…' },
        { name: 'email', label: 'Email', placeholder: 'Leave blank if unknown' },
      ],
      confirmLabel: 'Add Customer',
    });
    if (!result) return;
    try {
      const created = await apiRequest<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          firstName: result.firstName,
          lastName: result.lastName,
          phone: result.phone,
          email: result.email || undefined,
        }),
      }, token);
      setCustomers((prev) => [...prev, created]);
      setHead((prev) => ({
        ...prev,
        customerId: created.id,
        customerName: `${created.firstName} ${created.lastName}`.trim(),
        customerPhone: created.phone,
      }));
      setCustomerQuery('');
      setFeedback(`${created.firstName} ${created.lastName} added.`);
    } catch (error) {
      setErrorMessage(error);
    }
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
          customerId: head.customerId || undefined,
          customerName: head.customerName || undefined,
          customerPhone: head.customerPhone || undefined,
          lines: draft.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            fulfillmentType: line.fulfillmentType,
          })),
        }),
      }, token);
      setFeedback(`${order.orderNumber} placed — ${formatMoney(order.total)}.`);
      if (convertingLeadId) {
        await apiRequest(`/cart-leads/${convertingLeadId}/convert`, { method: 'PATCH', body: JSON.stringify({ orderId: order.id }) }, token)
          .catch(() => {
            // The order is real either way; the lead just stays listed as
            // outstanding if this follow-up call fails.
          });
        setConvertingLeadId(null);
        leadsPager.reload();
      }
      setDraft([]);
      setHead((prev) => ({ ...prev, customerId: '', customerName: '', customerPhone: '' }));
      setCustomerQuery('');
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
              <article className="portal-card" data-tour="orders.new">
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
                      <input
                        value={head.customerId ? head.customerName : customerQuery}
                        placeholder="Walk-in — search an existing customer, or type a name"
                        onChange={(event) => {
                          const value = event.target.value;
                          setCustomerQuery(value);
                          // Typing after a customer is picked starts a walk-in
                          // name instead: the field never locks once chosen.
                          setHead((prev) => ({ ...prev, customerId: '', customerName: value }));
                        }}
                      />
                      {head.customerId ? (
                        <div className="portal-picked-row">
                          <span>
                            <strong>{head.customerName}</strong>{' '}
                            <span className="portal-muted">{head.customerPhone}</span>
                          </span>
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => setHead((prev) => ({ ...prev, customerId: '', customerName: '', customerPhone: '' }))}
                          >
                            Change
                          </button>
                        </div>
                      ) : customerQuery.trim() ? (
                        <div className="portal-picker-results">
                          {customerMatches.length === 0 ? (
                            <p className="portal-muted" style={{ margin: 8 }}>No customer matches that.</p>
                          ) : (
                            customerMatches.map((customer) => (
                              <button
                                key={customer.id}
                                type="button"
                                className="portal-picker-option"
                                onClick={() => {
                                  setHead((prev) => ({
                                    ...prev,
                                    customerId: customer.id,
                                    customerName: `${customer.firstName} ${customer.lastName}`.trim(),
                                    customerPhone: customer.phone,
                                  }));
                                  setCustomerQuery('');
                                }}
                              >
                                <span>{customer.firstName} {customer.lastName}</span>
                                <span className="portal-muted">{customer.phone || customer.email}</span>
                              </button>
                            ))
                          )}
                          {canAddCustomer ? (
                            <button type="button" className="portal-picker-option is-action" onClick={() => void onAddCustomer()}>
                              <span>+ Add new customer</span>
                            </button>
                          ) : null}
                        </div>
                      ) : null}
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
                      <input
                        value={itemQuery}
                        placeholder="Search product, size or SKU…"
                        onChange={(event) => { setItemQuery(event.target.value); setPick((prev) => ({ ...prev, variantId: '' })); }}
                      />
                      {pick.variantId ? (
                        <div className="portal-picked-row">
                          <span>
                            <strong>{itemOptions.find((option) => option.variantId === pick.variantId)?.label}</strong>
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
                              {itemQuery.trim() ? 'Nothing matches that.' : 'Start typing, or pick from the list.'}
                            </p>
                          ) : (
                            itemMatches.map((option) => (
                              <button
                                key={option.variantId}
                                type="button"
                                className="portal-picker-option"
                                onClick={() => { setPick((prev) => ({ ...prev, variantId: option.variantId })); setItemQuery(''); }}
                              >
                                <span>{option.label}</span>
                                <span className="portal-muted">
                                  {option.sku}
                                  {option.mustOrder ? ' · order from supplier' : ` · ${option.sellable} on shelf`}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                      {!pick.variantId ? (
                        <small className="portal-muted">
                          Anything in the catalogue can be added, even with nothing on the shelf — it rings up as
                          an order from the supplier instead.
                        </small>
                      ) : null}
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
                        <thead><tr><th>Item</th><th>Fulfillment</th><th>Qty</th><th>Price</th><th>Total</th><th /></tr></thead>
                        <tbody>
                          {draft.map((line) => (
                            <tr key={line.variantId}>
                              <td>{line.label}</td>
                              <td>
                                {line.fulfillmentType === 'SUPPLIER_ORDER' ? (
                                  <span className="portal-chip is-danger">From supplier</span>
                                ) : (
                                  <span className="portal-chip is-muted">On shelf</span>
                                )}
                              </td>
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
                            <td colSpan={4}><strong>Total</strong></td>
                            <td colSpan={2}><strong>{formatMoney(draftTotal)}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="portal-empty-state">Nothing added yet.</div>
                  )}
                  {draft.some((line) => line.fulfillmentType === 'SUPPLIER_ORDER') ? (
                    <p className="portal-muted">
                      Item(s) marked &ldquo;From supplier&rdquo; are charged in full now, same as anything on the
                      shelf. Let the customer know it is being sourced and roughly when to expect it — the order
                      will sit in Awaiting Supplier until it is bought in and handed over.
                    </p>
                  ) : null}

                  <div className="portal-inline-actions">
                    <button type="submit" className="portal-primary-btn" disabled={saving || draft.length === 0}>
                      {saving ? 'Placing...' : `Place Order — ${formatMoney(draftTotal)}`}
                    </button>
                    <button type="button" className="portal-ghost-btn" onClick={() => { setShowTill(false); setDraft([]); setConvertingLeadId(null); }}>
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

            <article className="portal-card" data-tour="orders.leads">
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Cart Leads</h2>
                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                    Shoppers who chose WhatsApp instead of checking out, or left a cart with contact details filled in.
                  </p>
                </div>
                <Link href="/portal/cart-leads/history" className="portal-ghost-btn">
                  View History
                </Link>
              </div>

              <div className="list-toolbar">
                <ServerListSearch pager={leadsPager} placeholder="Search name, phone or email…" />
                <select value={leadSourceFilter} onChange={(event) => setLeadSourceFilter(event.target.value)}>
                  <option value="">All sources</option>
                  <option value="WHATSAPP_ORDER">WhatsApp order</option>
                  <option value="ABANDONED_CART">Abandoned cart</option>
                </select>
              </div>

              <div className="portal-list-stack">
                {!leadsPager.loading && leadsPager.items.length === 0 ? (
                  <div className="portal-empty-state">
                    {leadsPager.search || leadSourceFilter ? 'No leads match.' : 'No outstanding leads.'}
                  </div>
                ) : (
                  leadsPager.items.map((lead) => (
                    <div
                      key={lead.id}
                      className={`portal-record${canCreate ? ' is-clickable' : ''}`}
                      role={canCreate ? 'button' : undefined}
                      tabIndex={canCreate ? 0 : undefined}
                      onClick={canCreate ? () => onStartOrderFromLead(lead) : undefined}
                      onKeyDown={canCreate ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onStartOrderFromLead(lead);
                        }
                      } : undefined}
                    >
                      <div className="portal-list-row has-thumb">
                        <ListThumb sources={[lead.firstLineImageUrl]} label={lead.lines[0]?.name || lead.customerName || '?'} />
                        <div>
                          <strong>{lead.customerName || lead.customerPhone || lead.customerEmail}</strong>
                          <span className="portal-chip" style={{ marginLeft: 8 }}>
                            {lead.source === 'WHATSAPP_ORDER' ? 'WhatsApp' : 'Abandoned cart'}
                          </span>
                          <p className="portal-muted">
                            {lead.customerPhone || lead.customerEmail || 'No contact on file'} ·{' '}
                            {lead.lines.length} item{lead.lines.length === 1 ? '' : 's'} · {formatDate(lead.lastActivityAt)}
                          </p>
                          <p>{formatMoney(lead.total)}</p>
                        </div>
                        <div className="portal-action-row" onClick={(event) => event.stopPropagation()}>
                          {canCreate ? (
                            <button type="button" className="portal-inline-btn" onClick={() => onStartOrderFromLead(lead)}>
                              Start Order
                            </button>
                          ) : null}
                          <button type="button" className="portal-inline-btn" onClick={() => void onDismissLead(lead)}>
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <ServerListPager pager={leadsPager} noun="leads" />
            </article>

            <article className="portal-card" data-tour="orders.list">
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
                <label className="portal-check">
                  <input
                    type="checkbox"
                    checked={awaitingSupplierOnly}
                    onChange={(event) => setAwaitingSupplierOnly(event.target.checked)}
                  />
                  <span>Awaiting supplier only</span>
                </label>
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
                    {ordersPager.search || statusFilter || awaitingSupplierOnly ? 'No orders match.' : 'No orders yet.'}
                  </div>
                ) : (
                  rows.map((order) => {
                    const firstProduct = order.lines[0]?.variant?.product;
                    return (
                    <div
                      key={order.id}
                      className="portal-record is-clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/portal/orders/${order.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          router.push(`/portal/orders/${order.id}`);
                        }
                      }}
                    >
                      <div className="portal-list-row has-thumb">
                        <ListThumb
                          sources={[firstProduct?.featuredImageUrl, firstProduct?.imageUrls?.[0]]}
                          label={firstProduct?.name || order.orderNumber}
                        />
                        <div>
                          <strong>{order.orderNumber}</strong>
                          {order.lines.some(
                            (line) => line.fulfillmentType === 'SUPPLIER_ORDER' && line.fulfillmentStatus !== 'HANDED_TO_CUSTOMER',
                          ) ? (
                            <span className="portal-chip is-danger" style={{ marginLeft: 8 }}>Sourcing</span>
                          ) : null}
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
                        {/* The card itself now navigates to the order; this row's
                            own buttons must still act on the order in place
                            (take a payment, advance status) without also
                            triggering that navigation underneath them. */}
                        <div className="portal-action-row" onClick={(event) => event.stopPropagation()}>
                          <Link href={`/portal/orders/${order.id}`} className="portal-inline-btn">
                            View
                          </Link>
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
                    </div>
                    );
                  })
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
