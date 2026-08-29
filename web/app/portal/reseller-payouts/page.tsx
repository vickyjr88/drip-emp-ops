"use client";

/**
 * Staff-run disbursement of what resellers have earned in referral
 * commission. Mirrors SupplierPayment's stage -> approve -> release
 * lifecycle: staging clears a reseller's current accrued balance into a
 * payout, approval is a second pair of eyes, and release is the actual
 * ledger posting (Reseller Commissions Payable debited, cash credited).
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDate, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type ResellerPayout = {
  id: string;
  payoutNumber: string;
  amount: string | number;
  status: 'STAGED' | 'APPROVED' | 'PAID' | 'CANCELLED';
  stagedAt: string;
  approvedAt?: string | null;
  paidAt?: string | null;
  reseller: { id: string; firstName: string; lastName: string; businessName?: string | null };
};

type ResellerOption = {
  id: string;
  name: string;
  businessName?: string | null;
  firstName: string;
  lastName: string;
};

type Stats = {
  totalAccrued: number;
  totalPaidOut: number;
  resellersWithBalance: number;
  totalClicks: number;
  conversionRate: number | null;
};

function formatConversionRate(rate: number | null) {
  if (rate === null) return '—';
  return `${(rate * 100).toLocaleString('en-KE', { maximumFractionDigits: 1 })}%`;
}

const STATUSES: ResellerPayout['status'][] = ['STAGED', 'APPROVED', 'PAID', 'CANCELLED'];

function resellerLabel(reseller: { businessName?: string | null; firstName: string; lastName: string }) {
  return reseller.businessName || `${reseller.firstName} ${reseller.lastName}`.trim();
}

export default function ResellerPayoutsPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [resellers, setResellers] = useState<ResellerOption[]>([]);
  const [showStageForm, setShowStageForm] = useState(false);
  const [stageResellerId, setStageResellerId] = useState('');
  const [staging, setStaging] = useState(false);
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
      const [statsResult, resellerPage] = await Promise.all([
        apiRequest<Stats>('/reseller-payouts/stats', { method: 'GET' }, authToken),
        apiRequest<ServerPage<ResellerOption>>('/resellers?take=500', { method: 'GET' }, authToken),
      ]);
      setStats(statsResult);
      setResellers(resellerPage.items);
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
    async (params: { skip: number; take: number; search: string; status?: string }): Promise<ServerPage<ResellerPayout>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.status) query.set('status', params.status);
      return apiRequest<ServerPage<ResellerPayout>>(`/reseller-payouts?${query}`, { method: 'GET' }, token);
    },
    [token],
  );

  const pager = useServerPager<ResellerPayout, { status?: string }>({
    fetchPage: (params) => fetchPage(params),
    filters: { status: statusFilter || undefined },
    enabled: Boolean(token),
  });

  const canCreate = hasPermission(profile, 'reseller-payout.create');
  const canUpdate = hasPermission(profile, 'reseller-payout.update');

  async function onStage(event: FormEvent) {
    event.preventDefault();
    if (!token || !stageResellerId) return;
    setStaging(true);
    try {
      await apiRequest('/reseller-payouts', { method: 'POST', body: JSON.stringify({ resellerId: stageResellerId }) }, token);
      setFeedback('Payout staged.');
      setShowStageForm(false);
      setStageResellerId('');
      pager.reload();
      void load(token);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setStaging(false);
    }
  }

  async function onAction(payout: ResellerPayout, action: 'approve' | 'release' | 'cancel') {
    if (!token) return;
    try {
      await apiRequest(`/reseller-payouts/${payout.id}/${action}`, { method: 'POST' }, token);
      setFeedback(
        action === 'approve' ? `${payout.payoutNumber} approved.`
          : action === 'release' ? `${payout.payoutNumber} released.`
          : `${payout.payoutNumber} cancelled.`,
      );
      pager.reload();
      void load(token);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading reseller payouts...</article>
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
            active="resellerPayouts"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Reseller Payouts"
            pageSubtitle="Disburse accrued referral commission."
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
              {stats ? (
                <div className="portal-stat-grid" style={{ marginBottom: 16 }}>
                  <div className="portal-stat"><span>Link clicks</span><h3>{stats.totalClicks}</h3></div>
                  <div className="portal-stat">
                    <span>Click → order rate</span>
                    <h3>{formatConversionRate(stats.conversionRate)}</h3>
                  </div>
                  <div className="portal-stat"><span>Accrued, unpaid</span><h3>{formatMoney(stats.totalAccrued)}</h3></div>
                  <div className="portal-stat"><span>Paid out to date</span><h3>{formatMoney(stats.totalPaidOut)}</h3></div>
                  <div className="portal-stat"><span>Resellers with a balance</span><h3>{stats.resellersWithBalance}</h3></div>
                </div>
              ) : null}

              <div className="list-toolbar">
                <h2 style={{ margin: 0 }}>Payouts</h2>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                {canCreate ? (
                  <button type="button" className="portal-primary-btn" onClick={() => setShowStageForm((v) => !v)}>
                    {showStageForm ? 'Cancel' : 'Stage new payout'}
                  </button>
                ) : null}
              </div>

              {showStageForm ? (
                <form onSubmit={onStage} className="portal-inline-form" style={{ margin: '12px 0' }}>
                  <select
                    required
                    value={stageResellerId}
                    onChange={(event) => setStageResellerId(event.target.value)}
                  >
                    <option value="">Choose a reseller…</option>
                    {resellers.map((reseller) => (
                      <option key={reseller.id} value={reseller.id}>{resellerLabel(reseller)}</option>
                    ))}
                  </select>
                  <button type="submit" className="portal-primary-btn" disabled={staging}>
                    {staging ? 'Staging…' : 'Stage payout'}
                  </button>
                </form>
              ) : null}

              <div className="portal-list-stack">
                {!pager.loading && pager.items.length === 0 ? (
                  <div className="portal-empty-state">
                    {statusFilter !== '' ? 'No payouts match.' : 'No payouts yet.'}
                  </div>
                ) : (
                  pager.items.map((payout) => (
                    <div key={payout.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{payout.payoutNumber}</strong>
                          <span className="portal-chip" style={{ marginLeft: 8 }}>{payout.status}</span>
                          <p className="portal-muted">
                            <Link href={`/portal/resellers`}>{resellerLabel(payout.reseller)}</Link>
                            {' · '}{formatMoney(payout.amount)}
                            {' · staged '}{formatDate(payout.stagedAt)}
                            {payout.approvedAt ? ` · approved ${formatDate(payout.approvedAt)}` : ''}
                            {payout.paidAt ? ` · paid ${formatDate(payout.paidAt)}` : ''}
                          </p>
                        </div>
                        {canUpdate ? (
                          <div className="portal-action-row">
                            {payout.status === 'STAGED' ? (
                              <>
                                <button type="button" className="portal-inline-btn" onClick={() => void onAction(payout, 'approve')}>
                                  Approve
                                </button>
                                <button type="button" className="portal-inline-btn is-danger" onClick={() => void onAction(payout, 'cancel')}>
                                  Cancel
                                </button>
                              </>
                            ) : null}
                            {payout.status === 'APPROVED' ? (
                              <>
                                <button type="button" className="portal-inline-btn" onClick={() => void onAction(payout, 'release')}>
                                  Release
                                </button>
                                <button type="button" className="portal-inline-btn is-danger" onClick={() => void onAction(payout, 'cancel')}>
                                  Cancel
                                </button>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <ServerListPager pager={pager} noun="payouts" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
