"use client";

/**
 * Inquiries: contact-form submissions from the storefront.
 *
 * Read-only besides marking progress -- nobody edits what a shopper wrote,
 * only whether staff have followed up on it.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDate,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Inquiry = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  status: 'NEW' | 'CONTACTED' | 'RESOLVED';
  createdAt: string;
};

const STATUSES: Inquiry['status'][] = ['NEW', 'CONTACTED', 'RESOLVED'];

export default function InquiriesPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

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
    async (params: { skip: number; take: number; search: string; status?: string }): Promise<ServerPage<Inquiry>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      if (params.status) query.set('status', params.status);
      return apiRequest<ServerPage<Inquiry>>(`/inquiries?${query}`, { method: 'GET' }, token);
    },
    [token],
  );

  const pager = useServerPager<Inquiry, { status?: string }>({
    fetchPage: (params) => fetchPage(params),
    filters: { status: statusFilter || undefined },
    enabled: Boolean(token),
  });

  const canUpdate = hasPermission(profile, 'inquiry.update');

  async function onSetStatus(inquiry: Inquiry, status: Inquiry['status']) {
    if (!token) return;
    try {
      await apiRequest(`/inquiries/${inquiry.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, token);
      setFeedback(`${inquiry.name}'s inquiry marked ${status.toLowerCase()}.`);
      pager.reload();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading inquiries...</article>
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
            active="inquiries"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Inquiries"
            pageSubtitle="Contact-form submissions from the storefront."
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
              <h2 style={{ marginTop: 0 }}>Inquiries</h2>

              <div className="list-toolbar">
                <ServerListSearch pager={pager} placeholder="Search name, email or phone…" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div className="portal-list-stack">
                {!pager.loading && pager.items.length === 0 ? (
                  <div className="portal-empty-state">
                    {pager.search || statusFilter ? 'No inquiries match.' : 'No inquiries yet.'}
                  </div>
                ) : (
                  pager.items.map((inquiry) => (
                    <div key={inquiry.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{inquiry.name}</strong>
                          <span className="portal-chip" style={{ marginLeft: 8 }}>{inquiry.status}</span>
                          <p className="portal-muted">
                            {inquiry.email}
                            {inquiry.phone ? ` · ${inquiry.phone}` : ''} · {formatDate(inquiry.createdAt)}
                          </p>
                          <p style={{ whiteSpace: 'pre-wrap' }}>{inquiry.message}</p>
                        </div>
                        {canUpdate ? (
                          <div className="portal-action-row">
                            {inquiry.status !== 'CONTACTED' ? (
                              <button type="button" className="portal-inline-btn" onClick={() => void onSetStatus(inquiry, 'CONTACTED')}>
                                Mark Contacted
                              </button>
                            ) : null}
                            {inquiry.status !== 'RESOLVED' ? (
                              <button type="button" className="portal-inline-btn" onClick={() => void onSetStatus(inquiry, 'RESOLVED')}>
                                Mark Resolved
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <ServerListPager pager={pager} noun="inquiries" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
