"use client";

/**
 * Trade accounts: the shops that take our stock and pay for what they sell.
 *
 * These are customers on a non-retail price list, not a separate kind of
 * record. The same shop can buy a pair for itself and sign in to the
 * storefront, which two separate tables made impossible.
 *
 * Each row leads with what they are holding and what they owe, because those
 * are the two questions worth asking about a reseller, and an overdue count
 * beside them so the ones to chase are obvious without opening anything.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { ListExport } from '../components/list-export';
import { usePortalDialog } from '../components/portal-dialog';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatMoney,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Reseller = {
  id: string; code: string; name: string;
  /** The trading name, when there is one. Distinct from `name` (a display
   *  fallback to the person's own name when this is unset) -- never treat
   *  the two as interchangeable, or a converted customer's personal name
   *  gets silently promoted into a business name on the next save. */
  businessName?: string | null;
  contactName?: string | null; phone?: string | null; location?: string | null;
  priceTier: 'RETAIL' | 'RESELLER' | 'WHOLESALE';
  creditLimit: string | number; isActive: boolean;
  openConsignments: number; unitsHeld: number; owed: number; overdue: number;
};

type Customer = {
  id: string; firstName: string; lastName: string; email: string; phone: string;
  businessName?: string | null;
};

const BLANK = { code: '', businessName: '', contactName: '', phone: '', location: '', priceTier: 'RESELLER', creditLimit: '' };

