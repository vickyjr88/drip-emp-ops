"use client";

/**
 * Portal entry: sign-in, and the dashboard once signed in.
 *
 * Replaces the property dashboard this was carried over from. The figures
 * shown are the ones a shop actually opens the day on -- what sold, what is
 * owed, and what is about to run out -- rather than a wall of every metric the
 * API can produce.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../components/elite-layout';
import { PortalShell } from './components/portal-shell';
import { PasswordInput } from '../components/password-input';
import { useErrorState, useNotifications } from './components/notifications';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  canReadRbacFor,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from './accounting/lib';

type SalesSummary = {
  orderCount: number;
  revenue: number;
  collected: number;
  outstanding: number;
  averageOrderValue: number;
  unconfirmed: { count: number; value: number };
  byStatus: Array<{ status: string; count: number; value: number }>;
};

type StockRow = {
  quantity: number;
  reserved: number;
  sellable: number;
  needsReorder: boolean;
  store: { id: string; code: string; name: string };
  variant: { id: string; sku: string; name: string; product: { name: string; brand?: string | null } };
};

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  total: string | number;
  amountPaid: string | number;
  placedAt: string;
  customerName?: string | null;
  store: { name: string };
};

/** One quick-jump card at the top of the dashboard: where it goes, and how
 *  many rows live there. Null while the count has not loaded (or the role
 *  cannot see it), so the card still links out without claiming a number. */
type NavCard = { key: string; label: string; href: string; count: number | null; icon: JSX.Element };

