"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
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

type ReportKey =
  | 'trial-balance'
  | 'general-ledger'
  | 'journal-listing'
  | 'profit-and-loss'
  | 'balance-sheet'
  | 'cash-flow'
  | 'ar-aging'
  | 'ap-aging'
  | 'project-profitability'
  | 'tax';

const REPORTS: Array<{ key: ReportKey; label: string }> = [
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

type ChartOfAccount = { id: string; code: string; name: string };

export default function FinancialReportsPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);

  const [activeReport, setActiveReport] = useState<ReportKey>('trial-balance');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [glAccountId, setGlAccountId] = useState('');
  const [reportData, setReportData] = useState<any>(null);
  const [reportDataKey, setReportDataKey] = useState<ReportKey | null>(null);

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

  const runReport = useCallback(async () => {
    if (!token) return;
    const reportKeyAtRequestTime = activeReport;
    setReportLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      let path = '';
      switch (activeReport) {
        case 'trial-balance':
          path = `/reports/trial-balance${to ? `?asOf=${to}` : ''}`;
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
          path = `/reports/balance-sheet${to ? `?asOf=${to}` : ''}`;
          break;
        case 'cash-flow':
          path = `/reports/cash-flow?${params.toString()}`;
          break;
        case 'ar-aging':
          path = `/invoices/reports/aging${to ? `?asOf=${to}` : ''}`;
          break;
        case 'ap-aging':
          path = `/reports/ap-aging${to ? `?asOf=${to}` : ''}`;
          break;
        case 'project-profitability':
          path = `/reports/project-profitability?${params.toString()}`;
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
  }, [token, activeReport, from, to, glAccountId]);

  useEffect(() => {
    if (!token || !profile) return;
    void runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, profile, activeReport]);

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
            active="accounting"
            pageTitle="Financial Reports"
            pageSubtitle="Trial Balance, General Ledger, P&L, Balance Sheet, Cash Flow, Aging, Project Profitability, Tax."
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

            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

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
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button type="button" className="portal-inline-btn" disabled={reportLoading} onClick={() => void runReport()}>
                      {reportLoading ? 'Loading...' : 'Run Report'}
                    </button>
                  </div>
                </div>
              </div>

              {reportLoading ? (
                <div className="portal-empty-state">Loading report...</div>
              ) : !reportData || reportDataKey !== activeReport ? (
                <div className="portal-empty-state">No data for this report yet.</div>
              ) : (
                <ReportView reportKey={activeReport} data={reportData} />
              )}
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}

const EMPTY_BUCKETS = { current: 0, days30: 0, days60: 0, days90: 0, days90plus: 0 };

function ReportView({ reportKey, data: rawData }: { reportKey: ReportKey; data: any }) {
  const data = rawData || {};
  switch (reportKey) {
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
      const entries: any[] = Array.isArray(rawData) ? rawData : [];
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
              <strong>{data.balanced ? 'Yes' : 'No'}</strong>
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
