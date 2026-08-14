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
        setSummary(sales);
        setRecentOrders(Array.isArray(orders) ? orders : orders.items || []);
      }
      if (hasPermission(nextProfile, 'stock-level.read')) {
        setLowStock(
          await apiRequest<StockRow[]>('/inventory/levels?lowOnly=true', { method: 'GET' }, authToken),
        );
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
            {summary ? (
              <div className="portal-stat-grid">
                <article className="portal-stat-card">
                  <p>Orders</p>
                  <h3>{summary.orderCount}</h3>
                  <span className="portal-stat-note">excludes cancelled and refunded</span>
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
              </div>
            ) : null}

            {lowStock.length > 0 ? (
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
                {recentOrders.length === 0 ? (
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
