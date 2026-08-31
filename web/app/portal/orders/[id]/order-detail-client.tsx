"use client";

/**
 * One order, in full.
 *
 * The list page shows a row per order because you are scanning many at
 * once; this page exists because once you have picked one, you want
 * everything about it -- who it is for, what is being sourced from where,
 * and what has been paid -- without the list's own filters and pager
 * competing for the same screen.
 */

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { ImageLightbox } from '../../components/image-lightbox';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, formatDate, formatMoney, hasPermission, loadProfile, roleLabelFor,
} from '../../accounting/lib';

type FulfillmentType = 'STOCK' | 'SUPPLIER_ORDER';
type FulfillmentStatus = 'AWAITING_SUPPLIER' | 'ORDERED_FROM_SUPPLIER' | 'RECEIVED' | 'HANDED_TO_CUSTOMER';

type SupplierInvoiceInfo = {
  id: string; invoiceNumber: string; status: string;
  supplier: { id: string; name: string; phone?: string | null; email?: string | null };
};

type OrderLine = {
  id: string; description: string; quantity: number;
  unitPrice: string | number; listPrice?: string | number | null; discount: string | number; lineTotal: string | number;
  fulfillmentType: FulfillmentType; fulfillmentStatus: FulfillmentStatus | null;
  supplierInvoice?: SupplierInvoiceInfo | null;
  variant: {
    id: string; sku: string; name: string; costKes?: string | number | null;
    product: { name: string; brand?: string | null; featuredImageUrl?: string | null; imageUrls?: string[] | null };
  };
};

type Payment = {
  id: string; amount: string | number; method: string; reference?: string | null; receivedAt: string; receivedBy: string;
};

type Order = {
  id: string; orderNumber: string; status: string; channel: string; priceTier: string;
  subtotal: string | number; discount: string | number; taxAmount: string | number; shipping: string | number;
  total: string | number; amountPaid: string | number; balance: number; currency: string;
  customerName?: string | null; customerPhone?: string | null; customerEmail?: string | null;
  shippingAddress?: string | null; notes?: string | null;
  placedAt: string; fulfilledAt?: string | null; cancelledAt?: string | null; createdBy: string;
  store: { id: string; code: string; name: string };
  customer?: { id: string; firstName: string; lastName: string; phone?: string | null; email?: string | null } | null;
  lines: OrderLine[];
  payments: Payment[];
};

type SupplierInvoiceOption = { id: string; invoiceNumber: string; supplier?: { name: string } };
type SupplierOption = { id: string; name: string };

