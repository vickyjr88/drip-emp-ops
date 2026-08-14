"use client";

import Link from 'next/link';
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

type Project = { id: string; code: string; name: string };
type BankAccount = { id: string; name: string; currencyCode: string };

type TaxRemittance = {
  id: string;
  remittanceNumber: string;
  taxRate: TaxRate;
  bankAccount?: BankAccount | null;
  project?: Project | null;
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [tab, setTab] = useState<TaxTab>('rates');

  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [glAccounts, setGlAccounts] = useState<ChartOfAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [remittances, setRemittances] = useState<TaxRemittance[]>([]);

  const [showRateForm, setShowRateForm] = useState(false);
  const [rateForm, setRateForm] = useState({ name: '', code: '', rate: '', appliesTo: 'OUTPUT' as TaxApplication, glAccountId: '' });

  const [showRemittanceForm, setShowRemittanceForm] = useState(false);
  const [remittanceForm, setRemittanceForm] = useState({
    taxRateId: '',
    bankAccountId: '',
    projectId: '',
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
      const [nextRates, nextAccounts, nextProjects, nextBanks, nextRemittances] = await Promise.all([
        hasPermission(nextProfile, 'tax-rate.read')
          ? apiRequest<TaxRate[]>('/tax-rates', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'chart-of-account.read')
          ? apiRequest<ChartOfAccount[]>('/chart-of-accounts', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'project.read')
          ? apiRequest<Project[]>('/projects', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'bank-account.read')
          ? apiRequest<BankAccount[]>('/bank-accounts', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'tax-remittance.read')
          ? apiRequest<TaxRemittance[]>('/tax-remittances?take=50', { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);
      setProfile(nextProfile);
      setTaxRates(nextRates);
      setGlAccounts(nextAccounts);
      setProjects(nextProjects);
      setBankAccounts(nextBanks);
      setRemittances(nextRemittances);
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

  const canCreateRate = hasPermission(profile, 'tax-rate.create');
  const canDeleteRate = hasPermission(profile, 'tax-rate.delete');
  const canCreateRemittance = hasPermission(profile, 'tax-remittance.create');

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Operation failed.');
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
            projectId: remittanceForm.projectId || undefined,
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
      setRemittanceForm({ taxRateId: '', bankAccountId: '', projectId: '', amount: '', periodStart: '', periodEnd: '', reference: '' });
    }, 'Remittance recorded.');
  }

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

            {feedback ? <article className="portal-card portal-feedback">{feedback}</article> : null}
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <button type="button" className={`portal-inline-btn${tab === 'rates' ? ' is-active' : ''}`} onClick={() => setTab('rates')}>
                Tax Rates
              </button>
              <button type="button" className={`portal-inline-btn${tab === 'remittances' ? ' is-active' : ''}`} onClick={() => setTab('remittances')}>
                Remittances
              </button>
            </div>

            {tab === 'rates' ? (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Tax Rates</h2>
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

                <div className="portal-list-stack">
                  {taxRates.length === 0 ? (
                    <div className="portal-empty-state">No tax rates configured yet.</div>
                  ) : (
                    taxRates.map((rate) => (
                      <div key={rate.id} className="portal-list-row">
                        <div>
                          <strong>{rate.name}</strong>
                          <p>
                            {rate.code} • {(Number(rate.rate) * 100).toFixed(2)}% • {APPLICATION_LABELS[rate.appliesTo]}
                          </p>
                          <p>Posts to {rate.glAccount?.code} — {rate.glAccount?.name}</p>
                        </div>
                        {canDeleteRate ? (
                          <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDeleteRate(rate.id)}>
                            Delete
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </article>
            ) : null}

            {tab === 'remittances' ? (
              <article className="portal-card">
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
                        <span>Project (optional)</span>
                        <select value={remittanceForm.projectId} onChange={(event) => setRemittanceForm((prev) => ({ ...prev, projectId: event.target.value }))}>
                          <option value="">Company-wide</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.code} — {project.name}
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
                          <option value="">Auto-resolve from project / default</option>
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

                <div className="portal-list-stack">
                  {remittances.length === 0 ? (
                    <div className="portal-empty-state">No remittances recorded yet.</div>
                  ) : (
                    remittances.map((remittance) => (
                      <div key={remittance.id} className="portal-list-row">
                        <div>
                          <strong>{remittance.remittanceNumber}</strong>
                          <p>
                            {(remittance.taxRate || taxRateMap.get((remittance as any).taxRateId))?.name} •{' '}
                            {formatDate(remittance.periodStart)} – {formatDate(remittance.periodEnd)}
                          </p>
                          <p>
                            {remittance.project?.name || 'Company-wide'} • {remittance.bankAccount?.name || '—'}
                            {remittance.reference ? ` • Ref ${remittance.reference}` : ''}
                          </p>
                        </div>
                        <span>{formatMoney(remittance.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
