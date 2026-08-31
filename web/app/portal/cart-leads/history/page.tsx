"use client";

/**
 * What happened to every dismissed or converted cart lead.
 *
 * The working Cart Leads list on /portal/orders only ever shows what's still
 * outstanding (NEW/CONTACTED) -- once a lead is dismissed or turned into a
 * real order it drops off that list entirely, which is right for a worklist
 * but leaves no way to look back. This is that look-back: the same records,
 * kept rather than deleted, filterable by how each one was resolved.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { ListThumb } from '../../components/list-thumb';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../../components/server-pager';
import { useErrorState } from '../../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDate, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../../accounting/lib';

type CartLeadLine = { variantId: string; sku: string; name: string; size: string; quantity: number; priceKes: number };
type CartLead = {
  id: string;
  source: 'WHATSAPP_ORDER' | 'ABANDONED_CART';
  status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'EXPIRED';
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  lines: CartLeadLine[];
  total: string | number;
  lastActivityAt: string;
  createdAt: string;
  firstLineImageUrl?: string | null;
  order?: { id: string; orderNumber: string } | null;
};

const HISTORY_STATUSES: Array<CartLead['status']> = ['EXPIRED', 'CONVERTED'];

function statusChipClass(status: CartLead['status']) {
  return status === 'CONVERTED' ? 'portal-chip' : 'portal-chip is-muted';
}

export default function CartLeadHistoryPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [errorMessage, setErrorMessage] = useErrorState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      setProfile(await loadProfile(authToken));
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

  const fetchPage = useCallback(
    async (params: { skip: number; take: number; search: string; status?: string; source?: string }): Promise<ServerPage<CartLead>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      if (params.source) query.set('source', params.source);
      // No status picked means "the full history" -- both resolved statuses,
      // never the outstanding ones the live worklist already owns.
      if (params.status) query.set('status', params.status);
      else query.set('outstanding', 'false');
      return apiRequest<ServerPage<CartLead>>(`/cart-leads?${query}`, { method: 'GET' }, token);
    },
    [token],
  );

  const pager = useServerPager<CartLead, { status?: string; source?: string }>({
    fetchPage: (params) => fetchPage(params),
    filters: { status: statusFilter || undefined, source: sourceFilter || undefined },
    enabled: Boolean(token),
  });

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading cart lead history...</article>
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
            pageTitle="Cart Lead History"
            pageSubtitle="Every dismissed or converted cart lead -- the outstanding ones live on the Orders page."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <Link href="/portal/orders" className="portal-ghost-btn">
                ← Back to Orders
              </Link>
            </div>

            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>History</h2>

              <div className="list-toolbar">
                <ServerListSearch pager={pager} placeholder="Search name, phone or email…" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">Dismissed & converted</option>
                  {HISTORY_STATUSES.map((status) => (
                    <option key={status} value={status}>{status === 'CONVERTED' ? 'Converted' : 'Dismissed'}</option>
                  ))}
                </select>
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  <option value="">All sources</option>
                  <option value="WHATSAPP_ORDER">WhatsApp order</option>
                  <option value="ABANDONED_CART">Abandoned cart</option>
                </select>
              </div>

              <div className="portal-list-stack">
                {!pager.loading && pager.items.length === 0 ? (
                  <div className="portal-empty-state">
                    {pager.search || statusFilter || sourceFilter ? 'No leads match.' : 'Nothing dismissed or converted yet.'}
                  </div>
                ) : (
                  pager.items.map((lead) => (
                    <div key={lead.id} className="portal-record">
                      <div className="portal-list-row has-thumb">
                        <ListThumb sources={[lead.firstLineImageUrl]} label={lead.lines[0]?.name || lead.customerName || '?'} />
                        <div>
                          <strong>{lead.customerName || lead.customerPhone || lead.customerEmail}</strong>
                          <span className={statusChipClass(lead.status)} style={{ marginLeft: 8 }}>
                            {lead.status === 'CONVERTED' ? 'Converted' : 'Dismissed'}
                          </span>
                          <span className="portal-chip is-muted" style={{ marginLeft: 8 }}>
                            {lead.source === 'WHATSAPP_ORDER' ? 'WhatsApp' : 'Abandoned cart'}
                          </span>
                          <p className="portal-muted">
                            {lead.customerPhone || lead.customerEmail || 'No contact on file'} ·{' '}
                            {lead.lines.length} item{lead.lines.length === 1 ? '' : 's'} · {formatDate(lead.lastActivityAt)}
                          </p>
                          <p>{formatMoney(lead.total)}</p>
                        </div>
                        <div className="portal-action-row">
                          {lead.order ? (
                            <Link href={`/portal/orders/${lead.order.id}`} className="portal-inline-btn">
                              View Order {lead.order.orderNumber}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <ServerListPager pager={pager} noun="leads" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