export default function ResellersPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [exportRows, setExportRows] = useState<Reseller[]>([]);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();
  // Tracks which customerId (from a "Convert to reseller" deep-link) has
  // already been applied, so the pre-fill effect below doesn't re-fire and
  // clobber whatever staff have since typed into the form.
  const prefilledCustomerId = useRef<string | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  // Reads window.location.search directly rather than next/navigation's
  // useSearchParams(), which would require wrapping this route's own default
  // export in a <Suspense> boundary -- a plain one-time read on mount avoids
  // that for a value that only ever matters once, right after landing here
  // from the customer detail page's "Convert to reseller" link.
  useEffect(() => {
    if (!token) return;
    const customerId = new URLSearchParams(window.location.search).get('customerId');
    if (!customerId || prefilledCustomerId.current === customerId) return;
    prefilledCustomerId.current = customerId;

    void apiRequest<Customer>(`/customers/${customerId}`, { method: 'GET' }, token)
      .then((customer) => {
        setEditingId(customer.id);
        setForm({
          code: '',
          // Never pre-filled from the person's own name: this customer may
          // genuinely have no business name, and staff should see that
          // blank rather than a value that looks entered but is really just
          // a display fallback -- saving it as-is would wrongly promote
          // their personal name into a business name.
          businessName: customer.businessName || '',
          contactName: `${customer.firstName} ${customer.lastName}`.trim(),
          phone: customer.phone || '',
          location: '',
          priceTier: 'RESELLER',
          creditLimit: '',
        });
        setShowForm(true);
      })
      .catch((error) => setErrorMessage(error));
  }, [token, setErrorMessage]);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
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

  const fetchResellersPage = useCallback(
    async (params: { skip: number; take: number; search: string }): Promise<ServerPage<Reseller>> => {
      if (!token || !profile) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      query.set('includeInactive', 'true');
      if (params.search) query.set('search', params.search);
      return apiRequest<ServerPage<Reseller>>(`/resellers?${query}`, { method: 'GET' }, token);
    },
    [token, profile],
  );

  const resellersPager = useServerPager<Reseller>({
    fetchPage: (params) => fetchResellersPage(params),
    enabled: Boolean(token && profile),
  });

  useEffect(() => {
    if (!token || !profile) return;
    const timer = setTimeout(() => {
      void fetchResellersPage({ skip: 0, take: 500, search: resellersPager.search }).then((page) =>
        setExportRows(page.items),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [fetchResellersPage, resellersPager.search, token, profile]);

  const canCreate = hasPermission(profile, 'customer.create');
  const canUpdate = hasPermission(profile, 'customer.update');
  const canDelete = hasPermission(profile, 'customer.delete');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const body = { ...form, creditLimit: form.creditLimit ? Number(form.creditLimit) : 0 };
      const label = form.businessName || form.contactName;
      if (editingId) {
        await apiRequest(`/resellers/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) }, token);
        setFeedback(`${label} updated.`);
      } else {
        await apiRequest('/resellers', { method: 'POST', body: JSON.stringify(body) }, token);
        setFeedback(`${label} added.`);
      }
      setForm(BLANK); setEditingId(null); setShowForm(false);
      resellersPager.reload();
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function onToggle(reseller: Reseller) {
    if (!token) return;
    try {
      // Only the field actually changing: businessName/contactName are
      // deliberately omitted (not just re-sent as-is) so this quick action
      // can never write a name value the backend would otherwise reject or
      // that came from the display-only computed `name` field.
      await apiRequest(`/resellers/${reseller.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ code: reseller.code, isActive: !reseller.isActive }),
      }, token);
      setFeedback(`${reseller.name} ${reseller.isActive ? 'deactivated' : 'reactivated'}.`);
      resellersPager.reload();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function onDelete(reseller: Reseller) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Reseller',
      message: `Delete ${reseller.name}? A reseller with consignment history cannot be deleted — deactivate instead so the record survives.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/resellers/${reseller.id}`, { method: 'DELETE' }, token);
      setFeedback(`${reseller.name} deleted.`);
      resellersPager.reload();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading resellers...</article>
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

  const totalOwed = exportRows.reduce((sum, row) => sum + row.owed, 0);
  const totalHeld = exportRows.reduce((sum, row) => sum + row.unitsHeld, 0);
  const totalOverdue = exportRows.reduce((sum, row) => sum + row.overdue, 0);

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="resellers"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Resellers"
            pageSubtitle="Shops holding our stock, and what they owe."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <div className="portal-stat-grid">
              <article className="portal-stat-card">
                <p>Units out</p>
                <h3>{totalHeld}</h3>
                <span className="portal-stat-note">still with resellers</span>
              </article>
              <article className="portal-stat-card">
                <p>Owed</p>
                <h3>{formatMoney(totalOwed)}</h3>
                <span className="portal-stat-note">sold but not yet paid</span>
              </article>
              <article className="portal-stat-card">
                <p>Overdue pickups</p>
                <h3>{totalOverdue}</h3>
                <span className="portal-stat-note">past the three-day return</span>
              </article>
            </div>

            {showForm && (canCreate || canUpdate) ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit Reseller' : 'Add Reseller'}</h2>
                <form className="portal-entity-form" onSubmit={onSubmit}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Code</span>
                      <input value={form.code} placeholder="MNJ" required
                        onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))} />
                    </label>
                    <label>
                      <span>Contact name</span>
                      <input value={form.contactName} placeholder="Njeri Wanjiru" required={!form.businessName}
                        onChange={(event) => setForm((prev) => ({ ...prev, contactName: event.target.value }))} />
                    </label>
                  </div>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Business name (optional)</span>
                      <input value={form.businessName} placeholder="Leave blank if there isn't one"
                        onChange={(event) => setForm((prev) => ({ ...prev, businessName: event.target.value }))} />
                    </label>
                    <label>
                      <span>Phone</span>
                      <input value={form.phone} placeholder="+254…"
                        onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
                    </label>
                    <label>
                      <span>Location</span>
                      <input value={form.location} placeholder="Gikomba"
                        onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} />
                    </label>
                  </div>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Price tier</span>
                      <select value={form.priceTier}
                        onChange={(event) => setForm((prev) => ({ ...prev, priceTier: event.target.value }))}>
                        <option value="RESELLER">Reseller</option>
                        <option value="WHOLESALE">Wholesale</option>
                      </select>
                    </label>
                    <label>
                      <span>Credit limit (KES)</span>
                      <input type="number" min="0" value={form.creditLimit} placeholder="0 for no limit"
                        onChange={(event) => setForm((prev) => ({ ...prev, creditLimit: event.target.value }))} />
                    </label>
                  </div>
                  <div className="portal-inline-actions">
                    <button type="submit" className="portal-primary-btn" disabled={saving}>
                      {saving ? 'Saving...' : editingId ? 'Save Reseller' : 'Add Reseller'}
                    </button>
                    <button type="button" className="portal-ghost-btn"
                      onClick={() => { setShowForm(false); setEditingId(null); setForm(BLANK); }}>
                      Cancel
                    </button>
                  </div>
                </form>
              </article>
            ) : null}

            <article className="portal-card" data-tour="resellers.list">
              <div className="portal-card-header-row">
                <div><h2 style={{ margin: 0 }}>All Resellers</h2></div>
                {canCreate && !showForm ? (
                  <button type="button" className="portal-primary-btn" onClick={() => setShowForm(true)}>
                    Add Reseller
                  </button>
                ) : null}
              </div>

              <div className="list-toolbar">
                <ServerListSearch pager={resellersPager} placeholder="Search name, code, phone…" />
                <ListExport
                  rows={exportRows}
                  config={{
                    fileName: 'resellers',
                    columns: [
                      { header: 'Code', value: (row) => row.code },
                      { header: 'Name', value: (row) => row.name },
                      { header: 'Phone', value: (row) => row.phone || '' },
                      { header: 'Tier', value: (row) => row.priceTier },
                      { header: 'Units Held', value: (row) => row.unitsHeld },
                      { header: 'Owed', value: (row) => row.owed },
                      { header: 'Overdue', value: (row) => row.overdue },
                    ],
                  }}
                />
              </div>

              <div className="portal-list-stack">
                {!resellersPager.loading && resellersPager.items.length === 0 ? (
                  <div className="portal-empty-state">
                    {resellersPager.search ? 'No resellers match.' : 'No resellers yet.'}
                  </div>
                ) : (
                  resellersPager.items.map((reseller) => (
                    <div key={reseller.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>
                            {reseller.code} · {reseller.name}
                            {reseller.isActive ? '' : ' (inactive)'}
                          </strong>
                          <p className="portal-muted">
                            {reseller.priceTier.toLowerCase()} pricing
                            {reseller.phone ? ` · ${reseller.phone}` : ''}
                            {reseller.location ? ` · ${reseller.location}` : ''}
                          </p>
                          <p>
                            {reseller.unitsHeld} unit(s) held · {formatMoney(reseller.owed)} owed
                            {reseller.overdue > 0 ? ` · ${reseller.overdue} OVERDUE` : ''}
                          </p>
                        </div>
                        <div className="portal-action-row">
                          <Link href={`/portal/consignments?resellerId=${reseller.id}`} className="portal-inline-btn">
                            Pickups
                          </Link>
                          {canUpdate ? (
                            <>
                              <button type="button" className="portal-inline-btn"
                                onClick={() => {
                                  setEditingId(reseller.id);
                                  setShowForm(true);
                                  setForm({
                                    code: reseller.code,
                                    // The real businessName field, never the
                                    // computed display `name` -- see the type
                                    // comment above for why conflating them
                                    // caused a personal name to get saved as
                                    // a business name.
                                    businessName: reseller.businessName || '',
                                    contactName: reseller.contactName || '', phone: reseller.phone || '',
                                    location: reseller.location || '', priceTier: reseller.priceTier,
                                    creditLimit: String(reseller.creditLimit || ''),
                                  });
                                }}>
                                Edit
                              </button>
                              <button type="button" className="portal-inline-btn" onClick={() => void onToggle(reseller)}>
                                {reseller.isActive ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </>
                          ) : null}
                          {canDelete ? (
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDelete(reseller)}>
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <ServerListPager pager={resellersPager} noun="resellers" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
