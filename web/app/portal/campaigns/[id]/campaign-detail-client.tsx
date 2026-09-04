"use client";

/**
 * One campaign, in full: the funnel the list page's row can only summarise
 * in a line of text, plus how it has moved day to day. Two lines matter
 * here, not one -- online-checkout orders and WhatsApp leads are separate
 * funnels for this shop (most real sales close in the chat, not at
 * checkout), so each gets its own trend rather than being folded together.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { useErrorState } from '../../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../../accounting/lib';
import { ChartFrame, TrendChart } from '../../analytics/charts';

type Campaign = { id: string; code: string; name: string; isActive: boolean; createdAt: string };

type OrderRow = { id: string; orderNumber: string; placedAt: string; status: string; total: number; customerName?: string | null };
type WhatsAppLeadRow = { id: string; status: string; customerName?: string | null; total: number; createdAt: string; orderId?: string | null };

type Performance = {
  campaign: Campaign;
  summary: {
    totalClicks: number; referredOrders: number; confirmedOrders: number; revenue: number; conversionRate: number | null;
    totalWhatsappClicks: number; whatsappLeads: number; convertedWhatsappLeads: number;
  };
  orders: OrderRow[];
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

export default function CampaignDetailClient({ campaignId }: { campaignId: string }) {
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
        apiRequest<Performance>(`/campaigns/${campaignId}/performance`, { method: 'GET' }, authToken),
        apiRequest<Series>(`/campaigns/${campaignId}/series`, { method: 'GET' }, authToken),
      ]);
      setPerformance(nextPerformance);
      setSeries(nextSeries);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
  }, [campaignId, setErrorMessage]);

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
            <article className="portal-card portal-loading">Loading campaign...</article>
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
              active="campaigns"
              tourUserId={profile.id}
              tourPermissions={profile.permissions || []}
              tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
              pageTitle="Campaign not found"
              email={profile.email}
              roleLabel={roleLabelFor(profile)}
              permissionCount={profile.permissions?.length || 0}
              canReadRbac={canReadRbacFor(profile)}
              canReadUsers={hasPermission(profile, 'user.read')}
              onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
              onRefresh={() => token && void load(token)}
            >
              {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}
              <Link href="/portal/campaigns" className="portal-inline-btn">Back to Campaigns</Link>
            </PortalShell>
          </section>
        </main>
      </EliteLayout>
    );
  }

  const { campaign, summary } = performance;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="campaigns"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle={campaign.name}
            pageSubtitle={`${campaign.code} · ${campaign.isActive ? 'Active' : 'Inactive'} · created ${formatDateTime(campaign.createdAt)}`}
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <Link href="/portal/campaigns" className="portal-inline-btn" style={{ marginBottom: 12, display: 'inline-flex', width: 'fit-content' }}>
              ← All campaigns
            </Link>

            <div className="portal-stat-grid">
              <div className="portal-stat"><span>Link clicks</span><h3>{summary.totalClicks}</h3></div>
              <div className="portal-stat"><span>Online orders</span><h3>{summary.referredOrders}</h3></div>
              <div className="portal-stat">
                <span>Click → order rate</span>
                <h3>{formatConversionRate(summary.conversionRate)}</h3>
              </div>
              <div className="portal-stat"><span>Online revenue</span><h3>{formatMoney(summary.revenue)}</h3></div>
              <div className="portal-stat"><span>WhatsApp taps</span><h3>{summary.totalWhatsappClicks}</h3></div>
              <div className="portal-stat">
                <span>WhatsApp leads</span>
                <h3>{summary.whatsappLeads}</h3>
                <span className="portal-stat-note">{summary.convertedWhatsappLeads} confirmed as sales</span>
              </div>
            </div>

            {series ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Last 30 days</h2>
                <div className="portal-detail-grid">
                  <ChartFrame title="Link clicks" subtitle="Landings on this campaign's shared link, per day.">
                    <TrendChart
                      data={series.clicks.map((point) => ({ label: shortDayLabel(point.date), value: point.count }))}
                      valueFormat={(value) => `${value}`}
                    />
                  </ChartFrame>
                  <ChartFrame title="Online orders" subtitle="Checkout orders attributed to this campaign, per day.">
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
              <h2 style={{ marginTop: 0 }}>Online orders</h2>
              <div className="portal-list-stack">
                {performance.orders.length === 0 ? (
                  <div className="portal-empty-state">No orders attributed to this campaign yet.</div>
                ) : (
                  performance.orders.map((order) => (
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
                  ))
                )}
              </div>
            </article>

            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>WhatsApp leads</h2>
              <p className="portal-muted" style={{ marginTop: 0 }}>
                Shoppers who tapped a WhatsApp link while this campaign was attributed and left their details.
              </p>
              <div className="portal-list-stack">
                {performance.whatsappLeads.length === 0 ? (
                  <div className="portal-empty-state">No WhatsApp leads attributed to this campaign yet.</div>
                ) : (
                  performance.whatsappLeads.map((lead) => (
                    <div key={lead.id} className="portal-record">
                      <div className="portal-list-row">
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
