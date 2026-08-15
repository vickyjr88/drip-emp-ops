"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { formatDate, formatMoney } from '../../accounting/lib';

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  portalEnabled?: boolean;
  portalLastLoginAt?: string | null;
  createdAt?: string;
};





type CustomerOrder = {
  id: string;
  orderNumber: string;
  status: string;
  total: string | number;
  amountPaid: string | number;
  placedAt: string;
  store?: { name: string } | null;
};

type OrderPage = { items: CustomerOrder[] };

type CustomerDocument = {
  id: string;
  documentType: string;
  fileName: string;
  url: string;
  fileSize?: number | null;
  notes?: string | null;
  uploadedAt: string;
};

type AuthRole = {
  id: string;
  name: string;
  permissions: string[];
};

type AuthProfile = {
  id: string;
  email: string;
  role: string | null;
  roles?: AuthRole[];
  permissions?: string[];
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const TOKEN_KEY = 'de_access_token';

async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function hasPermission(profile: AuthProfile | null | undefined, permission: string): boolean {
  if (!profile) {
    return false;
  }

  if (profile.role === 'ADMIN' || profile.roles?.some((role) => role.name === 'ADMIN')) {
    return true;
  }

  return Boolean(profile.permissions?.includes(permission));
}

export default function CustomerDetailClient({ customerId }: { customerId: string }) {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [showPortalForm, setShowPortalForm] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');

  useEffect(() => {
    const savedToken = window.localStorage.getItem(TOKEN_KEY);
    setToken(savedToken);
    setInitialized(true);
  }, []);

  const loadCustomer = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);

      // Units, sales contracts and tenancies used to be fetched here. Those
      // endpoints went with the property business, and their permissions went
      // with them, so hasPermission was returning false and the screen quietly
      // rendered three empty cards.
      const [nextCustomer, nextOrders, nextDocuments] = await Promise.all([
        apiRequest<Customer>(`/customers/${customerId}`, { method: 'GET' }, authToken),
        hasPermission(nextProfile, 'order.read')
          ? apiRequest<OrderPage>(
              `/orders?customerId=${customerId}&take=100`,
              { method: 'GET' },
              authToken,
            )
          : Promise.resolve({ items: [] as CustomerOrder[] }),
        hasPermission(nextProfile, 'customer-document.read')
          ? apiRequest<CustomerDocument[]>(
              `/customer-documents?customerId=${customerId}&take=200`,
              { method: 'GET' },
              authToken,
            )
          : Promise.resolve([]),
      ]);

      setProfile(nextProfile);
      setCustomer(nextCustomer);
      setOrders(Array.isArray(nextOrders) ? nextOrders : nextOrders.items || []);
      setDocuments(nextDocuments);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load customer details.');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    if (!token) {
      setLoading(false);
      return;
    }

    void loadCustomer(token);
  }, [initialized, token, loadCustomer]);




  const canUpdateCustomer = hasPermission(profile, 'customer.update');

  async function onSetPortalPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdateCustomer || !customer) return;

    if (portalPassword.trim().length < 8) {
      setErrorMessage('Portal password must be at least 8 characters.');
      return;
    }

    setMutating(true);
    setFeedback(null);
    setErrorMessage(null);
    try {
      const updated = await apiRequest<Customer>(
        `/customers/${customer.id}/portal-password`,
        { method: 'POST', body: JSON.stringify({ password: portalPassword }) },
        token,
      );
      setCustomer(updated);
      setPortalPassword('');
      setShowPortalForm(false);
      setFeedback(
        `Portal access is active. Share the password with ${updated.firstName} securely — it cannot be viewed again.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to set the portal password.');
    } finally {
      setMutating(false);
    }
  }

  async function onTogglePortalAccess(enabled: boolean) {
    if (!token || !canUpdateCustomer || !customer) return;

    setMutating(true);
    setFeedback(null);
    setErrorMessage(null);
    try {
      const updated = await apiRequest<Customer>(
        `/customers/${customer.id}/portal-access`,
        { method: 'PATCH', body: JSON.stringify({ enabled }) },
        token,
      );
      setCustomer(updated);
      setFeedback(enabled ? 'Portal access enabled.' : 'Portal access revoked.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to change portal access.');
    } finally {
      setMutating(false);
    }
  }


  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-detail-shell">
            <p className="portal-kicker">Customer Profile</p>
            <h1>Loading customer...</h1>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-detail-shell">
            <p className="portal-kicker">Customer Profile</p>
            <h1>Authentication required</h1>
            <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
              Go to Portal Login
            </Link>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (errorMessage && !customer) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-detail-shell">
            <p className="portal-kicker">Customer Profile</p>
            <h1>Customer not available</h1>
            <p>{errorMessage}</p>
            <Link href="/portal/customers" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
              Back to Customers
            </Link>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!customer) {
    return null;
  }

  const roleLabel =
    profile.roles && profile.roles.length > 0
      ? profile.roles.map((role) => role.name).join(', ')
      : profile.role || 'Unassigned';
  const canReadRbac =
    hasPermission(profile, 'role.read') ||
    hasPermission(profile, 'permission.read') ||
    hasPermission(profile, 'user.read');

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="customers"
            pageTitle={`${customer.firstName} ${customer.lastName}`}
            pageSubtitle="Contact details, orders and documents"
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbac}
            onLogout={onLogout}
          >
          <div className="portal-detail-header" style={{ marginBottom: 0, paddingBottom: 0, border: 0 }}>
            <div className="portal-detail-meta">
              <span>{orders.length} order{orders.length === 1 ? '' : 's'}</span>
              <span>{documents.length} document{documents.length === 1 ? '' : 's'}</span>
            </div>
            <div className="portal-detail-header-actions">
              {canUpdateCustomer ? (
                <Link href={`/portal/customers/${customer.id}/edit`} className="portal-primary-btn">
                  Edit Customer
                </Link>
              ) : null}
              <Link href="/portal/customers" className="portal-ghost-btn portal-detail-back">
                Back to Customers
              </Link>
            </div>
          </div>


          <div className="portal-stack-grid">
            <div className="portal-detail-grid">
              <article className="portal-card">
                <h2>Contact & Identity</h2>
                <div className="portal-info-list">
                  <div className="portal-info-row">
                    <span>Email</span>
                    <strong>{customer.email}</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>Phone</span>
                    <strong>{customer.phone}</strong>
                  </div>
                </div>
              </article>

              <article className="portal-card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0 }}>Customer Portal Access</h2>
                    <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                      Lets this customer sign in at <code>/account</code> to see their own unit, charges,
                      and payments.
                    </p>
                  </div>
                  {canUpdateCustomer ? (
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => {
                        setPortalPassword('');
                        setShowPortalForm((prev) => !prev);
                      }}
                    >
                      {showPortalForm ? 'Close' : customer.portalEnabled ? 'Reset Password' : 'Grant Access'}
                    </button>
                  ) : null}
                </div>

                <div className="portal-info-list">
                  <div className="portal-info-row">
                    <span>Status</span>
                    <strong>{customer.portalEnabled ? 'Active' : 'No access'}</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>Last Sign In</span>
                    <strong>
                      {customer.portalLastLoginAt
                        ? new Date(customer.portalLastLoginAt).toLocaleString('en-GB')
                        : 'Never'}
                    </strong>
                  </div>
                </div>

                {showPortalForm && canUpdateCustomer ? (
                  <form className="portal-entity-form portal-inline-form" onSubmit={onSetPortalPassword}>
                    <label>
                      <span>New Portal Password (min 8 characters)</span>
                      <input
                        type="text"
                        autoComplete="off"
                        minLength={8}
                        value={portalPassword}
                        onChange={(event) => setPortalPassword(event.target.value)}
                        placeholder="Give this to the customer securely"
                        required
                      />
                    </label>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Saving...' : 'Set Password & Enable'}
                    </button>
                  </form>
                ) : null}

                {canUpdateCustomer && customer.portalEnabled ? (
                  <div className="portal-inline-actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="portal-inline-btn is-danger"
                      onClick={() => void onTogglePortalAccess(false)}
                      disabled={mutating}
                    >
                      Revoke Access
                    </button>
                  </div>
                ) : null}
              </article>

            </div>

            <div className="portal-section-grid">
              <article className="portal-card">
                <h2>Orders</h2>
                <div className="portal-list-stack">
                  {orders.length === 0 ? (
                    <div className="portal-empty-state">
                      No orders for this customer yet. Walk-in sales are not tied to a customer
                      record.
                    </div>
                  ) : (
                    orders.map((order) => (
                      <div key={order.id} className="portal-list-row">
                        <div>
                          <strong>{order.orderNumber}</strong>
                          <p className="portal-muted" style={{ margin: '2px 0 0' }}>
                            {order.store?.name || 'Store not set'} · {formatDate(order.placedAt)}
                          </p>
                        </div>
                        <div className="portal-list-meta">
                          <span>{formatMoney(order.total)}</span>
                          {/* What is still owed matters more than the status word:
                              it is the reason to ring them. */}
                          <span className="portal-muted">
                            {Number(order.total) - Number(order.amountPaid) > 0
                              ? `${formatMoney(Number(order.total) - Number(order.amountPaid))} owing`
                              : 'Paid in full'}
                          </span>
                        </div>
                        <span>{order.status}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>

            </div>

            <article className="portal-card">
              <div className="portal-card-header-row">
                <h2 style={{ margin: 0 }}>Documents</h2>
                {canUpdateCustomer ? (
                  <Link href={`/portal/customers/${customer.id}/edit`} className="portal-inline-btn">
                    Manage Documents
                  </Link>
                ) : null}
              </div>
              <div className="portal-list-stack">
                {documents.length === 0 ? (
                  <div className="portal-empty-state">No documents attached for this customer.</div>
                ) : (
                  documents.map((doc) => (
                    <div key={doc.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>
                            <a href={doc.url} target="_blank" rel="noreferrer">
                              {doc.fileName}
                            </a>
                          </strong>
                          <p>
                            Uploaded {new Date(doc.uploadedAt).toLocaleDateString('en-GB')}
                            {doc.notes ? ` • ${doc.notes}` : ''}
                          </p>
                        </div>
                        <span>{doc.documentType.replaceAll('_', ' ')}</span>
                        <span>
                          <a href={doc.url} target="_blank" rel="noreferrer" className="portal-inline-btn">
                            Open
                          </a>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

          </div>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
