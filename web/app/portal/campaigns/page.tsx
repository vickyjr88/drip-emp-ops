"use client";

/**
 * Admin-created tracking links for paid marketing (Facebook/Google ads, a
 * flyer's QR code, and so on) -- the shop's own version of a reseller's
 * referral link, minus commission. Staff pick a short code themselves so the
 * resulting link stays readable in an ad; performance is clicks, orders and
 * the conversion rate between them.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDate,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';
import { absoluteUrl } from '../../lib/site';

type Campaign = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  createdBy?: string | null;
  clicks: number;
  orders: number;
  conversionRate: number | null;
  /** Taps on any WhatsApp link while this campaign was attributed, and how
   *  many became a lead staff can chase -- most of this shop's real sales
   *  close in that chat, not at online checkout. */
  whatsappClicks: number;
  whatsappLeads: number;
};

function formatConversionRate(rate: number | null) {
  if (rate === null) return '—';
  return `${(rate * 100).toLocaleString('en-KE', { maximumFractionDigits: 1 })}%`;
}

function campaignLink(code: string) {
  return `${absoluteUrl('/shop')}?camp=${encodeURIComponent(code)}`;
}

export default function CampaignsPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', name: '', isActive: true });
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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
    async (params: { skip: number; take: number; search: string; isActive?: string }): Promise<ServerPage<Campaign>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      if (params.isActive) query.set('isActive', params.isActive);
      return apiRequest<ServerPage<Campaign>>(`/campaigns?${query}`, { method: 'GET' }, token);
    },
    [token],
  );

  const pager = useServerPager<Campaign, { isActive?: string }>({
    fetchPage: (params) => fetchPage(params),
    filters: { isActive: statusFilter || undefined },
    enabled: Boolean(token),
  });

  const canCreate = hasPermission(profile, 'marketing-campaign.create');
  const canUpdate = hasPermission(profile, 'marketing-campaign.update');

  function onStartCreate() {
    setEditingId(null);
    setForm({ code: '', name: '', isActive: true });
    setShowForm(true);
  }

  function onStartEdit(campaign: Campaign) {
    setEditingId(campaign.id);
    setForm({ code: campaign.code, name: campaign.name, isActive: campaign.isActive });
    setShowForm(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/campaigns/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: form.name, isActive: form.isActive }),
        }, token);
        setFeedback('Campaign updated.');
      } else {
        await apiRequest('/campaigns', {
          method: 'POST',
          body: JSON.stringify({ code: form.code.trim().toLowerCase(), name: form.name }),
        }, token);
        setFeedback('Campaign created.');
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ code: '', name: '', isActive: true });
      pager.reload();
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActive(campaign: Campaign) {
    if (!token) return;
    try {
      await apiRequest(`/campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !campaign.isActive }),
      }, token);
      setFeedback(campaign.isActive ? 'Campaign deactivated.' : 'Campaign reactivated.');
      pager.reload();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function onCopyLink(campaign: Campaign) {
    try {
      await navigator.clipboard.writeText(campaignLink(campaign.code));
      setCopiedId(campaign.id);
      window.setTimeout(() => setCopiedId((current) => (current === campaign.id ? null : current)), 2000);
    } catch {
      // Clipboard can be blocked; the link is still visible on the row.
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading campaigns...</article>
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
            active="campaigns"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Marketing Campaigns"
            pageSubtitle="Trackable links for paid marketing -- clicks, orders, conversion."
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
              <div className="list-toolbar">
                <h2 style={{ margin: 0 }}>Campaigns</h2>
                <ServerListSearch pager={pager} placeholder="Search by name or code…" />
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All campaigns</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
                {canCreate ? (
                  <button type="button" className="portal-primary-btn" onClick={() => (showForm ? setShowForm(false) : onStartCreate())}>
                    {showForm ? 'Cancel' : 'New campaign'}
                  </button>
                ) : null}
              </div>

              {showForm ? (
                <form onSubmit={onSubmit} className="portal-inline-form" style={{ margin: '12px 0', flexWrap: 'wrap' }}>
                  <label style={{ flex: 1, minWidth: 180 }}>
                    <span className="portal-muted" style={{ display: 'block', marginBottom: 4 }}>Code</span>
                    <input
                      value={form.code}
                      onChange={(event) => setForm((f) => ({ ...f, code: event.target.value }))}
                      placeholder="fb-nov-sale"
                      disabled={Boolean(editingId)}
                      required
                    />
                  </label>
                  <label style={{ flex: 2, minWidth: 220 }}>
                    <span className="portal-muted" style={{ display: 'block', marginBottom: 4 }}>Name</span>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                      placeholder="Facebook November Sale"
                      required
                    />
                  </label>
                  <button type="submit" className="portal-primary-btn" disabled={saving}>
                    {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create campaign'}
                  </button>
                </form>
              ) : null}

              <div className="portal-list-stack">
                {!pager.loading && pager.items.length === 0 ? (
                  <div className="portal-empty-state">
                    {statusFilter !== '' ? 'No campaigns match.' : 'No campaigns yet.'}
                  </div>
                ) : (
                  pager.items.map((campaign) => (
                    <div key={campaign.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{campaign.name}</strong>
                          <span className="portal-chip" style={{ marginLeft: 8 }}>{campaign.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                          <p className="portal-muted">
                            <code>{campaign.code}</code>
                            {' · '}{campaign.clicks} click{campaign.clicks === 1 ? '' : 's'}
                            {' · '}{campaign.orders} online order{campaign.orders === 1 ? '' : 's'}
                            {' · '}{formatConversionRate(campaign.conversionRate)} conversion
                            {' · created '}{formatDate(campaign.createdAt)}
                          </p>
                          <p className="portal-muted">
                            {campaign.whatsappClicks} WhatsApp tap{campaign.whatsappClicks === 1 ? '' : 's'}
                            {' · '}{campaign.whatsappLeads} lead{campaign.whatsappLeads === 1 ? '' : 's'} for staff to chase
                          </p>
                          <p className="portal-muted" style={{ wordBreak: 'break-all' }}>
                            {campaignLink(campaign.code)}
                          </p>
                        </div>
                        <div className="portal-action-row">
                          <button type="button" className="portal-inline-btn" onClick={() => void onCopyLink(campaign)}>
                            {copiedId === campaign.id ? 'Copied!' : 'Copy link'}
                          </button>
                          {canUpdate ? (
                            <>
                              <button type="button" className="portal-inline-btn" onClick={() => onStartEdit(campaign)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className={campaign.isActive ? 'portal-inline-btn is-danger' : 'portal-inline-btn'}
                                onClick={() => void onToggleActive(campaign)}
                              >
                                {campaign.isActive ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <ServerListPager pager={pager} noun="campaigns" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
