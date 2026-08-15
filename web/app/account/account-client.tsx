"use client";

/**
 * The customer's own area: their orders, their details, their password.
 *
 * Orders come from /customer-portal/orders, which reads the customer id from
 * the verified token rather than the URL, so one customer cannot fetch
 * another's history by editing an id.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EliteLayout } from '../components/elite-layout';
import { customerApi, useCustomerAuth } from '../lib/customer-auth';
import { formatKes } from '../lib/shop';

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  placedAt: string;
  total: number;
  amountPaid: number;
  shippingAddress?: string | null;
  store?: { name: string; location?: string | null } | null;
  lines: Array<{ description: string; quantity: number; lineTotal: number }>;
};

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function AccountClient() {
  const auth = useCustomerAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwState, setPwState] = useState<{ error?: string; done?: boolean; busy?: boolean }>({});

  useEffect(() => {
    if (auth.ready && !auth.customer) router.replace('/account/login');
  }, [auth.ready, auth.customer, router]);

  const loadOrders = useCallback(async () => {
    if (!auth.token) return;
    try {
      setOrders(await customerApi<Order[]>('/customer-portal/orders', { method: 'GET' }, auth.token));
    } catch {
      setOrders([]);
    }
  }, [auth.token]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setPwState({ busy: true });
    try {
      await customerApi('/customer-portal/change-password', {
        method: 'POST',
        body: JSON.stringify(pw),
      }, auth.token);
      setPw({ currentPassword: '', newPassword: '' });
      setPwState({ done: true });
    } catch (caught) {
      setPwState({ error: caught instanceof Error ? caught.message : 'Could not change your password.' });
    }
  }

  if (!auth.ready || !auth.customer) {
    return (
      <EliteLayout active="none">
        <main className="lp-main-content de-shop">
          <section className="lp-container de-auth"><div className="de-auth-card"><h1>Loading…</h1></div></section>
        </main>
      </EliteLayout>
    );
  }

  const customer = auth.customer;
  const isTrade = customer.priceTier && customer.priceTier !== 'RETAIL';

  return (
    <EliteLayout active="none">
      <main className="lp-main-content de-shop">
        <section className="lp-container de-shop-head">
          <h1>Hello, {customer.firstName}</h1>
          <p>{customer.email}</p>
        </section>

        <section className="lp-container de-account">
          <div className="de-account-main">
            <h2>Your orders</h2>
            {orders === null ? (
              <p className="de-auth-intro">Loading your orders…</p>
            ) : orders.length === 0 ? (
              <div className="de-empty">
                <p>No orders yet.</p>
                <Link href="/shop" className="lp-button lp-button-primary">Shop Shoes</Link>
              </div>
            ) : (
              orders.map((order) => {
                const owing = order.total - order.amountPaid;
                return (
                  <article key={order.id} className="de-account-order">
                    <header>
                      <div>
                        <strong>{order.orderNumber}</strong>
                        <span className="de-account-date">{formatDay(order.placedAt)}</span>
                      </div>
                      <span className="de-account-status">{order.status}</span>
                    </header>
                    <ul>
                      {order.lines.map((line, index) => (
                        <li key={index}>
                          <span>{line.quantity} × {line.description}</span>
                          <em>{formatKes(line.lineTotal)}</em>
                        </li>
                      ))}
                    </ul>
                    <footer>
                      <span>
                        {order.shippingAddress
                          ? `Delivering to ${order.shippingAddress}`
                          : `Collect at ${order.store?.name || 'the shop'}`}
                      </span>
                      <strong>
                        {formatKes(order.total)}
                        {owing > 0.001 ? ` · ${formatKes(owing)} owing` : ''}
                      </strong>
                    </footer>
                  </article>
                );
              })
            )}
          </div>

          <aside className="de-account-side">
            <div className="de-checkout-panel">
              <h2>Your details</h2>
              <dl className="de-summary">
                <div><dt>Name</dt><dd>{customer.firstName} {customer.lastName}</dd></div>
                <div><dt>Email</dt><dd>{customer.email}</dd></div>
                <div><dt>Phone</dt><dd>{customer.phone}</dd></div>
                {/* Trade customers see the price list they buy on, so a
                    wholesale shop knows the prices they are quoted are theirs. */}
                {isTrade ? (
                  <div><dt>Price list</dt><dd>{customer.priceTier}</dd></div>
                ) : null}
              </dl>
              <p className="de-checkout-note">
                Need a detail changed? Message us on WhatsApp and we will update it.
              </p>
            </div>

            <div className="de-checkout-panel">
              <h2>Change password</h2>
              {pwState.error ? <p className="de-checkout-error" role="alert">{pwState.error}</p> : null}
              {pwState.done ? <p className="de-auth-notice" role="status">Password changed.</p> : null}
              <form className="de-checkout-form" onSubmit={onChangePassword}>
                <label>
                  <span>Current password</span>
                  <input type="password" required autoComplete="current-password"
                    value={pw.currentPassword}
                    onChange={(event) => setPw((p) => ({ ...p, currentPassword: event.target.value }))} />
                </label>
                <label>
                  <span>New password</span>
                  <input type="password" required minLength={8} autoComplete="new-password"
                    value={pw.newPassword}
                    onChange={(event) => setPw((p) => ({ ...p, newPassword: event.target.value }))} />
                </label>
                <button type="submit" className="lp-button lp-button-primary" disabled={pwState.busy}>
                  {pwState.busy ? 'Saving…' : 'Change password'}
                </button>
              </form>
            </div>

            <button
              type="button"
              className="lp-button lp-button-ghost de-account-signout"
              onClick={() => { auth.logout(); router.replace('/'); }}
            >
              Sign out
            </button>
          </aside>
        </section>
      </main>
    </EliteLayout>
  );
}
