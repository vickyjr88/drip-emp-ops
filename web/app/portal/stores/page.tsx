"use client";

/**
 * Stores: the shops goods are sold from, and the dimension the ledger tags
 * against. Create and edit happen inline because a business runs two or three
 * of these, not hundreds, and a separate form screen would be more navigation
 * than the task is worth.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { useErrorState, useFeedbackState, useNotifications } from '../components/notifications';
import { usePortalDialog } from '../components/portal-dialog';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Store = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  location?: string | null;
  isActive: boolean;
};

type Summary = { unitsOnHand: number; orderCount: number; revenue: number; needsReorder: number };

const BLANK = { code: '', name: '', location: '', description: '' };

export default function StoresPage() {
  const dialog = usePortalDialog();
  const notifications = useNotifications();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      const rows = await apiRequest<Store[]>('/stores?includeInactive=true', { method: 'GET' }, authToken);
      setStores(rows);

      // Each store's figures are fetched alongside; a handful of stores makes
      // this cheaper than a bespoke endpoint returning all of them.
      const pairs = await Promise.all(
        rows.map(async (store) => {
          try {
            return [store.id, await apiRequest<Summary>(`/stores/${store.id}/summary`, { method: 'GET' }, authToken)] as const;
          } catch {
            return [store.id, null] as const;
          }
        }),
      );
      setSummaries(Object.fromEntries(pairs.filter(([, value]) => value)) as Record<string, Summary>);
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

  const canCreate = hasPermission(profile, 'store.create');
  const canUpdate = hasPermission(profile, 'store.update');
  const canDelete = hasPermission(profile, 'store.delete');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/stores/${editingId}`, { method: 'PATCH', body: JSON.stringify(form) }, token);
        setFeedback(`${form.name} updated.`);
      } else {
        await apiRequest('/stores', { method: 'POST', body: JSON.stringify(form) }, token);
        setFeedback(`${form.name} added.`);
      }
      setForm(BLANK);
      setEditingId(null);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActive(store: Store) {
    if (!token) return;
    try {
      await apiRequest(`/stores/${store.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !store.isActive }),
      }, token);
      setFeedback(`${store.name} ${store.isActive ? 'deactivated' : 'reactivated'}.`);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function onDelete(store: Store) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Store',
      message: `Delete ${store.name}? Stores holding orders or stock cannot be deleted — deactivate those instead.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/stores/${store.id}`, { method: 'DELETE' }, token);
      notifications.success(`${store.name} deleted.`);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading stores...</article>
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
            active="stores"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Stores"
            pageSubtitle="Shops goods are sold from. Sales, stock and expenses are all tagged to one."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            {canCreate || canUpdate ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit Store' : 'Add Store'}</h2>
                <form className="portal-entity-form" onSubmit={onSubmit}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Code</span>
                      <input
                        value={form.code}
                        placeholder="DMM-F53"
                        onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Name</span>
                      <input
                        value={form.name}
                        placeholder="Dubai Merchants Mall"
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    <span>Location</span>
                    <input
                      value={form.location}
                      placeholder="Shop F53, Ronald Ngala Street, Nairobi"
                      onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                    />
                  </label>
                  <div className="portal-inline-actions">
                    <button type="submit" className="portal-primary-btn" disabled={saving}>
                      {saving ? 'Saving...' : editingId ? 'Save Store' : 'Add Store'}
                    </button>
                    {editingId ? (
                      <button
                        type="button"
                        className="portal-ghost-btn"
                        onClick={() => { setEditingId(null); setForm(BLANK); }}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </form>
              </article>
            ) : null}

            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>All Stores</h2>
              <div className="portal-list-stack">
                {stores.length === 0 ? (
                  <div className="portal-empty-state">No stores yet. Add the first one above.</div>
                ) : (
                  stores.map((store) => {
                    const summary = summaries[store.id];
                    return (
                      <div key={store.id} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>
                              {store.code} · {store.name}
                              {store.isActive ? '' : ' (inactive)'}
                            </strong>
                            {store.location ? <p className="portal-muted">{store.location}</p> : null}
                            {summary ? (
                              <p>
                                {summary.unitsOnHand} units · {summary.orderCount} orders ·{' '}
                                {formatMoney(summary.revenue)}
                                {summary.needsReorder > 0
                                  ? ` · ${summary.needsReorder} need reorder`
                                  : ''}
                              </p>
                            ) : null}
                          </div>
                          <div className="portal-action-row">
                            {canUpdate ? (
                              <>
                                <button
                                  type="button"
                                  className="portal-inline-btn"
                                  onClick={() => {
                                    setEditingId(store.id);
                                    setForm({
                                      code: store.code,
                                      name: store.name,
                                      location: store.location || '',
                                      description: store.description || '',
                                    });
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="portal-inline-btn"
                                  onClick={() => void onToggleActive(store)}
                                >
                                  {store.isActive ? 'Deactivate' : 'Reactivate'}
                                </button>
                              </>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                className="portal-inline-btn is-danger"
                                onClick={() => void onDelete(store)}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
