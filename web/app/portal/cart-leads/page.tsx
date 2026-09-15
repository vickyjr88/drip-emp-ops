"use client";

/**
 * Cart Leads, as its own section rather than a tab buried inside Orders.
 *
 * The till on /portal/orders still owns "start an order from this lead" --
 * that workflow needs the order-creation form in place, so it stays there.
 * This page is the read/browse half: outstanding leads by default, a link
 * into each one's own detail page, and a link across to the resolved
 * (dismissed/converted) history.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ListThumb } from '../components/list-thumb';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { useErrorState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

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
};

export default function CartLeadsPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
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

  const filters = useMemo(() => ({ source: sourceFilter || undefined }), [sourceFilter]);

  const fetchPage = useCallback(
    async (params: { skip: number; take: number; search: string; source?: string }): Promise<ServerPage<CartLead>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      query.set('outstanding', 'true');
      if (params.search) query.set('search', params.search);
      if (params.source) query.set('source', params.source);
      return apiRequest<ServerPage<CartLead>>(`/cart-leads?${query}`, { method: 'GET' }, token);
    },
    [token],
  );

  const pager = useServerPager<CartLead, typeof filters>({
    fetchPage: (params) => fetchPage(params),
    filters,
    enabled: Boolean(token),
  });

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading cart leads...</article>
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
            active="cartLeads"
            pageSubtitle="Shoppers who chose WhatsApp instead of checking out, or left a cart with contact details filled in."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <article className="portal-card">
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Outstanding Leads</h2>
                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                    To ring one up as a sale, use the Cart Leads tab on the Orders page.
                  </p>
                </div>
                <div className="portal-action-row">
                  <Link href="/portal/orders" className="portal-ghost-btn">
                    Start Order From a Lead
                  </Link>
                  <Link href="/portal/cart-leads/history" className="portal-ghost-btn">
                    View History
                  </Link>
                </div>
              </div>

              <div className="list-toolbar">
                <ServerListSearch pager={pager} placeholder="Search name, phone or email…" />
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  <option value="">All sources</option>
                  <option value="WHATSAPP_ORDER">WhatsApp order</option>
                  <option value="ABANDONED_CART">Abandoned cart</option>
                </select>
              </div>

              <div className="portal-list-stack">
                {!pager.loading && pager.items.length === 0 ? (
                  <div className="portal-empty-state">
                    {pager.search || sourceFilter ? 'No leads match.' : 'No outstanding leads.'}
                  </div>
                ) : (
                  pager.items.map((lead) => (
                    <Link key={lead.id} href={`/portal/cart-leads/${lead.id}`} className="portal-record is-clickable">
                      <div className="portal-list-row has-thumb">
                        <ListThumb sources={[lead.firstLineImageUrl]} label={lead.lines[0]?.name || lead.customerName || '?'} />
                        <div>
                          <strong>{lead.customerName || lead.customerPhone || lead.customerEmail}</strong>
                          <span className="portal-chip" style={{ marginLeft: 8 }}>
                            {lead.source === 'WHATSAPP_ORDER' ? 'WhatsApp' : 'Abandoned cart'}
                          </span>
                          {lead.status === 'CONTACTED' ? (
                            <span className="portal-chip is-muted" style={{ marginLeft: 8 }}>Contacted</span>
                          ) : null}
                          <p className="portal-muted">
                            {lead.customerPhone || lead.customerEmail || 'No contact on file'} ·{' '}
                            {lead.lines.length} item{lead.lines.length === 1 ? '' : 's'} · {formatDateTime(lead.lastActivityAt)}
                          </p>
                          <p>{formatMoney(lead.total)}</p>
                        </div>
                      </div>
                    </Link>
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
