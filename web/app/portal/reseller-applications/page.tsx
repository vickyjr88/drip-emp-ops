"use client";

/**
 * Reseller applications: customers asking to buy at trade prices.
 *
 * Approving flips the customer's price tier immediately -- trade code and
 * credit limit are a separate step staff complete afterward from the
 * Resellers list, the same follow-up as manually converting a customer.
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

type ResellerApplication = {
  id: string;
  businessName: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    priceTier: 'RETAIL' | 'RESELLER' | 'WHOLESALE';
  };
};

const STATUSES: ResellerApplication['status'][] = ['PENDING', 'APPROVED', 'REJECTED'];

export default function ResellerApplicationsPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [statusFilter, setStatusFilter] = useState('PENDING');
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
    async (params: { skip: number; take: number; search: string; status?: string }): Promise<ServerPage<ResellerApplication>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      if (params.status) query.set('status', params.status);
      return apiRequest<ServerPage<ResellerApplication>>(`/reseller-applications?${query}`, { method: 'GET' }, token);
    },
    [token],
  );

  const pager = useServerPager<ResellerApplication, { status?: string }>({
    fetchPage: (params) => fetchPage(params),
    filters: { status: statusFilter || undefined },
    enabled: Boolean(token),
  });

  const canUpdate = hasPermission(profile, 'reseller-application.update');

  async function onDecide(application: ResellerApplication, decision: 'approve' | 'reject') {
    if (!token) return;
    try {
      await apiRequest(`/reseller-applications/${application.id}/${decision}`, { method: 'PATCH' }, token);
      setFeedback(`${application.businessName}'s application ${decision === 'approve' ? 'approved' : 'rejected'}.`);
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
            <article className="portal-card portal-loading">Loading reseller applications...</article>
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
            active="resellerApplications"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Reseller Applications"
            pageSubtitle="Customers asking to buy at trade prices."
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
              <h2 style={{ marginTop: 0 }}>Reseller Applications</h2>

              <div className="list-toolbar">
                <ServerListSearch pager={pager} placeholder="Search name, email or business…" />
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
                    {pager.search || statusFilter !== '' ? 'No applications match.' : 'No applications yet.'}
                  </div>
                ) : (
                  pager.items.map((application) => (
                    <div key={application.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{application.businessName}</strong>
                          <span className="portal-chip" style={{ marginLeft: 8 }}>{application.status}</span>
                          <p className="portal-muted">
                            <Link href={`/portal/customers/${application.customer.id}`}>
                              {application.customer.firstName} {application.customer.lastName}
                            </Link>
                            {' · '}{application.customer.email}
                            {application.customer.phone ? ` · ${application.customer.phone}` : ''}
                            {' · '}{formatDate(application.createdAt)}
                          </p>
                          <p style={{ whiteSpace: 'pre-wrap' }}>{application.reason}</p>
                          {application.reviewedAt ? (
                            <p className="portal-muted">
                              Reviewed {formatDate(application.reviewedAt)}
                              {application.reviewedBy ? ` by ${application.reviewedBy}` : ''}
                            </p>
                          ) : null}
                        </div>
                        {canUpdate && application.status === 'PENDING' ? (
                          <div className="portal-action-row">
                            <button type="button" className="portal-inline-btn" onClick={() => void onDecide(application, 'approve')}>
                              Approve
                            </button>
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDecide(application, 'reject')}>
                              Reject
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <ServerListPager pager={pager} noun="applications" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
