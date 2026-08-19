"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import { ListExport } from '../../components/list-export';
import { ListPager, ListSearch, useListControls } from '../../components/list-controls';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../../components/server-pager';
import { TourLauncher } from '../../tours/tour-launcher';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { usePortalDialog } from '../../components/portal-dialog';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  canReadRbacFor,
  formatDate,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../lib';

type ChartOfAccount = { id: string; code: string; name: string; type: string; subtype?: string | null };

type TaxApplication = 'OUTPUT' | 'INPUT' | 'WITHHOLDING';

type TaxRate = {
  id: string;
  name: string;
  code: string;
  rate: string | number;
  appliesTo: TaxApplication;
  glAccountId: string;
  glAccount: ChartOfAccount;
  isActive: boolean;
};

type Store = { id: string; code: string; name: string };
type BankAccount = { id: string; name: string; currencyCode: string };

type TaxRemittance = {
  id: string;
  remittanceNumber: string;
  taxRate: TaxRate;
  bankAccount?: BankAccount | null;
  store?: Store | null;
  amount: string | number;
  periodStart: string;
  periodEnd: string;
  reference?: string | null;
  remittedAt: string;
};

type TaxTab = 'rates' | 'remittances';

const APPLICATION_LABELS: Record<TaxApplication, string> = {
  OUTPUT: 'Output (charged on sales/rent)',
  INPUT: 'Input (reclaimable on purchases)',
  WITHHOLDING: 'Withholding (deducted from supplier payments)',
};

