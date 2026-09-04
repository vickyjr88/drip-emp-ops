"use client";

/**
 * One reseller, in full: what they have bought themselves, what their
 * referral link has sold, and how the link has performed day to day.
 *
 * Own purchases and referred orders are kept apart throughout -- they
 * answer two different questions ("are they also a customer?" and "is
 * their link working?") that a merged list would blur together, and the
 * backend's own performance() response already keeps them separate.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { ListThumb } from '../../components/list-thumb';
import { useErrorState } from '../../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../../accounting/lib';
import { ChartFrame, TrendChart } from '../../analytics/charts';

type Reseller = {
  id: string; code: string; name: string; businessName?: string | null;
  firstName: string; lastName: string; priceTier: string;
};

type OrderRow = { id: string; orderNumber: string; placedAt: string; status: string; total: number; customerName?: string | null };
type WhatsAppLeadRow = {
  id: string; status: string; customerName?: string | null; total: number; createdAt: string;
  orderId?: string | null; firstLineImageUrl?: string | null;
};

type Performance = {
  reseller: Reseller;
  summary: {
    ownOrders: number; ownRevenue: number;
    totalClicks: number; referredOrders: number; confirmedReferredOrders: number; referredRevenue: number;
    conversionRate: number | null;
    totalWhatsappClicks: number; whatsappLeads: number; convertedWhatsappLeads: number;
    accruedCommission: number; paidCommission: number;
  };
  ownOrders: OrderRow[];
  referredOrders: OrderRow[];
  whatsappLeads: WhatsAppLeadRow[];
};

type Series = {
  clicks: Array<{ date: string; count: number }>;
  orders: Array<{ date: string; count: number }>;
  whatsappLeads: Array<{ date: string; count: number }>;
};

function formatConversionRate(rate: number | null) {
  if (rate === null) return '—';
  return `${(rate * 100).toLocaleString('en-KE', { maximumFractionDigits: 1 })}%`;
}

/** "20 Aug", matching the analytics page's own trend axis labels. */
function shortDayLabel(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function OrderList({ orders, emptyLabel }: { orders: OrderRow[]; emptyLabel: string }) {
  if (orders.length === 0) return <div className="portal-empty-state">{emptyLabel}</div>;
  return (
    <div className="portal-list-stack">
      {orders.map((order) => (
        <div key={order.id} className="portal-record">
          <div className="portal-list-row">
            <div>
              <strong>{order.orderNumber}</strong>
              <span className="portal-chip" style={{ marginLeft: 8 }}>{order.status}</span>
              <p className="portal-muted">
                {order.customerName || 'Walk-in'} · {formatDateTime(order.placedAt)}
              </p>
            </div>
            <div className="portal-action-row">
              <span>{formatMoney(order.total)}</span>
              <Link href={`/portal/orders/${order.id}`} className="portal-inline-btn">Open</Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ResellerDetailClient({ resellerId }: { resellerId: string }) {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      const [nextPerformance, nextSeries] = await Promise.all([
        apiRequest<Performance>(`/resellers/${resellerId}/performance`, { method: 'GET' }, authToken),
        apiRequest<Series>(`/resellers/${resellerId}/series`, { method: 'GET' }, authToken),
      ]);
      setPerformance(nextPerformance);
      setSeries(nextSeries);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
  }, [resellerId, setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void load(token);
  }, [initialized, token, load]);

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading reseller...</article>
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

  if (!performance) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main is-authenticated">
          <section className="lp-container portal-auth-section">
            <PortalShell
              active="resellers"
              tourUserId={profile.id}
              tourPermissions={profile.permissions || []}
              tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
              pageTitle="Reseller not found"
              email={profile.email}
              roleLabel={roleLabelFor(profile)}
              permissionCount={profile.permissions?.length || 0}
              canReadRbac={canReadRbacFor(profile)}
              canReadUsers={hasPermission(profile, 'user.read')}
              onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
              onRefresh={() => token && void load(token)}
            >
              {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}
              <Link href="/portal/resellers" className="portal-inline-btn">Back to Resellers</Link>
            </PortalShell>
          </section>
        </main>
      </EliteLayout>
    );
  }

  const { reseller, summary } = performance;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="resellers"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle={reseller.name}
            pageSubtitle={`${reseller.code} · ${reseller.priceTier.toLowerCase()} pricing`}
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <Link href="/portal/resellers" className="portal-inline-btn" style={{ marginBottom: 12, display: 'inline-flex', width: 'fit-content' }}>
              ← All resellers
            </Link>

            <div className="portal-stat-grid">
              <div className="portal-stat"><span>Their own orders</span><h3>{summary.ownOrders}</h3></div>
              <div className="portal-stat"><span>Their own spend</span><h3>{formatMoney(summary.ownRevenue)}</h3></div>
              <div className="portal-stat"><span>Referral link clicks</span><h3>{summary.totalClicks}</h3></div>
              <div className="portal-stat"><span>Orders they referred</span><h3>{summary.referredOrders}</h3></div>
              <div className="portal-stat">
                <span>Click → order rate</span>
                <h3>{formatConversionRate(summary.conversionRate)}</h3>
              </div>
              <div className="portal-stat"><span>Referred revenue</span><h3>{formatMoney(summary.referredRevenue)}</h3></div>
              <div className="portal-stat"><span>WhatsApp taps</span><h3>{summary.totalWhatsappClicks}</h3></div>
              <div className="portal-stat">
                <span>WhatsApp leads</span>
                <h3>{summary.whatsappLeads}</h3>
                <span className="portal-stat-note">{summary.convertedWhatsappLeads} confirmed as sales</span>
              </div>
              <div className="portal-stat">
                <span>Commission</span>
                <h3>{formatMoney(summary.accruedCommission)}</h3>
                <span className="portal-stat-note">accrued, unpaid · {formatMoney(summary.paidCommission)} paid to date</span>
              </div>
            </div>

            {series ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Referral link, last 30 days</h2>
                <div className="portal-detail-grid">
                  <ChartFrame title="Link clicks" subtitle="Landings on this reseller's shared link, per day.">
                    <TrendChart
                      data={series.clicks.map((point) => ({ label: shortDayLabel(point.date), value: point.count }))}
                      valueFormat={(value) => `${value}`}
                    />
                  </ChartFrame>
                  <ChartFrame title="Referred orders" subtitle="Checkout orders their link attributed, per day.">
                    <TrendChart
                      data={series.orders.map((point) => ({ label: shortDayLabel(point.date), value: point.count }))}
                      valueFormat={(value) => `${value}`}
                      color="var(--chart-cat-2)"
                    />
                  </ChartFrame>
                  <ChartFrame title="WhatsApp leads" subtitle="Shoppers who tapped through and left contact details, per day.">
                    <TrendChart
                      data={series.whatsappLeads.map((point) => ({ label: shortDayLabel(point.date), value: point.count }))}
                      valueFormat={(value) => `${value}`}
                      color="var(--chart-cat-3)"
                    />
                  </ChartFrame>
                </div>
              </article>
            ) : null}

            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>Orders attributed to their referral link</h2>
              <OrderList orders={performance.referredOrders} emptyLabel="No orders attributed to this reseller's link yet." />
            </article>

            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>Their own orders</h2>
              <p className="portal-muted" style={{ marginTop: 0 }}>Purchases this reseller made for themselves, not referred sales.</p>
              <OrderList orders={performance.ownOrders} emptyLabel="This reseller hasn't placed an order of their own yet." />
            </article>

            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>WhatsApp leads</h2>
              <p className="portal-muted" style={{ marginTop: 0 }}>
                Shoppers who tapped a WhatsApp link while this reseller's referral was attributed and left their details.
              </p>
              <div className="portal-list-stack">
                {performance.whatsappLeads.length === 0 ? (
                  <div className="portal-empty-state">No WhatsApp leads attributed to this reseller yet.</div>
                ) : (
                  performance.whatsappLeads.map((lead) => (
                    <div key={lead.id} className="portal-record">
                      <div className="portal-list-row has-thumb">
                        <ListThumb sources={[lead.firstLineImageUrl]} label={lead.customerName || '?'} />
                        <div>
                          <strong>{lead.customerName || 'Unnamed'}</strong>
                          <span className="portal-chip" style={{ marginLeft: 8 }}>{lead.status}</span>
                          <p className="portal-muted">{formatDateTime(lead.createdAt)}</p>
                        </div>
                        <div className="portal-action-row">
                          <span>{formatMoney(lead.total)}</span>
                          {lead.orderId ? (
                            <Link href={`/portal/orders/${lead.orderId}`} className="portal-inline-btn">View order</Link>
                          ) : (
                            <Link href="/portal/cart-leads/history" className="portal-inline-btn">View lead</Link>
                          )}
                        </div>
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
