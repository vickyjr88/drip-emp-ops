"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { ListExport } from '../components/list-export';
import { ListPager, ListSearch, useListControls } from '../components/list-controls';
import { TourLauncher } from '../tours/tour-launcher';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { usePortalDialog } from '../components/portal-dialog';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  formatDate,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../accounting/lib';

type Band = { sequence: number; lowerBound: string | number; upperBound?: string | number | null; rate: string | number; maxAmount?: string | number | null };

type Rule = {
  id: string;
  code: string;
  name: string;
  kind: 'GRADUATED' | 'PERCENTAGE' | 'TIERED' | 'FIXED';
  basis: 'GROSS' | 'TAXABLE' | 'BASIC';
  effectiveFrom: string;
  effectiveTo?: string | null;
  rate?: string | number | null;
  fixedAmount?: string | number | null;
  reliefAmount?: string | number | null;
  employerRate?: string | number | null;
  reducesTaxable: boolean;
  liabilityAccountCode: string;
  isStatutory: boolean;
  isActive: boolean;
  notes?: string | null;
  bands: Band[];
};

type PayslipLine = {
  id: string;
  code: string;
  name: string;
  basisAmount: string | number;
  amount: string | number;
  employerAmount: string | number;
};

type Payslip = {
  id: string;
  employeeName: string;
  employeeNumber: string;
  basicPay: string | number;
  allowances: string | number;
  overtime: string | number;
  bonus: string | number;
  grossPay: string | number;
  taxablePay: string | number;
  totalDeductions: string | number;
  employerCost: string | number;
  netPay: string | number;
  daysWorked?: string | number | null;
  lines: PayslipLine[];
};

type Run = {
  id: string;
  runNumber: string;
  periodLabel: string;
  status: 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED';
  grossTotal: string | number;
  deductionTotal: string | number;
  employerCostTotal: string | number;
  netTotal: string | number;
  employeeCount: number;
  approvedBy?: string | null;
  payslips?: Payslip[];
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  payType: 'MONTHLY' | 'DAILY';
  payRate: string | number;
  status: string;
};

type Preview = {
  on: string;
  grossPay: number;
  taxablePay: number;
  totalDeductions: number;
  employerCost: number;
  netPay: number;
  lines: Array<{ code: string; name: string; basisAmount: number; amount: number; employerAmount: number }>;
};

type PayrollTab = 'runs' | 'rules' | 'calculator';

type ChartAccount = { id: string; code: string; name: string; type: string };

type BandForm = { lowerBound: string; upperBound: string; rate: string; maxAmount: string };

type RuleForm = {
  code: string;
  name: string;
  kind: Rule['kind'];
  basis: Rule['basis'];
  effectiveFrom: string;
  rate: string;
  fixedAmount: string;
  reliefAmount: string;
  employerRate: string;
  reducesTaxable: boolean;
  liabilityAccountCode: string;
  notes: string;
  bands: BandForm[];
};

function emptyRuleForm(): RuleForm {
  return {
    code: '',
    name: '',
    kind: 'PERCENTAGE',
    basis: 'GROSS',
    effectiveFrom: '',
    rate: '',
    fixedAmount: '',
    reliefAmount: '',
    employerRate: '',
    reducesTaxable: false,
    liabilityAccountCode: '',
    notes: '',
    bands: [],
  };
}