const NAV_ICONS: Record<string, JSX.Element> = {
  orders: (
    <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5M8 12h8M8 16h5" />
  ),
  consignments: (
    <path d="M3 7h18M3 7l1.5 12a2 2 0 0 0 2 1.8h11a2 2 0 0 0 2-1.8L21 7M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  ),
  resellers: (
    <path d="M17 20v-2a4 4 0 0 0-3-3.87M13 3.13a4 4 0 0 1 0 7.75M9 20v-2a4 4 0 0 0-4-4H4M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
  ),
  customers: (
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  ),
};

export default function PortalPage() {
  const notifications = useNotifications();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [lowStock, setLowStock] = useState<StockRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
  const [consignmentCount, setConsignmentCount] = useState<number | null>(null);
  const [resellerCount, setResellerCount] = useState<number | null>(null);
  const [customerCount, setCustomerCount] = useState<number | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);

      // Each panel is optional: a role without order permission should still
      // get a working dashboard rather than an error.
      if (hasPermission(nextProfile, 'order.read')) {
        const [sales, orders] = await Promise.all([
          apiRequest<SalesSummary>('/orders/summary', { method: 'GET' }, authToken),
          apiRequest<OrderRow[] | { items: OrderRow[] }>('/orders?take=8', { method: 'GET' }, authToken),
        ]);
        setSummary(sales && typeof sales === 'object' && 'orderCount' in sales ? sales : null);
        setRecentOrders(Array.isArray(orders) ? orders : Array.isArray(orders?.items) ? orders.items : []);
      }
      if (hasPermission(nextProfile, 'stock-level.read')) {
        const levels = await apiRequest<StockRow[] | { items: StockRow[] }>('/inventory/levels?lowOnly=true', { method: 'GET' }, authToken);
        setLowStock(Array.isArray(levels) ? levels : Array.isArray(levels?.items) ? levels.items : []);
      }

      // Just the count from each list's paginated envelope -- take=1 fetches
      // one row (if any) at the cost of one row, and .total is the number the
      // nav card actually wants.
      if (hasPermission(nextProfile, 'consignment.read')) {
        const page = await apiRequest<{ total: number }>('/consignments?take=1', { method: 'GET' }, authToken);
        setConsignmentCount(typeof page?.total === 'number' ? page.total : null);
      }
      if (hasPermission(nextProfile, 'customer.read')) {
        const [customerPage, resellerPage] = await Promise.all([
          apiRequest<{ total: number }>('/customers?take=1', { method: 'GET' }, authToken),
          apiRequest<{ total: number }>('/resellers?take=1', { method: 'GET' }, authToken),
        ]);
        setCustomerCount(typeof customerPage?.total === 'number' ? customerPage.total : null);
        setResellerCount(typeof resellerPage?.total === 'number' ? resellerPage.total : null);
      }
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
  }, [setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await apiRequest<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      });
      window.localStorage.setItem(TOKEN_KEY, response.access_token);
      setToken(response.access_token);
      notifications.success('Signed in.');
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSubmitting(false);
    }
  }

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || (token && loading)) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading...</article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72, paddingBottom: 72 }}>
            <article className="portal-card" style={{ maxWidth: 440, margin: '0 auto' }}>
              <h2 style={{ marginTop: 0 }}>Staff Sign In</h2>
              <p className="portal-muted">Drip Emporium operations portal.</p>
              {errorMessage ? <p className="portal-error">{errorMessage}</p> : null}
              <form className="portal-auth-form" onSubmit={onLogin}>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    autoComplete="username"
                    value={loginForm.email}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Password</span>
                  <PasswordInput
                    autoComplete="current-password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                    required
                  />
                </label>
                <button type="submit" className="portal-primary-btn" disabled={submitting}>
                  {submitting ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  // Only a card whose permission the signed-in role actually has: a link to a
  // page that would 403 on arrival is worse than no card at all.
  const navCards: NavCard[] = [
    hasPermission(profile, 'order.read')
      ? { key: 'orders', label: 'Orders', href: '/portal/orders', count: summary?.orderCount ?? null, icon: NAV_ICONS.orders }
      : null,
    hasPermission(profile, 'consignment.read')
      ? { key: 'consignments', label: 'Consignments', href: '/portal/consignments', count: consignmentCount, icon: NAV_ICONS.consignments }
      : null,
    hasPermission(profile, 'customer.read')
      ? { key: 'resellers', label: 'Resellers', href: '/portal/resellers', count: resellerCount, icon: NAV_ICONS.resellers }
      : null,
    hasPermission(profile, 'customer.read')
      ? { key: 'customers', label: 'Customers', href: '/portal/customers', count: customerCount, icon: NAV_ICONS.customers }
      : null,
  ].filter((card): card is NavCard => card !== null);

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="dashboard"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Dashboard"
            pageSubtitle="Today at Drip Emporium."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={onLogout}
            onRefresh={() => token && void load(token)}
          >
            {navCards.length > 0 ? (
              <div className="portal-nav-card-grid">
                {navCards.map((card) => (
                  <Link key={card.key} href={card.href} className="portal-nav-card">
                    <span className="portal-nav-card-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        {card.icon}
                      </svg>
                    </span>
                    <span className="portal-nav-card-body">
                      <strong>{card.count === null ? '—' : card.count.toLocaleString('en-KE')}</strong>
                      <span>{card.label}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}

            {summary ? (
              <div className="portal-stat-grid">
                <article className="portal-stat-card">
                  <p>Orders</p>
                  <h3>{summary.orderCount}</h3>
                  <span className="portal-stat-note">confirmed sales only</span>
                </article>
                <article className="portal-stat-card">
                  <p>Revenue</p>
                  <h3>{formatMoney(summary.revenue)}</h3>
                  <span className="portal-stat-note">
                    {formatMoney(summary.averageOrderValue)} average order
                  </span>
                </article>
                <article className="portal-stat-card">
                  <p>Collected</p>
                  <h3>{formatMoney(summary.collected)}</h3>
                </article>
                <article className="portal-stat-card">
                  <p>Outstanding</p>
                  <h3>{formatMoney(summary.outstanding)}</h3>
                  <span className="portal-stat-note">owed on part-paid orders</span>
                </article>
                <article className="portal-stat-card">
                  <p>Unconfirmed</p>
                  <h3>{summary.unconfirmed.count}</h3>
                  <span className="portal-stat-note">
                    {formatMoney(summary.unconfirmed.value)} not yet paid — excluded above
                  </span>
                </article>
              </div>
            ) : null}

            {Array.isArray(lowStock) && lowStock.length > 0 ? (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Running Low</h2>
                    <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                      At or below the reorder level. Restock before these sell out.
                    </p>
                  </div>
                  <Link href="/portal/inventory" className="portal-inline-btn">
                    Inventory
                  </Link>
                </div>
                <div className="portal-list-stack">
                  {lowStock.slice(0, 8).map((row) => (
                    <div key={`${row.variant.id}-${row.store.id}`} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>
                            {row.variant.product.name} — {row.variant.name}
                          </strong>
                          <p className="portal-muted">
                            {row.variant.sku} · {row.store.name}
                          </p>
                        </div>
                        <span>{row.sellable} left</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            <article className="portal-card">
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Recent Orders</h2>
                </div>
                <Link href="/portal/orders" className="portal-inline-btn">
                  All Orders
                </Link>
              </div>
              <div className="portal-list-stack">
                {!Array.isArray(recentOrders) || recentOrders.length === 0 ? (
                  <div className="portal-empty-state">No orders yet.</div>
                ) : (
                  recentOrders.map((order) => (
                    <div key={order.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{order.orderNumber}</strong>
                          <p className="portal-muted">
                            {order.customerName || 'Walk-in'} · {order.store.name} ·{' '}
                            {new Date(order.placedAt).toLocaleDateString('en-GB')}
                          </p>
                        </div>
                        <span>{order.status}</span>
                        <span>{formatMoney(order.total)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
