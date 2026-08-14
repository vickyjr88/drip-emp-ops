"use client";

import Link from 'next/link';
import { useErrorState } from '../../components/notifications';
import { perSqftFromPerSqm } from '../../../lib/area';
import { TourLauncher } from '../../tours/tour-launcher';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  downloadFile,
  canReadRbacFor,
  formatDate,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../lib';

type ReportKey =
  | 'trial-balance'
  | 'general-ledger'
  | 'journal-listing'
  | 'profit-and-loss'
  | 'balance-sheet'
  | 'cash-flow'
  | 'ar-aging'
  | 'ap-aging'
  | 'project-cost'
  | 'project-profitability'
  | 'project-analytics'
  | 'tax';

const REPORTS: Array<{ key: ReportKey; label: string }> = [
  { key: 'project-cost', label: 'Project Cost' },
  { key: 'project-analytics', label: 'Project Analytics' },
  { key: 'trial-balance', label: 'Trial Balance' },
  { key: 'general-ledger', label: 'General Ledger' },
  { key: 'journal-listing', label: 'Journal Listing' },
  { key: 'profit-and-loss', label: 'Profit & Loss' },
  { key: 'balance-sheet', label: 'Balance Sheet' },
  { key: 'cash-flow', label: 'Cash Flow' },
  { key: 'ar-aging', label: 'AR Aging' },
  { key: 'ap-aging', label: 'AP Aging' },
  { key: 'project-profitability', label: 'Project Profitability' },
  { key: 'tax', label: 'Tax Report' },
];

/**
 * Journal listing has no projectId filter on the API, and project profitability
 * and analytics already break results down per project, so a scope picker would
 * be meaningless (or silently ignored) on these.
 */
const REPORTS_WITHOUT_PROJECT_SCOPE: ReportKey[] = ['journal-listing', 'project-profitability'];

/**
 * Reports the PDF endpoint can render. The other four in the picker are served
 * by different controllers and have no PDF route yet, so the download button is
 * hidden for them rather than offering something that fails.
 */
const PDF_REPORTS: ReportKey[] = [
  'profit-and-loss',
  'balance-sheet',
  'cash-flow',
  'ap-aging',
  'project-cost',
  'project-profitability',
  'project-analytics',
  'tax',
];

type ChartOfAccount = { id: string; code: string; name: string; type?: string };
type ProjectOption = { id: string; code: string; name: string };