export default function PayrollPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [tab, setTab] = useState<PayrollTab>('runs');

  const [runs, setRuns] = useState<Run[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<Run | null>(null);

  const [showRunForm, setShowRunForm] = useState(false);
  const [periodMonth, setPeriodMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [dayEntries, setDayEntries] = useState<Record<string, string>>({});

  const [previewGross, setPreviewGross] = useState('100000');
  const [previewOn, setPreviewOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<Preview | null>(null);

  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm());
  const [supersedingCode, setSupersedingCode] = useState<string | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      const [nextRuns, nextRules, nextEmployees, nextAccounts] = await Promise.all([
        hasPermission(nextProfile, 'payroll-run.read')
          ? apiRequest<Run[]>('/payroll-runs', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'deduction-rule.read')
          ? apiRequest<Rule[]>('/deduction-rules', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'employee.read')
          ? apiRequest<Employee[]>('/employees?status=ACTIVE', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'chart-of-account.read')
          ? apiRequest<ChartAccount[]>('/chart-of-accounts', { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);
      setRuns(nextRuns);
      setRules(nextRules);
      setEmployees(nextEmployees);
      // Deductions are credited to a liability, so only those are offered.
      setAccounts(nextAccounts.filter((account) => account.type === 'LIABILITY'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load payroll.');
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

  useEffect(() => {
    if (!token || !openRunId) {
      setOpenRun(null);
      return;
    }
    void apiRequest<Run>(`/payroll-runs/${openRunId}`, { method: 'GET' }, token)
      .then(setOpenRun)
      .catch(() => setOpenRun(null));
  }, [token, openRunId, runs]);

  const canReadPayroll = hasPermission(profile, 'payroll-run.read');
  const canRunPayroll = hasPermission(profile, 'payroll-run.create');
  const canApprove = hasPermission(profile, 'payroll-run.update');
  const canManageRules = hasPermission(profile, 'deduction-rule.create');
  const roleLabel = useMemo(() => roleLabelFor(profile), [profile]);

  const dailyStaff = useMemo(() => employees.filter((e) => e.payType === 'DAILY'), [employees]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  async function runMutation(action: () => Promise<void>, message: string) {
    if (!token) return;
    setMutating(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      await action();
      setFeedback(message);
      await load(token);
    } catch (error) {
      const raw = error instanceof Error ? error.message : '';
      let text = raw || 'Operation failed.';
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.message) text = Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message;
      } catch {
        // Not JSON; keep the raw text.
      }
      setErrorMessage(text);
    } finally {
      setMutating(false);
    }
  }

  async function onCreateRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const entries = Object.entries(dayEntries)
      .filter(([, days]) => days !== '')
      .map(([employeeId, days]) => ({ employeeId, daysWorked: Number(days) }));

    await runMutation(async () => {
      const run = await apiRequest<Run>(
        '/payroll-runs',
        { method: 'POST', body: JSON.stringify({ periodMonth, entries }) },
        token,
      );
      setShowRunForm(false);
      setOpenRunId(run.id);
    }, 'Draft payroll created. Review the payslips before approving.');
  }

  async function onApprove(run: Run) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: `Approve ${run.runNumber}`,
      message: `This posts ${formatMoney(run.grossTotal)} of gross pay to the ledger, credits each statutory deduction to its liability account, and records ${formatMoney(run.netTotal)} of net pay. It cannot be edited afterwards.`,
      confirmLabel: 'Approve and post',
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/payroll-runs/${run.id}/approve`, { method: 'PATCH' }, token);
    }, 'Payroll approved and posted.');
  }

  async function onMarkPaid(run: Run) {
    if (!token) return;
    await runMutation(async () => {
      await apiRequest(`/payroll-runs/${run.id}/paid`, { method: 'PATCH' }, token);
    }, 'Marked as paid.');
  }

  async function onCancel(run: Run) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: `Cancel ${run.runNumber}`,
      message:
        run.status === 'DRAFT'
          ? 'This deletes the draft and its payslips. Nothing has been posted.'
          : 'This reverses the ledger posting. The reversal stays visible in the ledger.',
      confirmLabel: 'Cancel run',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/payroll-runs/${run.id}`, { method: 'DELETE' }, token);
      setOpenRunId(null);
    }, 'Payroll run cancelled.');
  }

  /**
   * Opens the form pre-filled from the current version of a rule, so changing a
   * rate means editing one number rather than re-entering the whole thing.
   */
  function startNewVersion(rule: Rule) {
    setSupersedingCode(rule.code);
    setRuleForm({
      code: rule.code,
      name: rule.name,
      kind: rule.kind,
      basis: rule.basis,
      effectiveFrom: '',
      rate: rule.rate != null ? String(Number(rule.rate) * 100) : '',
      fixedAmount: rule.fixedAmount != null ? String(rule.fixedAmount) : '',
      reliefAmount: rule.reliefAmount != null ? String(rule.reliefAmount) : '',
      employerRate: rule.employerRate != null ? String(Number(rule.employerRate) * 100) : '',
      reducesTaxable: rule.reducesTaxable,
      liabilityAccountCode: rule.liabilityAccountCode,
      notes: rule.notes || '',
      bands: (rule.bands || []).map((band) => ({
        lowerBound: String(Number(band.lowerBound)),
        upperBound: band.upperBound != null ? String(Number(band.upperBound)) : '',
        rate: String(Number(band.rate) * 100),
        maxAmount: band.maxAmount != null ? String(Number(band.maxAmount)) : '',
      })),
    });
    setShowRuleForm(true);
  }

  async function onSaveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const needsBands = ruleForm.kind === 'GRADUATED' || ruleForm.kind === 'TIERED';
    if (needsBands && ruleForm.bands.length === 0) {
      setErrorMessage('A graduated or tiered deduction needs at least one band.');
      return;
    }

    // Percentages are typed as people write them and stored as decimals.
    const payload: Record<string, unknown> = {
      code: ruleForm.code.trim().toUpperCase(),
      name: ruleForm.name.trim(),
      kind: ruleForm.kind,
      basis: ruleForm.basis,
      effectiveFrom: ruleForm.effectiveFrom,
      reducesTaxable: ruleForm.reducesTaxable,
      liabilityAccountCode: ruleForm.liabilityAccountCode,
      notes: ruleForm.notes.trim() || undefined,
      ...(ruleForm.kind === 'PERCENTAGE' ? { rate: Number(ruleForm.rate || 0) / 100 } : {}),
      ...(ruleForm.kind === 'FIXED' ? { fixedAmount: Number(ruleForm.fixedAmount || 0) } : {}),
      ...(ruleForm.reliefAmount ? { reliefAmount: Number(ruleForm.reliefAmount) } : {}),
      ...(ruleForm.employerRate ? { employerRate: Number(ruleForm.employerRate) / 100 } : {}),
      ...(needsBands
        ? {
            bands: ruleForm.bands.map((band, index) => ({
              sequence: index + 1,
              lowerBound: Number(band.lowerBound || 0),
              upperBound: band.upperBound === '' ? null : Number(band.upperBound),
              rate: Number(band.rate || 0) / 100,
              maxAmount: band.maxAmount === '' ? null : Number(band.maxAmount),
            })),
          }
        : {}),
    };

    await runMutation(async () => {
      await apiRequest('/deduction-rules', { method: 'POST', body: JSON.stringify(payload) }, token);
      setShowRuleForm(false);
      setSupersedingCode(null);
      setRuleForm(emptyRuleForm());
    }, 'Deduction rule saved. It applies from its effective date; earlier payslips are unchanged.');
  }

  async function onPreview() {
    if (!token) return;
    setErrorMessage(null);
    try {
      setPreview(
        await apiRequest<Preview>(
          `/deduction-rules/preview?grossPay=${Number(previewGross || 0)}&on=${previewOn}`,
          { method: 'GET' },
          token,
        ),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not calculate.');
    }
  }

  const runControls = useListControls(runs, (row) => [
    row.runNumber,
    row.periodLabel,
    row.status,
  ]);

  const ruleControls = useListControls(rules, (row) => [
    row.code,
    row.name,
    row.kind,
    row.basis,
  ]);

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-auth-section" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading payroll...</article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-auth-section" style={{ paddingTop: 72 }}>
            <article className="portal-card">
              <h2>Authentication required</h2>
              <a href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                Go to Portal Login
              </a>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  const latestRules = rules.filter(
    (rule) => !rules.some((other) => other.code === rule.code && other.effectiveFrom > rule.effectiveFrom),
  );

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="payroll"
            pageSubtitle="Monthly runs, payslips and the statutory deductions behind them."
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={hasPermission(profile, 'role.read')}
            onLogout={onLogout}
            onRefresh={() => token && void load(token)}
          >

            {!canReadPayroll ? (
              <article className="portal-card portal-role-banner">
                You do not have permission to view payroll.
              </article>
            ) : (
              <>
                <div className="portal-action-row" style={{ justifyContent: 'flex-start' }}>
                  {(['runs', 'rules', 'calculator'] as PayrollTab[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`portal-inline-btn${tab === key ? ' is-active' : ''}`}
                      onClick={() => setTab(key)}
                    >
                      {key === 'runs' ? 'Payroll Runs' : key === 'rules' ? 'Deductions' : 'Calculator'}
                    </button>
                  ))}
                </div>

                {tab === 'runs' ? (
                  <>
                    <article className="portal-card" data-tour="payroll.runs">
                      <div className="portal-card-header-row">
                        <h2 style={{ margin: 0 }}>Payroll Runs</h2><TourLauncher tour="run-payroll" />
                        {canRunPayroll ? (
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => setShowRunForm((prev) => !prev)}
                          >
                            {showRunForm ? 'Close' : 'New Run'}
                          </button>
                        ) : null}
                      </div>

                      {showRunForm && canRunPayroll ? (
                        <form className="portal-entity-form portal-detail-form" onSubmit={onCreateRun}>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Month</span>
                              <input
                                type="month"
                                value={periodMonth}
                                onChange={(event) => setPeriodMonth(event.target.value)}
                                required
                              />
                            </label>
                          </div>

                          {dailyStaff.length ? (
                            <>
                              <h3 style={{ margin: '10px 0 6px', fontSize: 15 }}>Days worked</h3>
                              <p className="portal-muted" style={{ marginTop: 0 }}>
                                Daily-rated staff are paid for the days entered here. Salaried staff need
                                nothing.
                              </p>
                              <div className="portal-entity-grid-3">
                                {dailyStaff.map((employee) => (
                                  <label key={employee.id}>
                                    <span>
                                      {employee.firstName} {employee.lastName} (
                                      {formatMoney(employee.payRate)}/day)
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={31}
                                      value={dayEntries[employee.id] ?? ''}
                                      onChange={(event) =>
                                        setDayEntries((prev) => ({ ...prev, [employee.id]: event.target.value }))
                                      }
                                    />
                                  </label>
                                ))}
                              </div>
                            </>
                          ) : null}

                          <p className="portal-muted" style={{ margin: 0 }}>
                            A draft is created for review. Nothing is posted to the ledger until you approve
                            it.
                          </p>
                          <button type="submit" className="portal-primary-btn" disabled={mutating}>
                            {mutating ? 'Building...' : 'Create Draft Run'}
                          </button>
                        </form>
                      ) : null}

                      <div className="list-toolbar">
                        <ListSearch controls={runControls} placeholder="Search payroll runs…" />
                          <ListExport
                            rows={runControls.filtered}
                            config={{
                              fileName: 'payroll-runs',
                              columns: [
                                { header: 'Run Number', value: (row) => row.runNumber },
                                { header: 'Period', value: (row) => row.periodLabel },
                                { header: 'Status', value: (row) => row.status },
                                { header: 'Employees', value: (row) => row.employeeCount },
                                { header: 'Gross Total', value: (row) => Number(row.grossTotal) },
                                { header: 'Deductions', value: (row) => Number(row.deductionTotal) },
                                { header: 'Net Total', value: (row) => Number(row.netTotal) },
                                { header: 'Employer Cost', value: (row) => Number(row.employerCostTotal) },
                              ],
                            }}
                          />
                      </div>
                      <div className="portal-list-stack">
                        {runs.length === 0 ? (
                          <div className="portal-empty-state">No payroll runs yet.</div>
                        ) : (
                          runControls.visible.map((run) => (
                            <div key={run.id} className="portal-record">
                              <div className="portal-list-row">
                                <div>
                                  <strong>
                                    {run.runNumber} — {run.periodLabel}
                                  </strong>
                                  <p>
                                    {run.employeeCount} employee{run.employeeCount === 1 ? '' : 's'} • gross{' '}
                                    {formatMoney(run.grossTotal)} • deductions{' '}
                                    {formatMoney(run.deductionTotal)}
                                    {Number(run.employerCostTotal) > 0
                                      ? ` • employer ${formatMoney(run.employerCostTotal)}`
                                      : ''}
                                  </p>
                                  {run.approvedBy ? (
                                    <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                      Approved by {run.approvedBy}
                                    </p>
                                  ) : null}
                                </div>
                                <span>{run.status}</span>
                                <span>{formatMoney(run.netTotal)} net</span>
                              </div>
                              <div className="portal-action-row">
                                <button
                                  type="button"
                                  className="portal-inline-btn"
                                  onClick={() => setOpenRunId(openRunId === run.id ? null : run.id)}
                                >
                                  {openRunId === run.id ? 'Hide Payslips' : 'View Payslips'}
                                </button>
                                {canApprove && run.status === 'DRAFT' ? (
                                  <button
                                    type="button"
                                    className="portal-inline-btn"
                                    disabled={mutating}
                                    onClick={() => void onApprove(run)}
                                  >
                                    Approve &amp; Post
                                  </button>
                                ) : null}
                                {canApprove && run.status === 'APPROVED' ? (
                                  <button
                                    type="button"
                                    className="portal-inline-btn"
                                    disabled={mutating}
                                    onClick={() => void onMarkPaid(run)}
                                  >
                                    Mark Paid
                                  </button>
                                ) : null}
                                {canApprove && run.status !== 'PAID' && run.status !== 'CANCELLED' ? (
                                  <button
                                    type="button"
                                    className="portal-inline-btn is-danger"
                                    disabled={mutating}
                                    onClick={() => void onCancel(run)}
                                  >
                                    Cancel
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <ListPager controls={runControls} noun="runs" />
                    </article>

                    {openRun?.payslips?.length ? (
                      <article className="portal-card">
                        <h2 style={{ marginTop: 0 }}>
                          Payslips — {openRun.runNumber} ({openRun.periodLabel})
                        </h2>
                        <div className="portal-list-stack">
                          {openRun.payslips.map((payslip) => (
                            <div key={payslip.id} className="portal-record">
                              <div className="portal-list-row">
                                <div>
                                  <strong>
                                    {payslip.employeeName} — {payslip.employeeNumber}
                                  </strong>
                                  <p>
                                    Gross {formatMoney(payslip.grossPay)}
                                    {payslip.daysWorked != null
                                      ? ` (${Number(payslip.daysWorked)} days)`
                                      : ''}{' '}
                                    • taxable {formatMoney(payslip.taxablePay)}
                                  </p>
                                </div>
                                <span>{formatMoney(payslip.totalDeductions)} deducted</span>
                                <span>{formatMoney(payslip.netPay)} net</span>
                              </div>
                              <div className="portal-info-list" style={{ marginTop: 8 }}>
                                {payslip.lines.map((line) => (
                                  <div key={line.id} className="portal-info-row">
                                    <span>{line.name}</span>
                                    <strong style={{ fontWeight: 400, fontSize: 13 }}>
                                      {formatMoney(line.amount)} on {formatMoney(line.basisAmount)}
                                      {Number(line.employerAmount) > 0
                                        ? ` • employer ${formatMoney(line.employerAmount)}`
                                        : ''}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    ) : null}
                  </>
                ) : null}

                {tab === 'rules' ? (
                  <article className="portal-card" data-tour="payroll.rules">
                    <div className="portal-card-header-row">
                      <h2 style={{ margin: 0 }}>Deduction Rules</h2>
                      {canManageRules ? (
                        <button
                          type="button"
                          className="portal-inline-btn"
                          onClick={() => {
                            if (showRuleForm) {
                              setShowRuleForm(false);
                              return;
                            }
                            setSupersedingCode(null);
                            setRuleForm(emptyRuleForm());
                            setShowRuleForm(true);
                          }}
                        >
                          {showRuleForm ? 'Close' : 'Add Deduction'}
                        </button>
                      ) : null}
                    </div>
                    <p className="portal-muted" style={{ marginTop: 0 }}>
                      Rates are configuration, versioned by the date they take effect. When a rate changes,
                      add a new version with a later effective date rather than editing the current one — a
                      rule already used on payslips is locked so past runs stay reproducible.
                    </p>

                    {showRuleForm && canManageRules ? (
                      <form className="portal-entity-form portal-detail-form" onSubmit={onSaveRule}>
                        {supersedingCode ? (
                          <p className="portal-muted" style={{ margin: 0 }}>
                            New version of <strong>{supersedingCode}</strong>, pre-filled from the current
                            one. Change what has moved and give it the date it takes effect — payslips
                            before that date keep using the old figures.
                          </p>
                        ) : (
                          <p className="portal-muted" style={{ margin: 0 }}>
                            Rates are entered as percentages, e.g. 2.75 for 2.75%.
                          </p>
                        )}

                        <div className="portal-entity-grid-3">
                          <label>
                            <span>Code</span>
                            <input
                              value={ruleForm.code}
                              onChange={(event) =>
                                setRuleForm((prev) => ({ ...prev, code: event.target.value }))
                              }
                              placeholder="PAYE"
                              required
                              readOnly={Boolean(supersedingCode)}
                            />
                          </label>
                          <label>
                            <span>Name</span>
                            <input
                              value={ruleForm.name}
                              onChange={(event) =>
                                setRuleForm((prev) => ({ ...prev, name: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <label>
                            <span>Effective From</span>
                            <input
                              type="date"
                              value={ruleForm.effectiveFrom}
                              onChange={(event) =>
                                setRuleForm((prev) => ({ ...prev, effectiveFrom: event.target.value }))
                              }
                              required
                            />
                          </label>
                        </div>

                        <div className="portal-entity-grid-3">
                          <label>
                            <span>Type</span>
                            <select
                              value={ruleForm.kind}
                              onChange={(event) =>
                                setRuleForm((prev) => ({ ...prev, kind: event.target.value as Rule['kind'] }))
                              }
                            >
                              <option value="PERCENTAGE">Percentage of pay</option>
                              <option value="GRADUATED">Graduated bands</option>
                              <option value="TIERED">Tiered contribution</option>
                              <option value="FIXED">Fixed amount</option>
                            </select>
                          </label>
                          <label>
                            <span>Charged On</span>
                            <select
                              value={ruleForm.basis}
                              onChange={(event) =>
                                setRuleForm((prev) => ({ ...prev, basis: event.target.value as Rule['basis'] }))
                              }
                            >
                              <option value="GROSS">Gross pay</option>
                              <option value="TAXABLE">Taxable pay (after reliefs)</option>
                              <option value="BASIC">Basic pay</option>
                            </select>
                          </label>
                          <label>
                            <span>Credited To</span>
                            <select
                              value={ruleForm.liabilityAccountCode}
                              onChange={(event) =>
                                setRuleForm((prev) => ({ ...prev, liabilityAccountCode: event.target.value }))
                              }
                              required
                            >
                              <option value="">Select account</option>
                              {accounts.map((account) => (
                                <option key={account.id} value={account.code}>
                                  {account.code} — {account.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="portal-entity-grid-3">
                          {ruleForm.kind === 'PERCENTAGE' ? (
                            <label>
                              <span>Employee Rate (%)</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                value={ruleForm.rate}
                                onChange={(event) =>
                                  setRuleForm((prev) => ({ ...prev, rate: event.target.value }))
                                }
                                required
                              />
                            </label>
                          ) : null}
                          {ruleForm.kind === 'FIXED' ? (
                            <label>
                              <span>Amount</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={ruleForm.fixedAmount}
                                onChange={(event) =>
                                  setRuleForm((prev) => ({ ...prev, fixedAmount: event.target.value }))
                                }
                                required
                              />
                            </label>
                          ) : null}
                          <label>
                            <span>Employer Rate (%) — optional</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={ruleForm.employerRate}
                              onChange={(event) =>
                                setRuleForm((prev) => ({ ...prev, employerRate: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Monthly Relief — optional</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={ruleForm.reliefAmount}
                              onChange={(event) =>
                                setRuleForm((prev) => ({ ...prev, reliefAmount: event.target.value }))
                              }
                            />
                          </label>
                        </div>

                        {ruleForm.kind === 'GRADUATED' || ruleForm.kind === 'TIERED' ? (
                          <>
                            <h3 style={{ margin: '10px 0 6px', fontSize: 15 }}>Bands</h3>
                            <p className="portal-muted" style={{ marginTop: 0 }}>
                              Each band charges only the pay falling inside it. Leave the top band&apos;s
                              upper limit blank for &ldquo;and above&rdquo;.
                            </p>
                            {ruleForm.bands.map((band, index) => (
                              <div key={index} className="portal-entity-grid-4">
                                <label>
                                  <span>From</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={band.lowerBound}
                                    onChange={(event) =>
                                      setRuleForm((prev) => ({
                                        ...prev,
                                        bands: prev.bands.map((item, i) =>
                                          i === index ? { ...item, lowerBound: event.target.value } : item,
                                        ),
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  <span>To (blank = above)</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={band.upperBound}
                                    onChange={(event) =>
                                      setRuleForm((prev) => ({
                                        ...prev,
                                        bands: prev.bands.map((item, i) =>
                                          i === index ? { ...item, upperBound: event.target.value } : item,
                                        ),
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  <span>Rate (%)</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.01"
                                    value={band.rate}
                                    onChange={(event) =>
                                      setRuleForm((prev) => ({
                                        ...prev,
                                        bands: prev.bands.map((item, i) =>
                                          i === index ? { ...item, rate: event.target.value } : item,
                                        ),
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  <span>Cap — optional</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={band.maxAmount}
                                    onChange={(event) =>
                                      setRuleForm((prev) => ({
                                        ...prev,
                                        bands: prev.bands.map((item, i) =>
                                          i === index ? { ...item, maxAmount: event.target.value } : item,
                                        ),
                                      }))
                                    }
                                  />
                                </label>
                              </div>
                            ))}
                            <div className="portal-action-row" style={{ justifyContent: 'flex-start' }}>
                              <button
                                type="button"
                                className="portal-inline-btn"
                                onClick={() =>
                                  setRuleForm((prev) => ({
                                    ...prev,
                                    bands: [
                                      ...prev.bands,
                                      { lowerBound: '', upperBound: '', rate: '', maxAmount: '' },
                                    ],
                                  }))
                                }
                              >
                                Add Band
                              </button>
                              {ruleForm.bands.length > 0 ? (
                                <button
                                  type="button"
                                  className="portal-inline-btn is-danger"
                                  onClick={() =>
                                    setRuleForm((prev) => ({ ...prev, bands: prev.bands.slice(0, -1) }))
                                  }
                                >
                                  Remove Last Band
                                </button>
                              ) : null}
                            </div>
                          </>
                        ) : null}

                        <div className="portal-check-row">
                          <label className="portal-check">
                            <input
                              type="checkbox"
                              checked={ruleForm.reducesTaxable}
                              onChange={(event) =>
                                setRuleForm((prev) => ({ ...prev, reducesTaxable: event.target.checked }))
                              }
                            />
                            <span>Reduces taxable pay (applied before PAYE)</span>
                          </label>
                        </div>

                        <label>
                          <span>Notes</span>
                          <input
                            value={ruleForm.notes}
                            onChange={(event) =>
                              setRuleForm((prev) => ({ ...prev, notes: event.target.value }))
                            }
                            placeholder="Where this rate comes from, e.g. Finance Act 2025"
                          />
                        </label>

                        <button type="submit" className="portal-primary-btn" disabled={mutating}>
                          {mutating ? 'Saving...' : 'Save Deduction'}
                        </button>
                      </form>
                    ) : null}

                    <div className="list-toolbar">
                      <ListSearch controls={ruleControls} placeholder="Search deduction rules…" />
                      <ListExport
                        rows={ruleControls.filtered}
                        config={{
                          fileName: 'deduction-rules',
                          columns: [
                            { header: 'Code', value: (row) => row.code },
                            { header: 'Name', value: (row) => row.name },
                            { header: 'Kind', value: (row) => row.kind },
                            { header: 'Basis', value: (row) => row.basis },
                            { header: 'Rate', value: (row) => row.rate == null ? '' : Number(row.rate) },
                            { header: 'Employer Rate', value: (row) => row.employerRate == null ? '' : Number(row.employerRate) },
                            { header: 'Statutory', value: (row) => row.isStatutory ? 'Yes' : 'No' },
                          ],
                        }}
                      />
                    </div>
                    <div className="portal-list-stack">
                      {rules.length === 0 ? (
                        <div className="portal-empty-state">No deduction rules configured.</div>
                      ) : (
                        ruleControls.visible.map((rule) => {
                          const isCurrent = latestRules.some((latest) => latest.id === rule.id);
                          return (
                            <div key={rule.id} className="portal-record">
                              <div className="portal-list-row">
                                <div>
                                  <strong>
                                    {rule.code} — {rule.name}
                                    {!isCurrent ? ' (superseded)' : ''}
                                  </strong>
                                  <p>
                                    {rule.kind.toLowerCase()} on {rule.basis.toLowerCase()} pay • from{' '}
                                    {formatDate(rule.effectiveFrom)} • credits {rule.liabilityAccountCode}
                                    {rule.reducesTaxable ? ' • reduces taxable pay' : ''}
                                  </p>
                                  {rule.kind === 'PERCENTAGE' ? (
                                    <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                      {(Number(rule.rate) * 100).toFixed(2)}% employee
                                      {rule.employerRate
                                        ? ` • ${(Number(rule.employerRate) * 100).toFixed(2)}% employer`
                                        : ''}
                                    </p>
                                  ) : null}
                                  {rule.bands?.length ? (
                                    <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                      {rule.bands
                                        .map(
                                          (band) =>
                                            `${Number(band.lowerBound).toLocaleString()}–${
                                              band.upperBound
                                                ? Number(band.upperBound).toLocaleString()
                                                : 'above'
                                            } @ ${(Number(band.rate) * 100).toFixed(1)}%`,
                                        )
                                        .join(' • ')}
                                      {rule.reliefAmount
                                        ? ` • relief ${formatMoney(rule.reliefAmount)}`
                                        : ''}
                                    </p>
                                  ) : null}
                                  {rule.notes ? (
                                    <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                      {rule.notes}
                                    </p>
                                  ) : null}
                                </div>
                                <span>{rule.isStatutory ? 'STATUTORY' : 'VOLUNTARY'}</span>
                              </div>
                              {canManageRules && isCurrent ? (
                                <div className="portal-action-row">
                                  <button
                                    type="button"
                                    className="portal-inline-btn"
                                    onClick={() => startNewVersion(rule)}
                                  >
                                    New Version
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                    <ListPager controls={ruleControls} noun="rules" />

                    {canManageRules ? (
                      <p className="portal-muted" style={{ marginTop: 14 }}>
                        Confirm any new rate against current KRA, NSSF and SHIF guidance before running
                        payroll with it. Use the Calculator tab to check the effect before the date arrives.
                      </p>
                    ) : null}
                  </article>
                ) : null}

                {tab === 'calculator' ? (
                  <article className="portal-card" data-tour="payroll.calculator">
                    <h2 style={{ marginTop: 0 }}>Deduction Calculator</h2>
                    <p className="portal-muted" style={{ marginTop: 0 }}>
                      Check what a given gross produces under the rules in force on a date. Useful for
                      confirming a rate change before it applies.
                    </p>
                    <div className="portal-entity-form">
                      <div className="portal-entity-grid-3">
                        <label>
                          <span>Gross Pay</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={previewGross}
                            onChange={(event) => setPreviewGross(event.target.value)}
                          />
                        </label>
                        <label>
                          <span>As at</span>
                          <input
                            type="date"
                            value={previewOn}
                            onChange={(event) => setPreviewOn(event.target.value)}
                          />
                        </label>
                        <div className="portal-check-row" style={{ alignItems: 'flex-end' }}>
                          <button type="button" className="portal-primary-btn" onClick={() => void onPreview()}>
                            Calculate
                          </button>
                        </div>
                      </div>
                    </div>

                    {preview ? (
                      <>
                        <div className="portal-stats-grid" style={{ marginTop: 14 }}>
                          <article className="portal-card portal-stat-card">
                            <span>Gross</span>
                            <strong>{formatMoney(preview.grossPay)}</strong>
                          </article>
                          <article className="portal-card portal-stat-card">
                            <span>Taxable</span>
                            <strong>{formatMoney(preview.taxablePay)}</strong>
                          </article>
                          <article className="portal-card portal-stat-card">
                            <span>Deductions</span>
                            <strong>{formatMoney(preview.totalDeductions)}</strong>
                          </article>
                          <article className="portal-card portal-stat-card">
                            <span>Net Pay</span>
                            <strong>{formatMoney(preview.netPay)}</strong>
                          </article>
                        </div>
                        <div className="portal-info-list" style={{ marginTop: 14 }}>
                          {preview.lines.map((line) => (
                            <div key={line.code} className="portal-info-row">
                              <span>{line.name}</span>
                              <strong style={{ fontWeight: 400, fontSize: 13 }}>
                                {formatMoney(line.amount)} on {formatMoney(line.basisAmount)}
                                {line.employerAmount > 0
                                  ? ` • employer ${formatMoney(line.employerAmount)}`
                                  : ''}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </article>
                ) : null}
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