const METHODS = ['MPESA', 'CASH', 'CARD', 'BANK_TRANSFER'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const STATUS_NEXT: Record<string, string[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['PACKED', 'REFUNDED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

const LINE_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  AWAITING_SUPPLIER: 'Awaiting supplier',
  ORDERED_FROM_SUPPLIER: 'Ordered from supplier',
  RECEIVED: 'Received',
  HANDED_TO_CUSTOMER: 'Handed to customer',
};
const NEXT_LINE_STATUS: Record<FulfillmentStatus, FulfillmentStatus | null> = {
  AWAITING_SUPPLIER: 'ORDERED_FROM_SUPPLIER',
  ORDERED_FROM_SUPPLIER: 'RECEIVED',
  RECEIVED: 'HANDED_TO_CUSTOMER',
  HANDED_TO_CUSTOMER: null,
};

function lineImageUrl(line: OrderLine): string | null {
  const product = line.variant.product;
  return product.featuredImageUrl || product.imageUrls?.[0] || null;
}

export default function OrderDetailClient({ orderId }: { orderId: string }) {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoiceOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  // Resolved once from the chart of accounts (code 5300) rather than staff
  // ever picking a GL account by hand here -- goods bought in for an order
  // always belong in Cost of Goods Sold, not a decision this panel needs to
  // ask about.
  const [costOfGoodsSoldAccountId, setCostOfGoodsSoldAccountId] = useState<string | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  const [showPayment, setShowPayment] = useState(false);
  const [payment, setPayment] = useState({ amount: '', method: 'MPESA', reference: '' });
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  // Which line's "raise a supplier bill" panel is open, if any -- only one
  // at a time, directly under the line it's for rather than a modal, so the
  // line it applies to never has to be repeated back to the user.
  const [sourcingLineId, setSourcingLineId] = useState<string | null>(null);
  const [sourcingBusy, setSourcingBusy] = useState(false);
  const [sourcingError, setSourcingError] = useState<string | null>(null);
  const [sourcingForm, setSourcingForm] = useState({
    existingInvoiceId: '',
    supplierId: '',
    newSupplierName: '',
    invoiceNumber: '',
    invoiceDate: todayIso(),
    dueDate: addDaysIso(30),
    amount: '',
  });

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setNotFound(false);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      const [orderRow, supplierInvoiceRows, supplierRows, accountRows] = await Promise.all([
        apiRequest<Order>(`/orders/${orderId}`, { method: 'GET' }, authToken),
        // Only needed to link a supplier bill when advancing a SUPPLIER_ORDER
        // line -- a user without supplier-invoice.read simply cannot do that
        // step, so a 403 here should not sink the whole page.
        apiRequest<unknown>('/supplier-invoices?take=200', { method: 'GET' }, authToken).catch(() => []),
        // Same reasoning: only needed for the raise-a-bill panel, and a role
        // without supplier.read must still see the rest of the order.
        apiRequest<unknown>('/suppliers?take=500', { method: 'GET' }, authToken).catch(() => []),
        apiRequest<Array<{ id: string; code: string }>>('/chart-of-accounts', { method: 'GET' }, authToken).catch(() => []),
      ]);
      setOrder(orderRow);
      const rows = supplierInvoiceRows as { items?: SupplierInvoiceOption[] } | SupplierInvoiceOption[];
      setSupplierInvoices(Array.isArray(rows) ? rows : rows.items ?? []);
      const supplierList = supplierRows as { items?: SupplierOption[] } | SupplierOption[];
      setSuppliers(Array.isArray(supplierList) ? supplierList : supplierList.items ?? []);
      setCostOfGoodsSoldAccountId(
        (Array.isArray(accountRows) ? accountRows : []).find((account) => account.code === '5300')?.id,
      );
    } catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) {
        setNotFound(true);
      } else {
        setErrorMessage(error);
      }
    } finally {
      setLoading(false);
    }
  }, [orderId, setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void load(token);
  }, [initialized, token, load]);

  const canUpdate = hasPermission(profile, 'order.update');
  const canPay = hasPermission(profile, 'order-payment.create');

  const customerFullName = useMemo(() => {
    if (!order?.customer) return null;
    return `${order.customer.firstName} ${order.customer.lastName}`.trim();
  }, [order]);

  async function onSetStatus(status: string) {
    if (!token || !order) return;
    try {
      const updated = await apiRequest<Order>(`/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, token);
      setOrder(updated);
      setFeedback(`${order.orderNumber} is now ${status}.`);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function onAdvanceLineFulfillment(line: OrderLine) {
    if (!token || !order || !line.fulfillmentStatus) return;
    const next = NEXT_LINE_STATUS[line.fulfillmentStatus];
    if (!next) return;

    if (next === 'ORDERED_FROM_SUPPLIER') {
      // Which invoice covers this line is decided in the panel below, opened
      // right under this line -- whether picking an existing bill or raising
      // a new one, neither needs to leave this page.
      openSourcingPanel(line);
      return;
    }

    try {
      await apiRequest(
        `/orders/${order.id}/lines/${line.id}/fulfillment`,
        { method: 'PATCH', body: JSON.stringify({ status: next }) },
        token,
      );
      setFeedback(`${line.description} is now ${LINE_STATUS_LABEL[next].toLowerCase()}.`);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  function openSourcingPanel(line: OrderLine) {
    setSourcingError(null);
    const cost = line.variant.costKes !== null && line.variant.costKes !== undefined ? Number(line.variant.costKes) : null;
    setSourcingForm({
      existingInvoiceId: '',
      supplierId: '',
      newSupplierName: '',
      invoiceNumber: '',
      invoiceDate: todayIso(),
      dueDate: addDaysIso(30),
      // Pre-filled from the variant's cost, when it's on file, so staff are
      // not left to work out the bill amount by hand -- still theirs to
      // correct, since the real invoice may differ from the recorded cost.
      amount: cost ? String(Math.round(cost * line.quantity)) : '',
    });
    setSourcingLineId(line.id);
  }

  function closeSourcingPanel() {
    setSourcingLineId(null);
    setSourcingError(null);
  }

  /**
   * Resolves the invoice to link, raising a new supplier (and/or a new
   * invoice) first if that's what the form asked for, then marks the line
   * ordered -- one submit for what used to be a dead end pointing staff at
   * a whole separate page.
   */
  async function onSubmitSourcing(line: OrderLine) {
    if (!token || !order) return;
    setSourcingBusy(true);
    setSourcingError(null);
    try {
      let supplierInvoiceId = sourcingForm.existingInvoiceId;

      if (!supplierInvoiceId) {
        let supplierId = sourcingForm.supplierId;
        if (!supplierId) {
          if (!sourcingForm.newSupplierName.trim()) {
            throw new Error('Pick an existing supplier or enter a name for the new one.');
          }
          const supplier = await apiRequest<SupplierOption>(
            '/suppliers',
            { method: 'POST', body: JSON.stringify({ name: sourcingForm.newSupplierName.trim() }) },
            token,
          );
          supplierId = supplier.id;
        }
        if (!sourcingForm.invoiceNumber.trim() || !sourcingForm.amount) {
          throw new Error('An invoice number and amount are needed to raise the bill.');
        }
        if (!costOfGoodsSoldAccountId) {
          // Silently falling back to whatever CreateSupplierInvoiceDto
          // defaults to (General Expense) would understate margin the
          // moment this bill is approved -- surfaced instead of guessed at.
          throw new Error("Can't resolve the Cost of Goods Sold account -- ask an admin for chart-of-accounts access, or raise this bill under Accounting → Payable and set it there.");
        }
        const invoice = await apiRequest<{ id: string }>(
          '/supplier-invoices',
          {
            method: 'POST',
            body: JSON.stringify({
              invoiceNumber: sourcingForm.invoiceNumber.trim(),
              supplierId,
              invoiceDate: sourcingForm.invoiceDate,
              dueDate: sourcingForm.dueDate,
              amount: Number(sourcingForm.amount),
              // What was bought in is stock sold on, not overhead -- posting
              // it anywhere but Cost of Goods Sold would understate margin
              // the moment this bill is approved.
              glExpenseAccountId: costOfGoodsSoldAccountId,
              createdBy: profile?.email,
            }),
          },
          token,
        );
        supplierInvoiceId = invoice.id;
      }

      await apiRequest(
        `/orders/${order.id}/lines/${line.id}/fulfillment`,
        { method: 'PATCH', body: JSON.stringify({ status: 'ORDERED_FROM_SUPPLIER', supplierInvoiceId }) },
        token,
      );
      setFeedback(`${line.description} is now ordered from supplier.`);
      closeSourcingPanel();
      await load(token);
    } catch (error) {
      setSourcingError(error instanceof Error ? error.message : 'Could not mark this ordered.');
    } finally {
      setSourcingBusy(false);
    }
  }

  async function onPay() {
    if (!token || !order) return;
    try {
      await apiRequest(`/orders/${order.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payment.amount),
          method: payment.method,
          reference: payment.reference || undefined,
        }),
      }, token);
      setFeedback('Payment recorded.');
      setPayment({ amount: '', method: 'MPESA', reference: '' });
      setShowPayment(false);
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
            <article className="portal-card portal-loading">Loading order...</article>
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

  if (notFound || !order) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main is-authenticated">
          <section className="lp-container portal-auth-section">
            <article className="portal-card">
              <h2>Order not found</h2>
              <p className="portal-muted">It may have been removed, or the link is wrong.</p>
              <Link href="/portal/orders" className="portal-ghost-btn" style={{ display: 'inline-flex', width: 'fit-content', marginTop: 12 }}>
                Back to Orders
              </Link>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  const isSourcing = order.lines.some(
    (line) => line.fulfillmentType === 'SUPPLIER_ORDER' && line.fulfillmentStatus !== 'HANDED_TO_CUSTOMER',
  );
  const nextStatuses = STATUS_NEXT[order.status] || [];

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="orders"
            pageTitle={order.orderNumber}
            pageSubtitle={`${order.channel.replace('_', ' ')} · ${order.store.name} · ${formatDate(order.placedAt)}`}
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={hasPermission(profile, 'role.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <div className="portal-action-row" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
              <Link href="/portal/orders" className="portal-ghost-btn">
                Back to Orders
              </Link>
              <div className="portal-action-row">
                <span className="portal-chip">{order.status}</span>
                {isSourcing ? <span className="portal-chip is-danger">Sourcing</span> : null}
              </div>
            </div>

            <div className="portal-stats-grid">
              <article className="portal-card portal-stat-card">
                <span>Total</span>
                <strong>{formatMoney(order.total)}</strong>
              </article>
              <article className="portal-card portal-stat-card">
                <span>Paid</span>
                <strong>{formatMoney(order.amountPaid)}</strong>
              </article>
              <article className="portal-card portal-stat-card">
                <span>Balance</span>
                <strong>{order.balance > 0 ? formatMoney(order.balance) : 'Settled'}</strong>
              </article>
              <article className="portal-card portal-stat-card">
                <span>Price Tier</span>
                <strong>{order.priceTier}</strong>
              </article>
            </div>

            <div className="portal-entity-grid-2">
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Customer</h2>
                <div className="portal-info-list">
                  <div className="portal-info-row">
                    <span>Name</span>
                    <strong>{customerFullName || order.customerName || 'Walk-in'}</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>Phone</span>
                    <strong>{order.customer?.phone || order.customerPhone || '—'}</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>Email</span>
                    <strong>{order.customer?.email || order.customerEmail || '—'}</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>Delivery Address</span>
                    <strong>{order.shippingAddress || '—'}</strong>
                  </div>
                  {order.customer ? (
                    <div className="portal-info-row">
                      <span>Account</span>
                      <Link href={`/portal/customers/${order.customer.id}`} className="portal-inline-btn">
                        View Customer
                      </Link>
                    </div>
                  ) : null}
                </div>
              </article>

              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Order</h2>
                <div className="portal-info-list">
                  <div className="portal-info-row">
                    <span>Store</span>
                    <strong>{order.store.name} ({order.store.code})</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>Channel</span>
                    <strong>{order.channel.replace('_', ' ')}</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>Placed</span>
                    <strong>{formatDate(order.placedAt)}</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>Created By</span>
                    <strong>{order.createdBy}</strong>
                  </div>
                  {order.fulfilledAt ? (
                    <div className="portal-info-row">
                      <span>Fulfilled</span>
                      <strong>{formatDate(order.fulfilledAt)}</strong>
                    </div>
                  ) : null}
                  {order.cancelledAt ? (
                    <div className="portal-info-row">
                      <span>Cancelled</span>
                      <strong>{formatDate(order.cancelledAt)}</strong>
                    </div>
                  ) : null}
                  {order.notes ? (
                    <div className="portal-info-row">
                      <span>Notes</span>
                      <strong>{order.notes}</strong>
                    </div>
                  ) : null}
                </div>
                {canUpdate && nextStatuses.length > 0 ? (
                  <div className="portal-action-row" style={{ marginTop: 14 }}>
                    {nextStatuses.map((status) => (
                      <button key={status} type="button" className="portal-inline-btn" onClick={() => void onSetStatus(status)}>
                        Mark {status.charAt(0) + status.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            </div>

            <article className="portal-card">
              <div className="portal-card-header-row">
                <h2 style={{ margin: 0 }}>Items</h2>
                {canPay && order.balance > 0 ? (
                  <button type="button" className="portal-primary-btn" onClick={() => { setShowPayment(true); setPayment({ amount: String(order.balance), method: 'MPESA', reference: '' }); }}>
                    Take Payment
                  </button>
                ) : null}
              </div>

              <div className="portal-table-wrap">
                <table className="portal-data-table is-doc">
                  <thead>
                    <tr>
                      <th />
                      <th>Item</th><th>Fulfillment</th><th>Supplier</th><th>Qty</th><th>Unit</th><th>Total</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((line) => {
                      const next = line.fulfillmentStatus ? NEXT_LINE_STATUS[line.fulfillmentStatus] : null;
                      const imageUrl = lineImageUrl(line);
                      return (
                        <Fragment key={line.id}>
                        <tr>
                          <td>
                            {imageUrl ? (
                              <div
                                className="portal-list-thumb is-clickable"
                                onClick={() => setLightboxImage({ src: imageUrl, alt: line.description })}
                              >
                                <img src={imageUrl} alt="" loading="lazy" />
                              </div>
                            ) : (
                              <div className="portal-list-thumb is-empty" aria-hidden="true">
                                <span>{(line.variant.product.name || '?').trim().charAt(0).toUpperCase()}</span>
                              </div>
                            )}
                          </td>
                          <td>
                            {line.description}
                            <div className="portal-muted">{line.variant.sku}</div>
                          </td>
                          <td>
                            {line.fulfillmentType === 'SUPPLIER_ORDER' && line.fulfillmentStatus ? (
                              <span className={`portal-chip${line.fulfillmentStatus === 'HANDED_TO_CUSTOMER' ? ' is-muted' : ' is-danger'}`}>
                                {LINE_STATUS_LABEL[line.fulfillmentStatus]}
                              </span>
                            ) : (
                              <span className="portal-chip is-muted">On shelf</span>
                            )}
                          </td>
                          <td>
                            {line.supplierInvoice ? (
                              <>
                                {/* Links to the supplier's account page --
                                    there is no separate per-invoice detail
                                    route; every invoice for a supplier is
                                    listed and actioned from their own page. */}
                                <Link href={`/portal/accounting/payable/${line.supplierInvoice.supplier.id}`}>
                                  {line.supplierInvoice.supplier.name}
                                </Link>
                                <div className="portal-muted">
                                  {line.supplierInvoice.invoiceNumber} · {line.supplierInvoice.status}
                                </div>
                              </>
                            ) : (
                              <span className="portal-muted">—</span>
                            )}
                          </td>
                          <td>{line.quantity}</td>
                          <td>{formatMoney(line.unitPrice)}</td>
                          <td>{formatMoney(line.lineTotal)}</td>
                          <td>
                            {canUpdate && next ? (
                              <button type="button" className="portal-inline-btn" onClick={() => void onAdvanceLineFulfillment(line)}>
                                Mark {LINE_STATUS_LABEL[next]}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                        {sourcingLineId === line.id ? (
                          <tr>
                          <td colSpan={8}>
                            <div className="portal-entity-form" style={{ margin: '4px 0' }}>
                              <h3 style={{ margin: '0 0 4px' }}>Order &quot;{line.description}&quot; from a supplier</h3>
                              {sourcingError ? <p className="portal-error" style={{ margin: '0 0 8px' }}>{sourcingError}</p> : null}

                              {supplierInvoices.length > 0 ? (
                                <label>
                                  <span>Use an existing supplier bill</span>
                                  <select
                                    value={sourcingForm.existingInvoiceId}
                                    onChange={(event) => setSourcingForm((prev) => ({ ...prev, existingInvoiceId: event.target.value }))}
                                  >
                                    <option value="">— Raise a new bill instead —</option>
                                    {supplierInvoices.map((invoice) => (
                                      <option key={invoice.id} value={invoice.id}>
                                        {invoice.invoiceNumber} — {invoice.supplier?.name ?? 'Unknown supplier'}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}

                              {!sourcingForm.existingInvoiceId ? (
                                <>
                                  <div className="portal-entity-grid-2">
                                    <label>
                                      <span>Supplier</span>
                                      <select
                                        value={sourcingForm.supplierId}
                                        onChange={(event) => setSourcingForm((prev) => ({ ...prev, supplierId: event.target.value, newSupplierName: '' }))}
                                      >
                                        <option value="">— New supplier —</option>
                                        {suppliers.map((supplier) => (
                                          <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                                        ))}
                                      </select>
                                    </label>
                                    {!sourcingForm.supplierId ? (
                                      <label>
                                        <span>New supplier&apos;s name</span>
                                        <input
                                          value={sourcingForm.newSupplierName}
                                          placeholder="e.g. Nairobi Sneaker Distributors"
                                          onChange={(event) => setSourcingForm((prev) => ({ ...prev, newSupplierName: event.target.value }))}
                                        />
                                      </label>
                                    ) : null}
                                  </div>
                                  <div className="portal-entity-grid-3">
                                    <label>
                                      <span>Invoice number</span>
                                      <input
                                        value={sourcingForm.invoiceNumber}
                                        onChange={(event) => setSourcingForm((prev) => ({ ...prev, invoiceNumber: event.target.value }))}
                                      />
                                    </label>
                                    <label>
                                      <span>Invoice date</span>
                                      <input
                                        type="date"
                                        value={sourcingForm.invoiceDate}
                                        onChange={(event) => setSourcingForm((prev) => ({ ...prev, invoiceDate: event.target.value }))}
                                      />
                                    </label>
                                    <label>
                                      <span>Due date</span>
                                      <input
                                        type="date"
                                        value={sourcingForm.dueDate}
                                        onChange={(event) => setSourcingForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                                      />
                                    </label>
                                  </div>
                                  <label>
                                    <span>Amount (KES)</span>
                                    <input
                                      type="number" min="0.01" step="0.01"
                                      value={sourcingForm.amount}
                                      onChange={(event) => setSourcingForm((prev) => ({ ...prev, amount: event.target.value }))}
                                    />
                                  </label>
                                </>
                              ) : null}

                              <div className="portal-inline-actions">
                                <button type="button" className="portal-primary-btn" disabled={sourcingBusy} onClick={() => void onSubmitSourcing(line)}>
                                  {sourcingBusy ? 'Saving…' : 'Mark Ordered'}
                                </button>
                                <button type="button" className="portal-ghost-btn" onClick={closeSourcingPanel}>Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                        ) : null}
                        </Fragment>
                      );
                    })}
                    <tr>
                      <td colSpan={6}><strong>Subtotal</strong></td>
                      <td colSpan={2}>{formatMoney(order.subtotal)}</td>
                    </tr>
                    {Number(order.discount) > 0 ? (
                      <tr>
                        <td colSpan={6}><strong>Discount</strong></td>
                        <td colSpan={2}>-{formatMoney(order.discount)}</td>
                      </tr>
                    ) : null}
                    {Number(order.shipping) > 0 ? (
                      <tr>
                        <td colSpan={6}><strong>Shipping</strong></td>
                        <td colSpan={2}>{formatMoney(order.shipping)}</td>
                      </tr>
                    ) : null}
                    <tr>
                      <td colSpan={6}><strong>Total</strong></td>
                      <td colSpan={2}><strong>{formatMoney(order.total)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {order.lines.some((line) => line.fulfillmentStatus === 'AWAITING_SUPPLIER') ? (
                <p className="portal-muted" style={{ marginTop: 8 }}>
                  Raise the supplier bill under Accounting → Payable before marking a line ordered — set its GL
                  account to Cost of Goods Sold so the margin on this sale reads correctly once it is approved.
                </p>
              ) : null}
            </article>

            {showPayment && canPay ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Record Payment</h2>
                <div className="portal-entity-form">
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Amount (KES)</span>
                      <input type="number" min="1" value={payment.amount}
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
                    <button type="button" className="portal-primary-btn" onClick={() => void onPay()}>Record Payment</button>
                    <button type="button" className="portal-ghost-btn" onClick={() => setShowPayment(false)}>Cancel</button>
                  </div>
                </div>
              </article>
            ) : null}

            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>Payments</h2>
              {order.payments.length === 0 ? (
                <div className="portal-empty-state">No payments recorded yet.</div>
              ) : (
                <div className="portal-table-wrap">
                  <table className="portal-data-table is-doc">
                    <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Received By</th><th>Amount</th></tr></thead>
                    <tbody>
                      {order.payments.map((paid) => (
                        <tr key={paid.id}>
                          <td>{formatDate(paid.receivedAt)}</td>
                          <td>{paid.method}</td>
                          <td>{paid.reference || '—'}</td>
                          <td>{paid.receivedBy}</td>
                          <td>{formatMoney(paid.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </PortalShell>
        </section>
      </main>
      {lightboxImage ? (
        <ImageLightbox src={lightboxImage.src} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />
      ) : null}
    </EliteLayout>
  );
}