export default function TaxPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [tab, setTab] = useState<TaxTab>('rates');

  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [glAccounts, setGlAccounts] = useState<ChartOfAccount[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [showRateForm, setShowRateForm] = useState(false);
  const [rateForm, setRateForm] = useState({ name: '', code: '', rate: '', appliesTo: 'OUTPUT' as TaxApplication, glAccountId: '' });
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [rateEditForm, setRateEditForm] = useState({
    name: '',
    code: '',
    rate: '',
    appliesTo: 'OUTPUT' as TaxApplication,
    glAccountId: '',
    isActive: true,
  });

  const [showRemittanceForm, setShowRemittanceForm] = useState(false);
  const [remittanceForm, setRemittanceForm] = useState({
    taxRateId: '',
    bankAccountId: '',
    storeId: '',
    amount: '',
    periodStart: '',
    periodEnd: '',
    reference: '',
  });

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await loadProfile(authToken);
      const [nextRates, nextAccounts, nextStores, nextBanks] = await Promise.all([
        hasPermission(nextProfile, 'tax-rate.read')
          ? apiRequest<TaxRate[]>('/tax-rates', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'chart-of-account.read')
          ? apiRequest<ChartOfAccount[]>('/chart-of-accounts', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'store.read')
          ? apiRequest<Store[]>('/stores', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'bank-account.read')
          ? apiRequest<BankAccount[]>('/bank-accounts', { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);
      setProfile(nextProfile);
      setTaxRates(nextRates);
      setGlAccounts(nextAccounts);
      setStores(nextStores);
      setBankAccounts(nextBanks);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load tax configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const taxRateMap = useMemo(() => {
    const map = new Map<string, TaxRate>();
    for (const rate of taxRates) map.set(rate.id, rate);
    return map;
  }, [taxRates]);

  const fetchRemittancesPage = useCallback(
    async (params: { skip: number; take: number; search: string }): Promise<ServerPage<TaxRemittance>> => {
      if (!token || !profile || !hasPermission(profile, 'tax-remittance.read')) {
        return { items: [], total: 0, skip: params.skip, take: params.take };
      }
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      return apiRequest<ServerPage<TaxRemittance>>(`/tax-remittances?${query}`, { method: 'GET' }, token);
    },
    [token, profile],
  );

  const remittancesPager = useServerPager<TaxRemittance>({
    fetchPage: (params) => fetchRemittancesPage(params),
    enabled: Boolean(token && profile && tab === 'remittances'),
  });

  const canCreateRate = hasPermission(profile, 'tax-rate.create');
  const canUpdateRate = hasPermission(profile, 'tax-rate.update');
  const canDeleteRate = hasPermission(profile, 'tax-rate.delete');
  const canCreateRemittance = hasPermission(profile, 'tax-remittance.create');

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  /**
   * apiRequest throws the raw response body, so pull the API's own message out
   * of it rather than showing the user a JSON blob.
   */
  function readApiError(error: unknown, fallback: string) {
    const raw = error instanceof Error ? error.message : '';
    try {
      const parsed = JSON.parse(raw);
      const message = parsed?.message;
      if (Array.isArray(message)) return message.join(', ');
      if (typeof message === 'string') return message;
    } catch {
      // Not JSON; fall through to the raw text.
    }
    return raw || fallback;
  }

  async function runMutation(action: () => Promise<void>, successMessage: string) {
    if (!token) return;
    setMutating(true);
    setFeedback(null);
    setErrorMessage(null);
    try {
      await action();
      setFeedback(successMessage);
      await load(token);
      remittancesPager.reload();
    } catch (error) {
      setErrorMessage(readApiError(error, 'Operation failed.'));
    } finally {
      setMutating(false);
    }
  }

  async function onCreateRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateRate) return;
    await runMutation(async () => {
      await apiRequest(
        '/tax-rates',
        {
          method: 'POST',
          body: JSON.stringify({
            name: rateForm.name,
            code: rateForm.code,
            rate: Number(rateForm.rate) / 100,
            appliesTo: rateForm.appliesTo,
            glAccountId: rateForm.glAccountId,
          }),
        },
        token,
      );
      setShowRateForm(false);
      setRateForm({ name: '', code: '', rate: '', appliesTo: 'OUTPUT', glAccountId: '' });
    }, 'Tax rate created.');
  }

  function startEditRate(rate: TaxRate) {
    setEditingRateId(rate.id);
    setRateEditForm({
      name: rate.name,
      code: rate.code,
      // Stored as a decimal (0.16); shown as a percentage (16).
      rate: (Number(rate.rate) * 100).toFixed(2).replace(/\.00$/, ''),
      appliesTo: rate.appliesTo,
      glAccountId: rate.glAccountId,
      isActive: rate.isActive,
    });
  }

  async function onUpdateRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdateRate || !editingRateId) return;

    const percent = Number(rateEditForm.rate);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setErrorMessage('Rate must be between 0 and 100 percent.');
      return;
    }

    const existing = taxRates.find((item) => item.id === editingRateId);
    const rateChanged = existing && Math.abs(Number(existing.rate) - percent / 100) > 1e-9;

    // Changing a rate does not touch invoices already posted with the old one,
    // so make sure that is a deliberate decision rather than a surprise.
    if (rateChanged) {
      const confirmed = await dialog.confirm({
        title: 'Change tax rate',
        message:
          'This applies to future postings only. Invoices already recorded keep the rate that was in force when they were posted.',
        confirmLabel: 'Change rate',
      });
      if (!confirmed) return;
    }

    await runMutation(async () => {
      await apiRequest(
        `/tax-rates/${editingRateId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: rateEditForm.name.trim(),
            code: rateEditForm.code.trim(),
            rate: percent / 100,
            appliesTo: rateEditForm.appliesTo,
            glAccountId: rateEditForm.glAccountId,
            isActive: rateEditForm.isActive,
          }),
        },
        token,
      );
      setEditingRateId(null);
    }, 'Tax rate updated.');
  }

  async function onToggleRateActive(rate: TaxRate) {
    if (!token || !canUpdateRate) return;
    await runMutation(async () => {
      await apiRequest(
        `/tax-rates/${rate.id}`,
        { method: 'PATCH', body: JSON.stringify({ isActive: !rate.isActive }) },
        token,
      );
    }, rate.isActive ? 'Tax rate deactivated.' : 'Tax rate activated.');
  }

  async function onDeleteRate(id: string) {
    if (!token || !canDeleteRate) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Tax Rate',
      message: 'Delete this tax rate? Only possible if it has never been used on an invoice.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/tax-rates/${id}`, { method: 'DELETE' }, token);
    }, 'Tax rate deleted.');
  }

  async function onCreateRemittance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateRemittance) return;
    await runMutation(async () => {
      await apiRequest(
        '/tax-remittances',
        {
          method: 'POST',
          body: JSON.stringify({
            taxRateId: remittanceForm.taxRateId,
            bankAccountId: remittanceForm.bankAccountId || undefined,
            storeId: remittanceForm.storeId || undefined,
            amount: Number(remittanceForm.amount),
            periodStart: remittanceForm.periodStart,
            periodEnd: remittanceForm.periodEnd,
            reference: remittanceForm.reference || undefined,
            remittedBy: profile?.email,
          }),
        },
        token,
      );
      setShowRemittanceForm(false);
      setRemittanceForm({ taxRateId: '', bankAccountId: '', storeId: '', amount: '', periodStart: '', periodEnd: '', reference: '' });
    }, 'Remittance recorded.');
  }

  const rateControls = useListControls(taxRates, (row) => [
    row.name,
    row.code,
    row.appliesTo,
  ]);

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading tax configuration...</article>
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
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="accounting"
            pageTitle="Taxes & Duties"
            pageSubtitle="VAT and withholding tax rates, and remittances to KRA."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <Link href="/portal/accounting" className="portal-ghost-btn">
                Back to Accounting
              </Link>
            </div>


            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <button type="button" className={`portal-inline-btn${tab === 'rates' ? ' is-active' : ''}`} onClick={() => setTab('rates')}>
                Tax Rates
              </button>
              <button type="button" className={`portal-inline-btn${tab === 'remittances' ? ' is-active' : ''}`} onClick={() => setTab('remittances')}>
                Remittances
              </button>
            </div>

            {tab === 'rates' ? (
              <article className="portal-card" data-tour="tax.rates">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Tax Rates</h2><TourLauncher tour="tax-and-remittance" />
                  {canCreateRate ? (
                    <button type="button" className="portal-inline-btn" onClick={() => setShowRateForm((prev) => !prev)}>
                      {showRateForm ? 'Close' : 'New Tax Rate'}
                    </button>
                  ) : null}
                </div>

                {showRateForm && canCreateRate ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onCreateRate}>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Name</span>
                        <input value={rateForm.name} onChange={(event) => setRateForm((prev) => ({ ...prev, name: event.target.value }))} required />
                      </label>
                      <label>
                        <span>Code</span>
                        <input value={rateForm.code} onChange={(event) => setRateForm((prev) => ({ ...prev, code: event.target.value }))} required />
                      </label>
                    </div>
                    <div className="portal-entity-grid-3">
                      <label>
                        <span>Rate (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={rateForm.rate}
                          onChange={(event) => setRateForm((prev) => ({ ...prev, rate: event.target.value }))}
                          required
                        />
                      </label>
                      <label>
                        <span>Applies To</span>
                        <select value={rateForm.appliesTo} onChange={(event) => setRateForm((prev) => ({ ...prev, appliesTo: event.target.value as TaxApplication }))}>
                          {(['OUTPUT', 'INPUT', 'WITHHOLDING'] as TaxApplication[]).map((application) => (
                            <option key={application} value={application}>
                              {APPLICATION_LABELS[application]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>GL Account</span>
                        <select value={rateForm.glAccountId} onChange={(event) => setRateForm((prev) => ({ ...prev, glAccountId: event.target.value }))} required>
                          <option value="">Select account</option>
                          {glAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} — {account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Saving...' : 'Create Tax Rate'}
                    </button>
                  </form>
                ) : null}

                <div className="list-toolbar">
                  <ListSearch controls={rateControls} placeholder="Search tax rates…" />
                    <ListExport
                      rows={rateControls.filtered}
                      config={{
                        fileName: 'tax-rates',
                        columns: [
                          { header: 'Name', value: (row) => row.name },
                          { header: 'Code', value: (row) => row.code },
                          { header: 'Rate', value: (row) => Number(row.rate) },
                          { header: 'Applies To', value: (row) => row.appliesTo },
                        ],
                      }}
                    />
                </div>
                <div className="portal-list-stack">
                  {taxRates.length === 0 ? (
                    <div className="portal-empty-state">No tax rates configured yet.</div>
                  ) : (
                    rateControls.visible.map((rate) => (
                      <div key={rate.id} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>
                              {rate.name}
                              {!rate.isActive ? ' (inactive)' : ''}
                            </strong>
                            <p>
                              {rate.code} • {(Number(rate.rate) * 100).toFixed(2)}% • {APPLICATION_LABELS[rate.appliesTo]}
                            </p>
                            <p>Posts to {rate.glAccount?.code} — {rate.glAccount?.name}</p>
                          </div>
                          <span>{rate.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                        </div>
                        <div className="portal-action-row">
                          {canUpdateRate ? (
                            <button
                              type="button"
                              className="portal-inline-btn"
                              onClick={() =>
                                editingRateId === rate.id ? setEditingRateId(null) : startEditRate(rate)
                              }
                            >
                              {editingRateId === rate.id ? 'Cancel' : 'Edit'}
                            </button>
                          ) : null}
                          {canUpdateRate ? (
                            <button
                              type="button"
                              className="portal-inline-btn"
                              disabled={mutating}
                              onClick={() => void onToggleRateActive(rate)}
                            >
                              {rate.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          ) : null}
                          {canDeleteRate ? (
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDeleteRate(rate.id)}>
                              Delete
                            </button>
                          ) : null}
                        </div>

                        {editingRateId === rate.id && canUpdateRate ? (
                          <form className="portal-entity-form portal-inline-form" onSubmit={onUpdateRate}>
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>Name</span>
                                <input
                                  value={rateEditForm.name}
                                  onChange={(event) =>
                                    setRateEditForm((prev) => ({ ...prev, name: event.target.value }))
                                  }
                                  required
                                />
                              </label>
                              <label>
                                <span>Code</span>
                                <input
                                  value={rateEditForm.code}
                                  onChange={(event) =>
                                    setRateEditForm((prev) => ({ ...prev, code: event.target.value }))
                                  }
                                  required
                                />
                              </label>
                            </div>
                            <div className="portal-entity-grid-3">
                              <label>
                                <span>Rate (%)</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="0.01"
                                  value={rateEditForm.rate}
                                  onChange={(event) =>
                                    setRateEditForm((prev) => ({ ...prev, rate: event.target.value }))
                                  }
                                  required
                                />
                              </label>
                              <label>
                                <span>Applies To</span>
                                <select
                                  value={rateEditForm.appliesTo}
                                  onChange={(event) =>
                                    setRateEditForm((prev) => ({
                                      ...prev,
                                      appliesTo: event.target.value as TaxApplication,
                                    }))
                                  }
                                >
                                  {(['OUTPUT', 'INPUT', 'WITHHOLDING'] as TaxApplication[]).map((application) => (
                                    <option key={application} value={application}>
                                      {APPLICATION_LABELS[application]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>GL Account</span>
                                <select
                                  value={rateEditForm.glAccountId}
                                  onChange={(event) =>
                                    setRateEditForm((prev) => ({ ...prev, glAccountId: event.target.value }))
                                  }
                                  required
                                >
                                  <option value="">Select account</option>
                                  {glAccounts.map((account) => (
                                    <option key={account.id} value={account.id}>
                                      {account.code} — {account.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <div className="portal-check-row">
                              <label className="portal-check">
                                <input
                                  type="checkbox"
                                  checked={rateEditForm.isActive}
                                  onChange={(event) =>
                                    setRateEditForm((prev) => ({ ...prev, isActive: event.target.checked }))
                                  }
                                />
                                <span>Active</span>
                              </label>
                            </div>
                            <p className="portal-muted" style={{ margin: 0 }}>
                              Changes apply to future postings. Invoices already recorded keep the rate that
                              was in force when they were posted.
                            </p>
                            <div className="portal-inline-actions">
                              <button type="submit" className="portal-primary-btn" disabled={mutating}>
                                {mutating ? 'Saving...' : 'Save Changes'}
                              </button>
                              <button
                                type="button"
                                className="portal-ghost-btn"
                                onClick={() => setEditingRateId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
                <ListPager controls={rateControls} noun="tax rates" />
              </article>
            ) : null}

            {tab === 'remittances' ? (
              <article className="portal-card" data-tour="tax.remittances">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Tax Remittances</h2>
                  {canCreateRemittance ? (
                    <button type="button" className="portal-inline-btn" onClick={() => setShowRemittanceForm((prev) => !prev)}>
                      {showRemittanceForm ? 'Close' : 'Record Remittance'}
                    </button>
                  ) : null}
                </div>

                {showRemittanceForm && canCreateRemittance ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onCreateRemittance}>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Tax Rate</span>
                        <select
                          value={remittanceForm.taxRateId}
                          onChange={(event) => setRemittanceForm((prev) => ({ ...prev, taxRateId: event.target.value }))}
                          required
                        >
                          <option value="">Select tax rate</option>
                          {taxRates
                            .filter((rate) => rate.appliesTo !== 'INPUT')
                            .map((rate) => (
                              <option key={rate.id} value={rate.id}>
                                {rate.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        <span>Amount</span>
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={remittanceForm.amount}
                          onChange={(event) => setRemittanceForm((prev) => ({ ...prev, amount: event.target.value }))}
                          required
                        />
                      </label>
                    </div>
                    <div className="portal-entity-grid-3">
                      <label>
                        <span>Period Start</span>
                        <input
                          type="date"
                          value={remittanceForm.periodStart}
                          onChange={(event) => setRemittanceForm((prev) => ({ ...prev, periodStart: event.target.value }))}
                          required
                        />
                      </label>
                      <label>
                        <span>Period End</span>
                        <input
                          type="date"
                          value={remittanceForm.periodEnd}
                          onChange={(event) => setRemittanceForm((prev) => ({ ...prev, periodEnd: event.target.value }))}
                          required
                        />
                      </label>
                      <label>
                        <span>Reference (eSlip / KRA ref)</span>
                        <input value={remittanceForm.reference} onChange={(event) => setRemittanceForm((prev) => ({ ...prev, reference: event.target.value }))} />
                      </label>
                    </div>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Store (optional)</span>
                        <select value={remittanceForm.storeId} onChange={(event) => setRemittanceForm((prev) => ({ ...prev, storeId: event.target.value }))}>
                          <option value="">Company-wide</option>
                          {stores.map((store) => (
                            <option key={store.id} value={store.id}>
                              {store.code} — {store.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Pay From Account (optional)</span>
                        <select
                          value={remittanceForm.bankAccountId}
                          onChange={(event) => setRemittanceForm((prev) => ({ ...prev, bankAccountId: event.target.value }))}
                        >
                          <option value="">Auto-resolve from store / default</option>
                          {bankAccounts.map((bank) => (
                            <option key={bank.id} value={bank.id}>
                              {bank.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Recording...' : 'Record Remittance'}
                    </button>
                  </form>
                ) : null}

                <div className="list-toolbar">
                  <ServerListSearch pager={remittancesPager} placeholder="Search remittances…" />
                </div>

                <div className="portal-list-stack">
                  {!remittancesPager.loading && remittancesPager.items.length === 0 ? (
                    <div className="portal-empty-state">
                      {remittancesPager.search ? 'No remittances match.' : 'No remittances recorded yet.'}
                    </div>
                  ) : (
                    remittancesPager.items.map((remittance) => (
                      <div key={remittance.id} className="portal-list-row">
                        <div>
                          <strong>{remittance.remittanceNumber}</strong>
                          <p>
                            {(remittance.taxRate || taxRateMap.get((remittance as any).taxRateId))?.name} •{' '}
                            {formatDate(remittance.periodStart)} – {formatDate(remittance.periodEnd)}
                          </p>
                          <p>
                            {remittance.store?.name || 'Company-wide'} • {remittance.bankAccount?.name || '—'}
                            {remittance.reference ? ` • Ref ${remittance.reference}` : ''}
                          </p>
                        </div>
                        <span>{formatMoney(remittance.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
                <ServerListPager pager={remittancesPager} noun="remittances" />
              </article>
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
