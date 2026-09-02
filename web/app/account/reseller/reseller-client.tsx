"use client";

/**
 * A reseller's own view of what their referral link has earned: orders it
 * brought in and the commission accrued/paid against each. Referred
 * customers are shown by first name only -- customer-portal.service.ts's
 * myReferrals() redacts the rest server-side, so there is nothing more
 * specific to leak here even by accident.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EliteLayout } from '../../components/elite-layout';
import { customerApi, useCustomerAuth } from '../../lib/customer-auth';
import { formatKes } from '../../lib/shop';

// Unlike shop.ts's formatKes (built for a product price, where 0 or less
// means "no real price yet" and should read as "Price on request"), a
// commission figure of exactly 0 is a real, meaningful answer -- "nothing
// earned yet" -- and must display as such rather than being mistaken for a
// missing price.
function formatKesAmount(value: number) {
  return `KSh ${Math.round(value).toLocaleString('en-KE')}`;
}

type ReferralOrder = {
  orderNumber: string;
  placedAt: string;
  status: string;
  total: number;
  referredCustomerFirstName: string | null;
  commissionAmount: number;
  commissionStatus: 'ACCRUED' | 'PAID' | 'CANCELLED' | null;
};

type Referrals = {
  summary: {
    totalClicks: number;
    referredOrders: number;
    conversionRate: number | null;
    accruedBalance: number;
    paidOutTotal: number;
  };
  orders: ReferralOrder[];
};

function formatConversionRate(rate: number | null) {
  if (rate === null) return '—';
  return `${(rate * 100).toLocaleString('en-KE', { maximumFractionDigits: 1 })}%`;
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function commissionChipClass(status: ReferralOrder['commissionStatus']) {
  if (status === 'PAID') return 'de-commission-chip is-paid';
  if (status === 'CANCELLED') return 'de-commission-chip is-cancelled';
  return 'de-commission-chip is-accrued';
}

export function ResellerDashboardClient() {
  const auth = useCustomerAuth();
  const router = useRouter();
  const [data, setData] = useState<Referrals | null>(null);

  useEffect(() => {
    if (auth.ready && !auth.customer) router.replace('/account/login');
  }, [auth.ready, auth.customer, router]);

  const load = useCallback(async () => {
    if (!auth.token) return;
    try {
      setData(await customerApi<Referrals>('/customer-portal/referrals', { method: 'GET' }, auth.token));
    } catch {
      setData({
        summary: { totalClicks: 0, referredOrders: 0, conversionRate: null, accruedBalance: 0, paidOutTotal: 0 },
        orders: [],
      });
    }
  }, [auth.token]);

  useEffect(() => { void load(); }, [load]);

  if (!auth.ready || !auth.customer) {
    return (
      <EliteLayout active="none">
        <main className="lp-main-content de-shop">
          <section className="lp-container de-auth"><div className="de-auth-card"><h1>Loading…</h1></div></section>
        </main>
      </EliteLayout>
    );
  }

  return (
    <EliteLayout active="none">
      <main className="lp-main-content de-shop">
        <section className="lp-container de-shop-head">
          <p style={{ margin: '0 0 10px' }}><Link href="/account">← Back to your account</Link></p>
          <h1>Your referrals</h1>
        </section>

        <section className="lp-container">
          <div className="de-stat-grid">
            <div className="de-stat-card">
              <span>Link clicks</span>
              <strong>{data?.summary.totalClicks ?? 0}</strong>
            </div>
            <div className="de-stat-card">
              <span>Referred orders</span>
              <strong>{data?.summary.referredOrders ?? 0}</strong>
              {data?.summary.totalClicks ? (
                <span style={{ marginTop: 6, marginBottom: 0 }}>
                  {formatConversionRate(data.summary.conversionRate)} of clicks
                </span>
              ) : null}
            </div>
            <div className="de-stat-card">
              <span>Accrued balance</span>
              <strong>{formatKesAmount(data?.summary.accruedBalance ?? 0)}</strong>
            </div>
            <div className="de-stat-card is-highlight">
              <span>Paid out to date</span>
              <strong>{formatKesAmount(data?.summary.paidOutTotal ?? 0)}</strong>
            </div>
          </div>
        </section>

        <section className="lp-container de-account">
          <div className="de-account-main">
            <h2>Referred orders</h2>
            {data === null ? (
              <p className="de-auth-intro">Loading…</p>
            ) : data.orders.length === 0 ? (
              <div className="de-empty">
                <p>No one has ordered through your link yet.</p>
                <Link href="/account" className="lp-button lp-button-primary">Back to your account</Link>
              </div>
            ) : (
              data.orders.map((order) => (
                <article key={order.orderNumber} className="de-account-order">
                  <header>
                    <div>
                      <strong>{order.orderNumber}</strong>
                      <span className="de-account-date">{formatDay(order.placedAt)}</span>
                    </div>
                    <span className="de-account-status">{order.status}</span>
                  </header>
                  <ul>
                    <li>
                      <span>Referred customer: {order.referredCustomerFirstName || 'Guest'}</span>
                      <em>{formatKes(order.total)}</em>
                    </li>
                  </ul>
                  <footer>
                    <span className={commissionChipClass(order.commissionStatus)}>
                      {order.commissionStatus ? order.commissionStatus.toLowerCase() : 'no commission'}
                    </span>
                    <strong>{formatKesAmount(order.commissionAmount)}</strong>
                  </footer>
                </article>
              ))
            )}
          </div>

          <aside className="de-account-side">
            <div className="de-checkout-panel">
              <h2>About payouts</h2>
              <p className="de-checkout-note">
                Payouts are arranged by staff once your accrued balance is ready to release. There's nothing you
                need to do here — check back to see it move to "paid out."
              </p>
            </div>
          </aside>
        </section>
      </main>
    </EliteLayout>
  );
}
