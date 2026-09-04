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
import { TrendChart } from '../../portal/analytics/charts';

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

/** A purchase this reseller made for themselves -- distinct from a
 *  ReferralOrder, which is someone else's order their link brought in. */
type OwnOrder = {
  orderNumber: string;
  placedAt: string;
  status: string;
  total: number;
};

type Referrals = {
  summary: {
    totalClicks: number;
    referredOrders: number;
    conversionRate: number | null;
    accruedBalance: number;
    paidOutTotal: number;
    totalWhatsappClicks: number;
    whatsappLeads: number;
    ownOrders: number;
    ownRevenue: number;
  };
  orders: ReferralOrder[];
  ownOrders: OwnOrder[];
};

type ReferralSeries = {
  clicks: Array<{ date: string; count: number }>;
  orders: Array<{ date: string; count: number }>;
  whatsappLeads: Array<{ date: string; count: number }>;
};

/** "20 Aug", matching the staff portal's own trend axis labels. */
function shortDayLabel(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

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
  const [series, setSeries] = useState<ReferralSeries | null>(null);

  useEffect(() => {
    if (auth.ready && !auth.customer) router.replace('/account/login');
  }, [auth.ready, auth.customer, router]);

  const load = useCallback(async () => {
    if (!auth.token) return;
    try {
      const [nextData, nextSeries] = await Promise.all([
        customerApi<Referrals>('/customer-portal/referrals', { method: 'GET' }, auth.token),
        customerApi<ReferralSeries>('/customer-portal/referrals/series', { method: 'GET' }, auth.token).catch(() => null),
      ]);
      setData(nextData);
      setSeries(nextSeries);
    } catch {
      setData({
        summary: {
          totalClicks: 0, referredOrders: 0, conversionRate: null, accruedBalance: 0, paidOutTotal: 0,
          totalWhatsappClicks: 0, whatsappLeads: 0, ownOrders: 0, ownRevenue: 0,
        },
        orders: [],
        ownOrders: [],
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
          <h1>Your affiliate dashboard</h1>
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
            <div className="de-stat-card">
              <span>WhatsApp taps</span>
              <strong>{data?.summary.totalWhatsappClicks ?? 0}</strong>
            </div>
            <div className="de-stat-card">
              <span>WhatsApp leads</span>
              <strong>{data?.summary.whatsappLeads ?? 0}</strong>
              <span style={{ marginTop: 6, marginBottom: 0 }}>shoppers who tapped through and left their details</span>
            </div>
            <div className="de-stat-card">
              <span>Your own orders</span>
              <strong>{data?.summary.ownOrders ?? 0}</strong>
            </div>
            <div className="de-stat-card">
              <span>Your own spend</span>
              <strong>{formatKesAmount(data?.summary.ownRevenue ?? 0)}</strong>
            </div>
          </div>
        </section>

        {series ? (
          <section className="lp-container">
            <div className="de-checkout-panel">
              <h2>Your link, last 30 days</h2>
              <p className="de-checkout-note" style={{ marginTop: 0 }}>
                Most orders here close through a WhatsApp chat, not the website checkout -- this is why both are
                tracked.
              </p>
              <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem' }}>Link clicks</h3>
                  <TrendChart
                    data={series.clicks.map((point) => ({ label: shortDayLabel(point.date), value: point.count }))}
                    valueFormat={(value) => `${value}`}
                  />
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem' }}>Referred orders</h3>
                  <TrendChart
                    data={series.orders.map((point) => ({ label: shortDayLabel(point.date), value: point.count }))}
                    valueFormat={(value) => `${value}`}
                    color="var(--chart-cat-2)"
                  />
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem' }}>WhatsApp leads</h3>
                  <TrendChart
                    data={series.whatsappLeads.map((point) => ({ label: shortDayLabel(point.date), value: point.count }))}
                    valueFormat={(value) => `${value}`}
                    color="var(--chart-cat-3)"
                  />
                </div>
              </div>
            </div>
          </section>
        ) : null}

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

            <h2 style={{ marginTop: 32 }}>Your own orders</h2>
            <p className="de-checkout-note" style={{ marginTop: 0 }}>
              Purchases you made for yourself, separate from the sales your referral link brought in above.
            </p>
            {data === null ? (
              <p className="de-auth-intro">Loading…</p>
            ) : data.ownOrders.length === 0 ? (
              <div className="de-empty">
                <p>You haven't placed an order of your own yet.</p>
              </div>
            ) : (
              data.ownOrders.map((order) => (
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
                      <span>Total</span>
                      <em>{formatKes(order.total)}</em>
                    </li>
                  </ul>
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