export default function FinancialReportsPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const [activeReport, setActiveReport] = useState<ReportKey>('project-analytics');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [glAccountId, setGlAccountId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [reportDataKey, setReportDataKey] = useState<ReportKey | null>(null);

  const [budgetForm, setBudgetForm] = useState({ projectId: '', accountId: '', budgetAmount: '', periodStart: '', periodEnd: '' });
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const init = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      if (hasPermission(nextProfile, 'chart-of-account.read')) {
        const nextAccounts = await apiRequest<ChartOfAccount[]>('/chart-of-accounts', { method: 'GET' }, authToken);
        setAccounts(nextAccounts);
        setGlAccountId((prev) => prev || nextAccounts[0]?.id || '');
      }
      // Populates the scope picker. A missing project.read just leaves it on
      // "All projects" rather than failing the whole reports page.
      if (hasPermission(nextProfile, 'project.read')) {
        try {
          const nextProjects = await apiRequest<ProjectOption[]>('/projects', { method: 'GET' }, authToken);
          setProjects(Array.isArray(nextProjects) ? nextProjects : []);
        } catch {
          setProjects([]);
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load reports.');
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
    void init(token);
  }, [initialized, token, init]);

  /**
   * Downloads the current report as a PDF using the same filters on screen, so
   * the file matches what the user is looking at rather than a default period.
   */
  async function downloadReportPdf() {
    if (!token) return;
    setDownloadingPdf(true);
    setErrorMessage(null);
    try {
      const scopedProjectId = REPORTS_WITHOUT_PROJECT_SCOPE.includes(activeReport) ? '' : projectId;
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      // As-of reports read `asOf`; sending both is harmless and saves branching
      // on which kind this is.
      if (to) {
        params.set('to', to);
        params.set('asOf', to);
      }
      if (scopedProjectId) {
        params.set('projectId', scopedProjectId);
        const project = projects.find((entry) => entry.id === scopedProjectId);
        if (project) params.set('projectName', `${project.code} — ${project.name}`);
      }
      await downloadFile(
        `/reports/${activeReport}/pdf?${params.toString()}`,
        token,
        `${activeReport}.pdf`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not download the PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  }

  const runReport = useCallback(async () => {
    if (!token) return;
    const reportKeyAtRequestTime = activeReport;
    setReportLoading(true);
    setErrorMessage(null);
    try {
      // Scope applies to every report that supports it; the two exceptions are
      // listed in REPORTS_WITHOUT_PROJECT_SCOPE.
      const scopedProjectId = REPORTS_WITHOUT_PROJECT_SCOPE.includes(activeReport) ? '' : projectId;

      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (scopedProjectId) params.set('projectId', scopedProjectId);

      // For as-of reports the date lives in `asOf` rather than `to`.
      const asOfParams = new URLSearchParams();
      if (to) asOfParams.set('asOf', to);
      if (scopedProjectId) asOfParams.set('projectId', scopedProjectId);
      const asOfQuery = asOfParams.toString() ? `?${asOfParams.toString()}` : '';

      let path = '';
      switch (activeReport) {
        case 'trial-balance':
          path = `/reports/trial-balance${asOfQuery}`;
          break;
        case 'general-ledger':
          if (!glAccountId) {
            setReportData(null);
            setReportDataKey(null);
            setReportLoading(false);
            return;
          }
          path = `/reports/general-ledger/${glAccountId}?${params.toString()}`;
          break;
        case 'journal-listing':
          path = `/journal-entries?${params.toString()}`;
          break;
        case 'profit-and-loss':
          path = `/reports/profit-and-loss?${params.toString()}`;
          break;
        case 'balance-sheet':
          path = `/reports/balance-sheet${asOfQuery}`;
          break;
        case 'cash-flow':
          path = `/reports/cash-flow?${params.toString()}`;
          break;
        case 'ar-aging':
          path = `/invoices/reports/aging${asOfQuery}`;
          break;
        case 'ap-aging':
          path = `/reports/ap-aging${asOfQuery}`;
          break;
        case 'project-cost':
          if (!scopedProjectId) {
            // The report is meaningless company-wide: it answers what one
            // project has cost.
            setReportData(null);
            setReportDataKey(null);
            setReportLoading(false);
            return;
          }
          path = `/reports/project-cost?${params.toString()}`;
          break;
        case 'project-profitability':
          path = `/reports/project-profitability?${params.toString()}`;
          break;
        case 'project-analytics':
          path = `/reports/project-analytics?${params.toString()}`;
          break;
        case 'tax':
          path = `/reports/tax?${params.toString()}`;
          break;
      }

      const data = await apiRequest<any>(path, { method: 'GET' }, token);
      setReportData(data);
      setReportDataKey(reportKeyAtRequestTime);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load report.');
      setReportData(null);
      setReportDataKey(null);
    } finally {
      setReportLoading(false);
    }
  }, [token, activeReport, from, to, glAccountId, projectId]);

  useEffect(() => {
    if (!token || !profile) return;
    void runReport();
    // Re-runs on scope change too, so switching project reflects immediately
    // without needing to press Run Report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, profile, activeReport, projectId]);

  const canManageBudgets = hasPermission(profile, 'project-budget.create');
  // Budgets are expense plans, so offering revenue/asset accounts here would
  // only produce variance rows that can never be meaningful.
  const expenseAccounts = useMemo(() => accounts.filter((account) => account.type === 'EXPENSE'), [accounts]);

  async function onCreateBudget() {
    if (!token || budgetSaving) return;
    if (!budgetForm.projectId || !budgetForm.accountId || !budgetForm.budgetAmount) {
      setBudgetError('Project, account and amount are all required.');
      return;
    }

    setBudgetSaving(true);
    setBudgetError(null);
    try {
      await apiRequest(
        '/project-budgets',
        {
          method: 'POST',
          body: JSON.stringify({
            projectId: budgetForm.projectId,
            accountId: budgetForm.accountId,
            budgetAmount: Number(budgetForm.budgetAmount),
            periodStart: budgetForm.periodStart || undefined,
            periodEnd: budgetForm.periodEnd || undefined,
          }),
        },
        token,
      );
      setBudgetForm({ projectId: '', accountId: '', budgetAmount: '', periodStart: '', periodEnd: '' });
      await runReport();
    } catch (error) {
      setBudgetError(error instanceof Error ? error.message : 'Unable to save the budget.');
    } finally {
      setBudgetSaving(false);
    }
  }

  async function onDeleteBudget(budgetId: string) {
    if (!token || budgetSaving) return;
    setBudgetSaving(true);
    setBudgetError(null);
    try {
      await apiRequest(`/project-budgets/${budgetId}`, { method: 'DELETE' }, token);
      await runReport();
    } catch (error) {
      setBudgetError(error instanceof Error ? error.message : 'Unable to delete the budget.');
    } finally {
      setBudgetSaving(false);
    }
  }

  const roleLabel = useMemo(() => roleLabelFor(profile), [profile]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading financial reports...</article>
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
            pageTitle="Financial Reports"
            pageSubtitle="Project analytics plus Trial Balance, General Ledger, P&L, Balance Sheet, Cash Flow, Aging and Tax — company-wide or scoped to a single project."
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <Link href="/portal/accounting" className="portal-ghost-btn">
                Back to Accounting
              </Link>
            </div>


            <div className="portal-action-row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
              {REPORTS.map((report) => (
                <button
                  key={report.key}
                  type="button"
                  className={`portal-inline-btn${activeReport === report.key ? ' is-active' : ''}`}
                  onClick={() => setActiveReport(report.key)}
                >
                  {report.label}
                </button>
              ))}
            </div>

            <article className="portal-card">
              <div className="portal-entity-form" style={{ marginBottom: 16 }}>
                <div className="portal-entity-grid-3">
                  {activeReport !== 'trial-balance' && activeReport !== 'balance-sheet' && activeReport !== 'ar-aging' && activeReport !== 'ap-aging' ? (
                    <label>
                      <span>From</span>
                      <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                    </label>
                  ) : null}
                  <label>
                    <span>{activeReport === 'balance-sheet' || activeReport === 'trial-balance' || activeReport === 'ar-aging' || activeReport === 'ap-aging' ? 'As Of' : 'To'}</span>
                    <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                  </label>
                  {activeReport === 'general-ledger' ? (
                    <label>
                      <span>Account</span>
                      <select value={glAccountId} onChange={(event) => setGlAccountId(event.target.value)}>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} — {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {!REPORTS_WITHOUT_PROJECT_SCOPE.includes(activeReport) ? (
                    <label>
                      <span>Project</span>
                      <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                        <option value="">All projects</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.code} — {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button type="button" className="portal-inline-btn" disabled={reportLoading} onClick={() => void runReport()}>
                      {reportLoading ? 'Loading...' : 'Run Report'}
                    </button>
                    {PDF_REPORTS.includes(activeReport) ? (
                      <button
                        type="button"
                        className="portal-inline-btn"
                        style={{ marginLeft: 8 }}
                        disabled={downloadingPdf || reportLoading}
                        onClick={() => void downloadReportPdf()}
                      >
                        {downloadingPdf ? 'Preparing...' : 'Download PDF'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {reportLoading ? (
                <div className="portal-empty-state">Loading report...</div>
              ) : activeReport === 'project-cost' && !projectId ? (
                <div className="portal-empty-state">
                  Choose a project above to see what it has cost.
                </div>
              ) : !reportData || reportDataKey !== activeReport ? (
                <div className="portal-empty-state">No data for this report yet.</div>
              ) : (
                <>
                  {/* Caveats the API attaches to project-scoped cuts (e.g. that a
                      per-project balance sheet is not expected to balance). */}
                  {reportData.note ? (
                    <p className="portal-muted" style={{ marginTop: 0 }}>
                      {reportData.note}
                    </p>
                  ) : null}
                  <ReportView reportKey={activeReport} data={reportData} onDeleteBudget={canManageBudgets ? onDeleteBudget : undefined} />
                </>
              )}
            </article>

            {activeReport === 'project-analytics' && canManageBudgets ? (
              <article className="portal-card" style={{ marginTop: 16 }} data-tour="reports.budget">
                <h2 style={{ margin: '0 0 8px' }}>Set a Project Budget</h2><TourLauncher tour="read-the-reports" />
                <p className="portal-muted" style={{ margin: '0 0 12px' }}>
                  Budget an expense account for a project. Actuals are read from posted journal lines tagged with that
                  project, so the variance always tracks the ledger. Leave the dates blank to budget the whole project.
                </p>
                {budgetError ? <div className="portal-error" style={{ marginBottom: 12 }}>{budgetError}</div> : null}
                <div className="portal-entity-form">
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Project</span>
                      <select
                        value={budgetForm.projectId}
                        onChange={(event) => setBudgetForm((prev) => ({ ...prev, projectId: event.target.value }))}
                      >
                        <option value="">Select project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.code} — {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Expense Account</span>
                      <select
                        value={budgetForm.accountId}
                        onChange={(event) => setBudgetForm((prev) => ({ ...prev, accountId: event.target.value }))}
                      >
                        <option value="">Select account</option>
                        {expenseAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} — {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Budget Amount</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={budgetForm.budgetAmount}
                        onChange={(event) => setBudgetForm((prev) => ({ ...prev, budgetAmount: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Period Start (optional)</span>
                      <input
                        type="date"
                        value={budgetForm.periodStart}
                        onChange={(event) => setBudgetForm((prev) => ({ ...prev, periodStart: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Period End (optional)</span>
                      <input
                        type="date"
                        value={budgetForm.periodEnd}
                        onChange={(event) => setBudgetForm((prev) => ({ ...prev, periodEnd: event.target.value }))}
                      />
                    </label>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button
                        type="button"
                        className="portal-primary-btn"
                        disabled={budgetSaving}
                        onClick={() => void onCreateBudget()}
                      >
                        {budgetSaving ? 'Saving...' : 'Save Budget'}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}

const EMPTY_BUCKETS = { current: 0, days30: 0, days60: 0, days90: 0, days90plus: 0 };

/** Ratios come back null when the denominator is zero, which is not the same as 0%. */
function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value}%`;
}

function ProjectAnalyticsView({ data, onDeleteBudget }: { data: any; onDeleteBudget?: (budgetId: string) => void }) {
  const rows: any[] = data.rows || [];
  const totals = data.totals || {};

  if (rows.length === 0) {
    return <div className="portal-empty-state">No projects to analyse yet.</div>;
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Portfolio Totals</h3>
      <div className="portal-detail-stats" style={{ marginBottom: 8 }}>
        <div>
          <span>Revenue</span>
          <strong>{formatMoney(totals.revenue || 0)}</strong>
        </div>
        <div>
          <span>Expenses</span>
          <strong>{formatMoney(totals.expenses || 0)}</strong>
        </div>
        <div>
          <span>Profit</span>
          <strong>{formatMoney(totals.profit || 0)}</strong>
        </div>
        <div>
          <span>Margin</span>
          <strong>{formatPercent(totals.marginPercent)}</strong>
        </div>
        <div>
          <span>Units Sold</span>
          <strong>
            {totals.unitsSold || 0} / {totals.unitsTotal || 0}
          </strong>
        </div>
        <div>
          <span>Absorption</span>
          <strong>{formatPercent(totals.absorptionPercent)}</strong>
        </div>
        <div>
          <span>Collected</span>
          <strong>{formatMoney(totals.collected || 0)}</strong>
        </div>
        <div>
          <span>Outstanding</span>
          <strong>{formatMoney(totals.outstanding || 0)}</strong>
        </div>
      </div>
      <p className="portal-muted" style={{ marginTop: 0, marginBottom: 24 }}>
        Figures cover journal lines tagged with a project. Untagged activity is excluded, so these totals can be lower
        than the company-wide reports.
      </p>

      {rows.map((row) => (
        <article key={row.projectId} className="portal-card" style={{ marginBottom: 16 }}>
          <div className="portal-card-header-row">
            <h3 style={{ margin: 0 }}>
              {row.projectName} <span className="portal-muted">({row.projectCode})</span>
            </h3>
            <Link href={`/portal/projects/${row.projectId}`} className="portal-inline-btn">
              Open Project
            </Link>
          </div>

          <h4 style={{ marginBottom: 8 }}>Profitability</h4>
          <div className="portal-detail-stats" style={{ marginBottom: 16 }}>
            <div>
              <span>Revenue</span>
              <strong>{formatMoney(row.revenue)}</strong>
            </div>
            <div>
              <span>Expenses</span>
              <strong>{formatMoney(row.expenses)}</strong>
            </div>
            <div>
              <span>Profit</span>
              <strong>{formatMoney(row.profit)}</strong>
            </div>
            <div>
              <span>Margin</span>
              <strong>{formatPercent(row.marginPercent)}</strong>
            </div>
          </div>

          <h4 style={{ marginBottom: 8 }}>Sales & Absorption</h4>
          <div className="portal-detail-stats" style={{ marginBottom: 16 }}>
            <div>
              <span>Units</span>
              <strong>{row.unitsTotal}</strong>
            </div>
            <div>
              <span>Sold</span>
              <strong>{row.unitsSold}</strong>
            </div>
            <div>
              <span>Reserved</span>
              <strong>{row.unitsReserved}</strong>
            </div>
            <div>
              <span>Available</span>
              <strong>{row.unitsAvailable}</strong>
            </div>
            <div>
              <span>Absorption</span>
              <strong>{formatPercent(row.absorptionPercent)}</strong>
            </div>
            <div>
              <span>Avg Unit Price</span>
              <strong>{row.averageUnitPrice === null ? '—' : formatMoney(row.averageUnitPrice)}</strong>
            </div>
            <div>
              <span>Avg Price / sq ft</span>
              <strong>
                {row.averagePricePerSqm === null
                  ? '—'
                  : formatMoney(perSqftFromPerSqm(row.averagePricePerSqm))}
              </strong>
            </div>
            <div>
              <span>Contract Value</span>
              <strong>{formatMoney(row.contractValue)}</strong>
            </div>
          </div>

          <h4 style={{ marginBottom: 8 }}>Collections</h4>
          <div className="portal-detail-stats" style={{ marginBottom: 16 }}>
            <div>
              <span>Invoiced</span>
              <strong>{formatMoney(row.invoiced)}</strong>
            </div>
            <div>
              <span>Collected</span>
              <strong>{formatMoney(row.collected)}</strong>
            </div>
            <div>
              <span>Outstanding</span>
              <strong>{formatMoney(row.outstanding)}</strong>
            </div>
            <div>
              <span>Collection Rate</span>
              <strong>{formatPercent(row.collectionRatePercent)}</strong>
            </div>
            <div>
              <span>Contract Collected</span>
              <strong>{formatMoney(row.contractCollected)}</strong>
            </div>
            <div>
              <span>Contract Outstanding</span>
              <strong>{formatMoney(row.contractOutstanding)}</strong>
            </div>
          </div>

          <h4 style={{ marginBottom: 8 }}>Budget vs Actual</h4>
          {(row.budgetLines || []).length === 0 ? (
            <div className="portal-empty-state">
              No budget set for this project. Add one to track spend against plan.
            </div>
          ) : (
            <>
              <div className="portal-detail-stats" style={{ marginBottom: 12 }}>
                <div>
                  <span>Budgeted</span>
                  <strong>{formatMoney(row.totalBudgeted)}</strong>
                </div>
                <div>
                  <span>Actual</span>
                  <strong>{formatMoney(row.budgetedActual)}</strong>
                </div>
                <div>
                  <span>Variance</span>
                  <strong>{formatMoney(row.budgetVariance)}</strong>
                </div>
                <div>
                  <span>Utilisation</span>
                  <strong>{formatPercent(row.budgetUtilisationPercent)}</strong>
                </div>
              </div>
              <div className="portal-list-stack">
                {row.budgetLines.map((line: any) => (
                  <div key={line.budgetId} className="portal-list-row">
                    <div>
                      <strong>
                        {line.accountCode} — {line.accountName}
                      </strong>
                      <p>
                        {line.periodStart || line.periodEnd
                          ? `${formatDate(line.periodStart)} → ${formatDate(line.periodEnd)}`
                          : 'Whole project'}
                      </p>
                    </div>
                    <span>Budget {formatMoney(line.budgeted)}</span>
                    <span>Actual {formatMoney(line.actual)}</span>
                    {/* Negative variance means the line is over budget. */}
                    <span className={line.variance < 0 ? 'portal-error' : undefined}>
                      {line.variance < 0 ? 'Over by ' : 'Under by '}
                      {formatMoney(Math.abs(line.variance))}
                    </span>
                    {onDeleteBudget ? (
                      <button
                        type="button"
                        className="portal-inline-btn is-danger"
                        onClick={() => onDeleteBudget(line.budgetId)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}

function ReportView({
  reportKey,
  data: rawData,
  onDeleteBudget,
}: {
  reportKey: ReportKey;
  data: any;
  onDeleteBudget?: (budgetId: string) => void;
}) {
  const data = rawData || {};
  switch (reportKey) {
    case 'project-cost': {
      const groups = data.groups || [];
      if (!groups.length) {
        return (
          <div className="portal-empty-state">
            No project cost accounts are configured yet. Add expense accounts with a parent account to
            build the cost structure.
          </div>
        );
      }
      return (
        <div>
          {groups.map((group: any) => (
            <div key={group.accountId} style={{ marginBottom: 22 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 15, letterSpacing: '0.04em' }}>
                {group.code} — {group.name.toUpperCase()}
              </h3>
              <div className="portal-list-stack">
                {(group.categories || []).map((category: any) => (
                  <div key={category.accountId} className="portal-list-row">
                    <div>
                      <strong>{category.name}</strong>
                      <p>{category.code}</p>
                    </div>
                    <span>{formatMoney(category.amount)}</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: '10px 0 0', fontWeight: 700, textAlign: 'right' }}>
                {group.name} subtotal {formatMoney(group.subtotal)}
              </p>
            </div>
          ))}

          {(data.ungrouped || []).length ? (
            <div style={{ marginBottom: 22 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>OUTSIDE THE PROJECT COST STRUCTURE</h3>
              <p className="portal-muted" style={{ margin: '0 0 10px' }}>
                Posted to expense accounts that sit outside the construction and management groups. Move
                these to the right category from the General Ledger if they belong to this project.
              </p>
              <div className="portal-list-stack">
                {data.ungrouped.map((row: any) => (
                  <div key={row.accountId} className="portal-list-row">
                    <div>
                      <strong>{row.name}</strong>
                      <p>{row.code}</p>
                    </div>
                    <span>{formatMoney(row.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <p style={{ marginTop: 16, fontWeight: 700, fontSize: 16, textAlign: 'right' }}>
            Total project cost {formatMoney(data.grandTotal || 0)}
          </p>

          {data.reconciliation ? (
            <div className="portal-record" style={{ marginTop: 16 }}>
              <strong>Reconciliation</strong>
              <p className="portal-muted" style={{ margin: '4px 0 8px' }}>
                Use these when checking a completed data-entry run against your source records.
              </p>
              <div className="portal-info-list">
                <div className="portal-info-row">
                  <span>Postings included</span>
                  <strong>
                    {data.reconciliation.lineCount} lines across {data.reconciliation.entryCount} entries
                  </strong>
                </div>
                <div className="portal-info-row">
                  <span>Expense with no project</span>
                  <strong>
                    {data.reconciliation.untaggedExpenseLines === 0
                      ? 'None'
                      : `${data.reconciliation.untaggedExpenseLines} lines — ${formatMoney(
                          data.reconciliation.untaggedExpenseAmount,
                        )}`}
                  </strong>
                </div>
              </div>
              {data.reconciliation.untaggedExpenseLines > 0 ? (
                <p className="portal-muted" style={{ margin: '8px 0 0' }}>
                  These are not counted here or against any other project, and are the usual reason a
                  total does not tally. Recategorise them from the General Ledger.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }

    case 'trial-balance':
      return (
        <div>
          <div className="portal-list-stack">
            {(data.rows || []).map((row: any) => (
              <div key={row.accountId} className="portal-list-row">
                <div>
                  <strong>
                    {row.code} — {row.name}
                  </strong>
                  <p>{row.type}</p>
                </div>
                <span>{row.debit > 0 ? formatMoney(row.debit) : ''}</span>
                <span>{row.credit > 0 ? formatMoney(row.credit) : ''}</span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 16, fontWeight: 700 }}>
            Total debits {formatMoney(data.totalDebit || 0)} — Total credits {formatMoney(data.totalCredit || 0)}
            {Math.abs((data.totalDebit || 0) - (data.totalCredit || 0)) < 0.01 ? ' (balanced)' : ' (NOT balanced)'}
          </p>
        </div>
      );

    case 'general-ledger': {
      if (!data.account) {
        return <div className="portal-empty-state">No data for this report yet.</div>;
      }
      const glRows = data.rows || [];
      return (
        <div>
          <h3 style={{ marginTop: 0 }}>
            {data.account.code} — {data.account.name}
          </h3>
          <div className="portal-list-stack">
            {glRows.length === 0 ? (
              <div className="portal-empty-state">No activity in this period.</div>
            ) : (
              glRows.map((row: any, index: number) => (
                <div key={index} className="portal-list-row">
                  <div>
                    <strong>{row.entryNumber}</strong>
                    <p>
                      {formatDate(row.date)} • {row.memo || 'No memo'}
                    </p>
                  </div>
                  <span>{row.debit > 0 ? formatMoney(row.debit) : ''}</span>
                  <span>{row.credit > 0 ? formatMoney(row.credit) : ''}</span>
                  <span>Bal: {formatMoney(row.balance)}</span>
                </div>
              ))
            )}
          </div>
          <p style={{ marginTop: 16, fontWeight: 700 }}>Closing balance: {formatMoney(data.closingBalance || 0)}</p>
        </div>
      );
    }

    case 'journal-listing': {
      // The endpoint returns a paged {items,total}; tolerate a bare array too.
      const entries: any[] = Array.isArray(rawData) ? rawData : rawData?.items || [];
      return (
        <div className="portal-list-stack">
          {entries.length === 0 ? (
            <div className="portal-empty-state">No journal entries.</div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="portal-list-row">
                <div>
                  <strong>{entry.entryNumber}</strong>
                  <p>
                    {entry.source} • {formatDate(entry.entryDate)} • {entry.memo || 'No memo'}
                  </p>
                </div>
                <span>{entry.status}</span>
                <span>{entry.lines?.length || 0} lines</span>
              </div>
            ))
          )}
        </div>
      );
    }

    case 'profit-and-loss': {
      const revenue = data.revenue || [];
      const expenses = data.expenses || [];
      return (
        <div>
          <h3 style={{ marginTop: 0 }}>Revenue</h3>
          <div className="portal-list-stack">
            {revenue.map((row: any) => (
              <div key={row.code} className="portal-list-row">
                <span>
                  {row.code} — {row.name}
                </span>
                <span>{formatMoney(row.amount)}</span>
              </div>
            ))}
          </div>
          <h3>Expenses</h3>
          <div className="portal-list-stack">
            {expenses.map((row: any) => (
              <div key={row.code} className="portal-list-row">
                <span>
                  {row.code} — {row.name}
                </span>
                <span>{formatMoney(row.amount)}</span>
              </div>
            ))}
          </div>
          <div className="portal-detail-stats" style={{ marginTop: 16 }}>
            <div>
              <span>Total Revenue</span>
              <strong>{formatMoney(data.totalRevenue || 0)}</strong>
            </div>
            <div>
              <span>Total Expenses</span>
              <strong>{formatMoney(data.totalExpenses || 0)}</strong>
            </div>
            <div>
              <span>Net Income</span>
              <strong>{formatMoney(data.netIncome || 0)}</strong>
            </div>
          </div>
        </div>
      );
    }

    case 'balance-sheet': {
      const assets = data.assets || [];
      const liabilities = data.liabilities || [];
      const equity = data.equity || [];
      return (
        <div>
          <h3 style={{ marginTop: 0 }}>Assets</h3>
          <div className="portal-list-stack">
            {assets.map((row: any) => (
              <div key={row.code} className="portal-list-row">
                <span>
                  {row.code} — {row.name}
                </span>
                <span>{formatMoney(row.amount)}</span>
              </div>
            ))}
          </div>
          <h3>Liabilities</h3>
          <div className="portal-list-stack">
            {liabilities.length === 0 ? (
              <div className="portal-empty-state">None.</div>
            ) : (
              liabilities.map((row: any) => (
                <div key={row.code} className="portal-list-row">
                  <span>
                    {row.code} — {row.name}
                  </span>
                  <span>{formatMoney(row.amount)}</span>
                </div>
              ))
            )}
          </div>
          <h3>Equity</h3>
          <div className="portal-list-stack">
            {equity.map((row: any) => (
              <div key={row.code} className="portal-list-row">
                <span>
                  {row.code} — {row.name}
                </span>
                <span>{formatMoney(row.amount)}</span>
              </div>
            ))}
            <div className="portal-list-row">
              <span>Retained Earnings (current period)</span>
              <span>{formatMoney(data.retainedEarnings || 0)}</span>
            </div>
          </div>
          <div className="portal-detail-stats" style={{ marginTop: 16 }}>
            <div>
              <span>Total Assets</span>
              <strong>{formatMoney(data.totalAssets || 0)}</strong>
            </div>
            <div>
              <span>Total Liabilities + Equity</span>
              <strong>{formatMoney((data.totalLiabilities || 0) + (data.totalEquity || 0))}</strong>
            </div>
            <div>
              <span>Balanced</span>
              {/* null when scoped to a project, where balancing is not expected. */}
              <strong>{data.balanced === null || data.balanced === undefined ? 'N/A' : data.balanced ? 'Yes' : 'No'}</strong>
            </div>
          </div>
        </div>
      );
    }

    case 'cash-flow':
      return (
        <div className="portal-detail-stats">
          <div>
            <span>Net Income</span>
            <strong>{formatMoney(data.netIncome || 0)}</strong>
          </div>
          <div>
            <span>Add Back: Depreciation</span>
            <strong>{formatMoney(data.addBackDepreciation || 0)}</strong>
          </div>
          <div>
            <span>Approx. Operating Cash Flow</span>
            <strong>{formatMoney(data.operatingCashFlowApprox || 0)}</strong>
          </div>
          <div>
            <span>Net Cash Movement (actual)</span>
            <strong>{formatMoney(data.netCashMovement || 0)}</strong>
          </div>
        </div>
      );

    case 'ar-aging':
    case 'ap-aging': {
      const buckets = data.buckets || EMPTY_BUCKETS;
      const agingRows = data.rows || [];
      return (
        <div>
          <div className="portal-detail-stats" style={{ marginBottom: 16 }}>
            <div>
              <span>Current</span>
              <strong>{formatMoney(buckets.current)}</strong>
            </div>
            <div>
              <span>1-30</span>
              <strong>{formatMoney(buckets.days30)}</strong>
            </div>
            <div>
              <span>31-60</span>
              <strong>{formatMoney(buckets.days60)}</strong>
            </div>
            <div>
              <span>61-90</span>
              <strong>{formatMoney(buckets.days90)}</strong>
            </div>
            <div>
              <span>90+</span>
              <strong>{formatMoney(buckets.days90plus)}</strong>
            </div>
          </div>
          <div className="portal-list-stack">
            {agingRows.length === 0 ? (
              <div className="portal-empty-state">Nothing outstanding.</div>
            ) : (
              agingRows.map((row: any) => (
                <div key={row.invoiceId || row.supplierInvoiceId} className="portal-list-row">
                  <div>
                    <strong>{row.invoiceNumber}</strong>
                    <p>{row.customerName || row.supplierName}</p>
                  </div>
                  <span>{row.daysOverdue > 0 ? `${row.daysOverdue}d overdue` : 'Not due'}</span>
                  <span>{formatMoney(row.balance)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    case 'project-analytics':
      return <ProjectAnalyticsView data={data} onDeleteBudget={onDeleteBudget} />;

    case 'project-profitability': {
      const profitabilityRows = data.rows || [];
      return (
        <div className="portal-list-stack">
          {profitabilityRows.length === 0 ? (
            <div className="portal-empty-state">No project-scoped activity in this period.</div>
          ) : (
            profitabilityRows.map((row: any) => (
              <div key={row.projectId} className="portal-list-row">
                <div>
                  <strong>{row.projectName}</strong>
                </div>
                <span>Rev {formatMoney(row.revenue)}</span>
                <span>Exp {formatMoney(row.expenses)}</span>
                <span>Profit {formatMoney(row.profit)}</span>
              </div>
            ))
          )}
        </div>
      );
    }

    case 'tax':
      return (
        <div>
          {data.note ? <p className="portal-muted">{data.note}</p> : null}
          <div className="portal-detail-stats">
            <div>
              <span>VAT Output</span>
              <strong>{formatMoney(data.vatOutput || 0)}</strong>
            </div>
            <div>
              <span>VAT Input</span>
              <strong>{formatMoney(data.vatInput || 0)}</strong>
            </div>
            <div>
              <span>Net VAT Payable</span>
              <strong>{formatMoney(data.netVatPayable || 0)}</strong>
            </div>
            <div>
              <span>Withholding Tax Payable</span>
              <strong>{formatMoney(data.withholdingTaxPayable || 0)}</strong>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
