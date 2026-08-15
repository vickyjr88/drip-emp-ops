"use client";

import Link from 'next/link';
import { useErrorState } from '../../components/notifications';
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
  | 'store-performance'
  | 'product-profitability'
  | 'consignment-exposure'
  | 'tax';

const REPORTS: Array<{ key: ReportKey; label: string }> = [
  { key: 'store-performance', label: 'Store Performance' },
  { key: 'product-profitability', label: 'Product Profitability' },
  { key: 'consignment-exposure', label: 'Consignment Exposure' },
  { key: 'trial-balance', label: 'Trial Balance' },
  { key: 'general-ledger', label: 'General Ledger' },
  { key: 'journal-listing', label: 'Journal Listing' },
  { key: 'profit-and-loss', label: 'Profit & Loss' },
  { key: 'balance-sheet', label: 'Balance Sheet' },
  { key: 'cash-flow', label: 'Cash Flow' },
  { key: 'ar-aging', label: 'AR Aging' },
  { key: 'ap-aging', label: 'AP Aging' },
  { key: 'tax', label: 'Tax Report' },
];

/**
 * Reports a store filter does not apply to.
 *
 * Journal listing has no store filter on the API; store performance already
 * breaks every store out into its own row, so scoping it to one store would
 * just be a one-row table. AR ageing, AP ageing and tax are company-wide by
 * nature.
 */
const REPORTS_WITHOUT_STORE_SCOPE: ReportKey[] = [
  'journal-listing',
  'store-performance',
  'ar-aging',
  'ap-aging',
  'tax',
];

/**
 * Reports the PDF endpoint can render. The rest are served by other
 * controllers and have no PDF route, so the download button is hidden for them
 * rather than offering something that fails.
 */
const PDF_REPORTS: ReportKey[] = [
  'profit-and-loss',
  'balance-sheet',
  'cash-flow',
  'ap-aging',
  'store-performance',
  'product-profitability',
  'consignment-exposure',
  'tax',
];

type ChartOfAccount = { id: string; code: string; name: string; type?: string };
type StoreOption = { id: string; code: string; name: string };

export default function FinancialReportsPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);

  const [activeReport, setActiveReport] = useState<ReportKey>('store-performance');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [glAccountId, setGlAccountId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
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
      // Populates the scope picker. A missing store.read just leaves it on
      // "All stores" rather than failing the whole reports page.
      if (hasPermission(nextProfile, 'store.read')) {
        try {
          const nextStores = await apiRequest<StoreOption[]>('/stores', { method: 'GET' }, authToken);
          setStores(nextStores);
        } catch {
          // Non-fatal: the reports still run company-wide.
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
      const scopedStoreId = REPORTS_WITHOUT_STORE_SCOPE.includes(activeReport) ? '' : storeId;
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      // As-of reports read `asOf`; sending both is harmless and saves branching
      // on which kind this is.
      if (to) {
        params.set('to', to);
        params.set('asOf', to);
      }
      if (scopedStoreId) {
        params.set('storeId', scopedStoreId);
        const store = stores.find((entry) => entry.id === scopedStoreId);
        if (store) params.set('storeName', `${store.code} — ${store.name}`);
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
      // Scope applies to every report that supports it; the exceptions are
      // listed in REPORTS_WITHOUT_STORE_SCOPE.
      //
      // This used to send `projectId`, which the API has never read -- it takes
      // `storeId`. Every store filter was therefore silently ignored and the
      // screen showed group-wide figures while claiming to be scoped.
      const scopedStoreId = REPORTS_WITHOUT_STORE_SCOPE.includes(activeReport) ? '' : storeId;

      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (scopedStoreId) params.set('storeId', scopedStoreId);

      // For as-of reports the date lives in `asOf` rather than `to`.
      const asOfParams = new URLSearchParams();
      if (to) asOfParams.set('asOf', to);
      if (scopedStoreId) asOfParams.set('storeId', scopedStoreId);
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
        case 'store-performance':
          path = `/reports/store-performance?${params.toString()}`;
          break;
        case 'product-profitability':
          path = `/reports/product-profitability?${params.toString()}`;
          break;
        case 'consignment-exposure':
          path = `/reports/consignment-exposure${asOfQuery}`;
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
  }, [token, activeReport, from, to, glAccountId, storeId]);

  useEffect(() => {
    if (!token || !profile) return;
    void runReport();
    // Re-runs on scope change too, so switching store reflects immediately
    // without needing to press Run Report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, profile, activeReport, storeId]);

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
            pageSubtitle="Store performance, product margin and consignment exposure, plus Trial Balance, General Ledger, P&L, Balance Sheet, Cash Flow, Aging and Tax — company-wide or scoped to one store."
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
                  {!REPORTS_WITHOUT_STORE_SCOPE.includes(activeReport) ? (
                    <label>
                      <span>Store</span>
                      <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
                        <option value="">All stores</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.code} — {store.name}
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
              ) : !reportData || reportDataKey !== activeReport ? (
                <div className="portal-empty-state">No data for this report yet.</div>
              ) : (
                <>
                  {/* Caveats the API attaches to store-scoped cuts (e.g. that a
                      per-store balance sheet is not expected to balance). */}
                  {reportData.note ? (
                    <p className="portal-muted" style={{ marginTop: 0 }}>
                      {reportData.note}
                    </p>
                  ) : null}
                  <ReportView reportKey={activeReport} data={reportData} />
                </>
              )}
            </article>

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

function ReportView({ reportKey, data: rawData }: { reportKey: ReportKey; data: any }) {
  const data = rawData || {};
  switch (reportKey) {
    case 'store-performance': {
      const rows = data.rows || [];
      const totals = data.totals || {};
      if (!rows.length) {
        return <div className="portal-empty-state">No stores to report on yet.</div>;
      }
      return (
        <div>
          <div className="portal-stat-grid" style={{ marginBottom: 16 }}>
            <div className="portal-stat"><span>Orders</span><h3>{totals.orderCount ?? 0}</h3></div>
            <div className="portal-stat"><span>Revenue</span><h3>{formatMoney(totals.revenue)}</h3></div>
            <div className="portal-stat"><span>Cost of goods</span><h3>{formatMoney(totals.cogs)}</h3></div>
            <div className="portal-stat"><span>Gross profit</span><h3>{formatMoney(totals.grossProfit)}</h3></div>
            <div className="portal-stat"><span>Margin</span><h3>{formatPercent(totals.grossMarginPercent)}</h3></div>
          </div>
          <div className="portal-table-wrap">
            <table className="portal-data-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th className="portal-num">Orders</th>
                  <th className="portal-num">Revenue</th>
                  <th className="portal-num">Cost of goods</th>
                  <th className="portal-num">Gross profit</th>
                  <th className="portal-num">Margin</th>
                  <th className="portal-num">Collected</th>
                  <th className="portal-num">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.storeId}>
                    <td>
                      {row.name}
                      <span className="portal-muted"> · {row.code}</span>
                    </td>
                    <td className="portal-num">{row.orderCount}</td>
                    <td className="portal-num">{formatMoney(row.revenue)}</td>
                    <td className="portal-num">{formatMoney(row.cogs)}</td>
                    <td className="portal-num">{formatMoney(row.grossProfit)}</td>
                    <td className="portal-num">{formatPercent(row.grossMarginPercent)}</td>
                    <td className="portal-num">{formatMoney(row.collected)}</td>
                    <td className="portal-num">{formatMoney(row.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Head-office spend carries no store tag, so it is reported on its
              own rather than being spread across the shops on a guess. */}
          {data.unallocatedExpense ? (
            <p className="portal-muted" style={{ marginTop: 12 }}>
              {formatMoney(data.unallocatedExpense)} of spend is not attributed to any store, so the
              store rows above sum to less than the company total.
            </p>
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
              {/* null when scoped to a store, where balancing is not expected. */}
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

    case 'consignment-exposure': {
      const rows = data.rows || [];
      const totals = data.totals || {};
      if (!rows.length) {
        return <div className="portal-empty-state">Nothing is out with resellers right now.</div>;
      }
      return (
        <div>
          <div className="portal-stat-grid" style={{ marginBottom: 16 }}>
            <div className="portal-stat"><span>Open pickups</span><h3>{totals.openConsignments ?? 0}</h3></div>
            <div className="portal-stat">
              <span>Pairs still out</span>
              <h3>{totals.unitsStillOut ?? 0}</h3>
            </div>
            <div className="portal-stat">
              <span>Stock at risk</span>
              <h3>{formatMoney(totals.stockAtRisk)}</h3>
              <span className="portal-stat-note">Ours, but not sellable</span>
            </div>
            <div className="portal-stat"><span>Owed to us</span><h3>{formatMoney(totals.balanceOwed)}</h3></div>
            <div className="portal-stat">
              <span>Overdue</span>
              <h3>{totals.overdueCount ?? 0}</h3>
              <span className="portal-stat-note">{formatMoney(totals.overdueStockAtRisk)} past due</span>
            </div>
          </div>
          <div className="portal-table-wrap">
            <table className="portal-data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Reseller</th>
                  <th>Store</th>
                  <th className="portal-num">Days out</th>
                  <th>Due</th>
                  <th className="portal-num">Still out</th>
                  <th className="portal-num">At risk</th>
                  <th className="portal-num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.consignmentId}>
                    <td>{row.reference}</td>
                    <td>
                      {row.resellerName}
                      {row.resellerPhone ? (
                        <span className="portal-muted"> · {row.resellerPhone}</span>
                      ) : null}
                    </td>
                    <td>{row.storeName}</td>
                    <td className="portal-num">{row.daysOut}</td>
                    <td>
                      {row.dueDate ? formatDate(row.dueDate) : '—'}
                      {/* Overdue is the number worth chasing, so it is called
                          out in words as well as by the count above. */}
                      {row.overdue ? (
                        <strong className="portal-overdue-flag">Overdue</strong>
                      ) : null}
                    </td>
                    <td className="portal-num">{row.unitsStillOut}</td>
                    <td className="portal-num">{formatMoney(row.stockAtRisk)}</td>
                    <td className="portal-num">{formatMoney(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    case 'product-profitability': {
      const rows = data.rows || [];
      const totals = data.totals || {};
      if (!rows.length) {
        return <div className="portal-empty-state">No sales in this period.</div>;
      }
      return (
        <div>
          {/* Says so plainly when some variants have no cost recorded: the
              margin below is then a ceiling, not a figure to bank on. */}
          {data.costIncomplete ? (
            <p className="portal-muted" style={{ marginTop: 0 }}>
              Some items sold have no cost recorded, so the margin shown is higher than the real one.
              Set a cost on those variants for a true figure.
            </p>
          ) : null}
          <div className="portal-stat-grid" style={{ marginBottom: 16 }}>
            <div className="portal-stat"><span>Units sold</span><h3>{totals.unitsSold ?? 0}</h3></div>
            <div className="portal-stat"><span>Revenue</span><h3>{formatMoney(totals.revenue)}</h3></div>
            <div className="portal-stat"><span>Gross profit</span><h3>{formatMoney(totals.grossProfit)}</h3></div>
            <div className="portal-stat"><span>Margin</span><h3>{formatPercent(totals.grossMarginPercent)}</h3></div>
            <div className="portal-stat">
              <span>Given away</span>
              <h3>{formatMoney(totals.discount)}</h3>
              <span className="portal-stat-note">Against marked price</span>
            </div>
          </div>
          <div className="portal-table-wrap">
            <table className="portal-data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="portal-num">Units</th>
                  <th className="portal-num">Revenue</th>
                  <th className="portal-num">Cost</th>
                  <th className="portal-num">Gross profit</th>
                  <th className="portal-num">Margin</th>
                  <th className="portal-num">Avg price</th>
                  <th className="portal-num">Discount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.productId}>
                    <td>
                      {row.name}
                      {row.brand ? <span className="portal-muted"> · {row.brand}</span> : null}
                    </td>
                    <td className="portal-num">{row.unitsSold}</td>
                    <td className="portal-num">{formatMoney(row.revenue)}</td>
                    <td className="portal-num">{row.cost === null ? '—' : formatMoney(row.cost)}</td>
                    <td className="portal-num">
                      {row.grossProfit === null ? '—' : formatMoney(row.grossProfit)}
                    </td>
                    <td className="portal-num">{formatPercent(row.grossMarginPercent)}</td>
                    <td className="portal-num">{formatMoney(row.averagePrice)}</td>
                    <td className="portal-num">{formatMoney(row.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
