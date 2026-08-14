"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { ListExport } from '../components/list-export';
import { TourLauncher } from '../tours/tour-launcher';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ListPager, ListSearch, useListControls } from '../components/list-controls';
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

type TaxRate = { id: string; code: string; name: string; rate: string | number };
type Project = { id: string; code: string; name: string };

type Broker = {
  id: string;
  name: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  kraPin?: string | null;
  defaultRate: string | number;
  defaultWhtRateId?: string | null;
  defaultWhtRate?: TaxRate | null;
  notes?: string | null;
  isActive: boolean;
};

type CommissionPayment = {
  id: string;
  paymentNumber: string;
  amount: string | number;
  whtAmount: string | number;
  netPaid: string | number;
  reference?: string | null;
  paidAt: string;
};

type Commission = {
  id: string;
  brokerId: string;
  broker?: { id: string; name: string; companyName?: string | null };
  unit?: { id: string; unitNumber: string } | null;
  contract?: { id: string; contractNumber: string } | null;
  salePrice: string | number;
  ratePercent?: string | number | null;
  amount: string | number;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  earnedAt: string;
  notes?: string | null;
  payments: CommissionPayment[];
  amountPaid?: number;
  outstanding?: number;
};

type SalesContract = {
  id: string;
  contractNumber: string;
  totalAgreedPrice: string | number;
  contractStatus: string;
  unitId: string;
};

type BrokerTab = 'commissions' | 'brokers';

const STATUS_LABELS: Record<Commission['status'], string> = {
  PENDING: 'Awaiting approval',
  APPROVED: 'Approved — payable',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

function emptyBrokerForm() {
  return {
    name: '',
    companyName: '',
    email: '',
    phone: '',
    kraPin: '',
    defaultRatePercent: '2',
    defaultWhtRateId: '',
    notes: '',
    isActive: true,
  };
}

export default function BrokersPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [tab, setTab] = useState<BrokerTab>('commissions');

  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [showBrokerForm, setShowBrokerForm] = useState(false);
  const [brokerForm, setBrokerForm] = useState(emptyBrokerForm());
  const [editingBrokerId, setEditingBrokerId] = useState<string | null>(null);

  const [showCommissionForm, setShowCommissionForm] = useState(false);
  const [commissionForm, setCommissionForm] = useState({
    brokerId: '',
    contractId: '',
    ratePercent: '',
    amount: '',
    notes: '',
  });

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', whtRateId: '', reference: '', paymentMethod: 'BANK_TRANSFER' });

  const [filterBrokerId, setFilterBrokerId] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(
    async (authToken: string) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const nextProfile = await loadProfile(authToken);
        setProfile(nextProfile);

        const params = new URLSearchParams();
        if (filterBrokerId) params.set('brokerId', filterBrokerId);
        if (filterProjectId) params.set('projectId', filterProjectId);
        if (unpaidOnly) params.set('unpaidOnly', 'true');

        const [nextBrokers, nextCommissions, nextContracts, nextRates, nextProjects] = await Promise.all([
          hasPermission(nextProfile, 'broker.read')
            ? apiRequest<Broker[]>('/brokers', { method: 'GET' }, authToken)
            : Promise.resolve([]),
          hasPermission(nextProfile, 'broker-commission.read')
            ? apiRequest<Commission[]>(`/broker-commissions?${params}`, { method: 'GET' }, authToken)
            : Promise.resolve([]),
          hasPermission(nextProfile, 'sales-contract.read')
            ? apiRequest<any>('/sales-contracts', { method: 'GET' }, authToken)
            : Promise.resolve([]),
          hasPermission(nextProfile, 'tax-rate.read')
            ? apiRequest<TaxRate[]>('/tax-rates', { method: 'GET' }, authToken)
            : Promise.resolve([]),
          hasPermission(nextProfile, 'project.read')
            ? apiRequest<Project[]>('/projects', { method: 'GET' }, authToken)
            : Promise.resolve([]),
        ]);

        setBrokers(nextBrokers);
        setCommissions(nextCommissions);
        setContracts(Array.isArray(nextContracts) ? nextContracts : nextContracts.items || []);
        setTaxRates(nextRates.filter((rate: any) => rate.appliesTo === 'WITHHOLDING'));
        setProjects(nextProjects);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load brokers.');
      } finally {
        setLoading(false);
      }
    },
    [filterBrokerId, filterProjectId, unpaidOnly],
  );

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const canReadBrokers = hasPermission(profile, 'broker.read');
  const canManageBrokers = hasPermission(profile, 'broker.create');
  const canCreateCommission = hasPermission(profile, 'broker-commission.create');
  const canUpdateCommission = hasPermission(profile, 'broker-commission.update');
  const canPay = hasPermission(profile, 'broker-commission-payment.create');
  const roleLabel = useMemo(() => roleLabelFor(profile), [profile]);

  const totals = useMemo(() => {
    let earned = 0;
    let paid = 0;
    let outstanding = 0;
    for (const commission of commissions) {
      if (commission.status === 'CANCELLED') continue;
      earned += Number(commission.amount);
      paid += Number(commission.amountPaid || 0);
      outstanding += Number(commission.outstanding || 0);
    }
    return { earned, paid, outstanding };
  }, [commissions]);

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

  async function onSaveBroker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const payload = {
      name: brokerForm.name.trim(),
      companyName: brokerForm.companyName.trim() || undefined,
      email: brokerForm.email.trim() || undefined,
      phone: brokerForm.phone.trim() || undefined,
      kraPin: brokerForm.kraPin.trim() || undefined,
      // Entered as a percentage, stored as a decimal.
      defaultRate: Number(brokerForm.defaultRatePercent || 0) / 100,
      defaultWhtRateId: brokerForm.defaultWhtRateId || null,
      notes: brokerForm.notes.trim() || undefined,
      isActive: brokerForm.isActive,
    };

    await runMutation(async () => {
      if (editingBrokerId) {
        await apiRequest(`/brokers/${editingBrokerId}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
      } else {
        await apiRequest('/brokers', { method: 'POST', body: JSON.stringify(payload) }, token);
      }
      setShowBrokerForm(false);
      setEditingBrokerId(null);
      setBrokerForm(emptyBrokerForm());
    }, editingBrokerId ? 'Broker updated.' : 'Broker added.');
  }

  async function onCreateCommission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    await runMutation(async () => {
      await apiRequest(
        '/broker-commissions',
        {
          method: 'POST',
          body: JSON.stringify({
            brokerId: commissionForm.brokerId,
            contractId: commissionForm.contractId,
            ratePercent: commissionForm.ratePercent ? Number(commissionForm.ratePercent) / 100 : undefined,
            amount: commissionForm.amount ? Number(commissionForm.amount) : undefined,
            notes: commissionForm.notes.trim() || undefined,
          }),
        },
        token,
      );
      setShowCommissionForm(false);
      setCommissionForm({ brokerId: '', contractId: '', ratePercent: '', amount: '', notes: '' });
    }, 'Commission recorded and posted to the ledger.');
  }

  async function onApprove(commission: Commission) {
    if (!token) return;
    await runMutation(async () => {
      await apiRequest(`/broker-commissions/${commission.id}/approve`, { method: 'PATCH' }, token);
    }, 'Commission approved.');
  }

  async function onCancel(commission: Commission) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Cancel commission',
      message:
        'This reverses the expense and the amount owed to the broker. Use it when a sale falls through.',
      confirmLabel: 'Cancel commission',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(
        `/broker-commissions/${commission.id}/cancel`,
        { method: 'PATCH', body: JSON.stringify({ reason: 'Cancelled from portal' }) },
        token,
      );
    }, 'Commission cancelled and reversed.');
  }

  async function onPay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !payingId) return;
    await runMutation(async () => {
      await apiRequest(
        `/broker-commissions/${payingId}/payments`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: Number(payForm.amount),
            whtRateId: payForm.whtRateId || null,
            reference: payForm.reference.trim() || undefined,
            paymentMethod: payForm.paymentMethod,
          }),
        },
        token,
      );
      setPayingId(null);
      setPayForm({ amount: '', whtRateId: '', reference: '', paymentMethod: 'BANK_TRANSFER' });
    }, 'Payment recorded.');
  }

  const commissionControls = useListControls(commissions, (row) => [
    row.broker?.name,
    row.broker?.companyName,
    row.unit?.unitNumber,
    row.contract?.contractNumber,
    row.status,
  ]);

  const brokerControls = useListControls(brokers, (broker) => [
    broker.name,
    broker.companyName,
    broker.email,
    broker.phone,
  ]);

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-auth-section" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading brokers...</article>
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

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="brokers"
            pageSubtitle="Agents who introduce buyers, what they have earned, and what is still owed."
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={hasPermission(profile, 'role.read')}
            onLogout={onLogout}
            onRefresh={() => token && void load(token)}
          >

            {!canReadBrokers ? (
              <article className="portal-card portal-role-banner">
                You do not have permission to view brokers.
              </article>
            ) : (
              <>
                <div className="portal-stats-grid">
                  <article className="portal-card portal-stat-card">
                    <span>Commission Earned</span>
                    <strong>{formatMoney(totals.earned)}</strong>
                  </article>
                  <article className="portal-card portal-stat-card">
                    <span>Paid Out</span>
                    <strong>{formatMoney(totals.paid)}</strong>
                  </article>
                  <article className="portal-card portal-stat-card">
                    <span>Still Owed</span>
                    <strong>{formatMoney(totals.outstanding)}</strong>
                  </article>
                  <article className="portal-card portal-stat-card">
                    <span>Active Brokers</span>
                    <strong>{brokers.filter((broker) => broker.isActive).length}</strong>
                  </article>
                </div>

                <div className="portal-auth-toggle" role="tablist" style={{ maxWidth: 420 }}>
                  <button
                    type="button"
                    className={tab === 'commissions' ? 'is-active' : ''}
                    onClick={() => setTab('commissions')}
                  >
                    Commissions
                  </button>
                  <button
                    type="button"
                    className={tab === 'brokers' ? 'is-active' : ''}
                    onClick={() => setTab('brokers')}
                  >
                    Brokers
                  </button>
                </div>

                {tab === 'commissions' ? (
                  <article className="portal-card" data-tour="brokers.commissions">
                    <div className="portal-card-header-row">
                      <h2 style={{ margin: 0 }}>Commissions</h2>
                      {canCreateCommission ? (
                        <button
                          type="button"
                          className="portal-inline-btn"
                          onClick={() => setShowCommissionForm((prev) => !prev)}
                        >
                          {showCommissionForm ? 'Close' : 'Record Commission'}
                        </button>
                      ) : null}
                    </div>

                    {showCommissionForm && canCreateCommission ? (
                      <form className="portal-entity-form portal-detail-form" onSubmit={onCreateCommission}>
                        <div className="portal-entity-grid-2">
                          <label>
                            <span>Broker</span>
                            <select
                              value={commissionForm.brokerId}
                              onChange={(event) =>
                                setCommissionForm((prev) => ({ ...prev, brokerId: event.target.value }))
                              }
                              required
                            >
                              <option value="">Select broker</option>
                              {brokers
                                .filter((broker) => broker.isActive)
                                .map((broker) => (
                                  <option key={broker.id} value={broker.id}>
                                    {broker.companyName || broker.name} ({Number(broker.defaultRate) * 100}%)
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label>
                            <span>Sales Contract</span>
                            <select
                              value={commissionForm.contractId}
                              onChange={(event) =>
                                setCommissionForm((prev) => ({ ...prev, contractId: event.target.value }))
                              }
                              required
                            >
                              <option value="">Select contract</option>
                              {contracts
                                .filter((contract) => contract.contractStatus === 'ACTIVE')
                                .map((contract) => (
                                  <option key={contract.id} value={contract.id}>
                                    {contract.contractNumber} — {formatMoney(contract.totalAgreedPrice)}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                        <div className="portal-entity-grid-2">
                          <label>
                            <span>Rate % (blank uses the broker default)</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={commissionForm.ratePercent}
                              onChange={(event) =>
                                setCommissionForm((prev) => ({ ...prev, ratePercent: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Or a fixed amount</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={commissionForm.amount}
                              onChange={(event) =>
                                setCommissionForm((prev) => ({ ...prev, amount: event.target.value }))
                              }
                            />
                          </label>
                        </div>
                        <label>
                          <span>Notes</span>
                          <input
                            value={commissionForm.notes}
                            onChange={(event) =>
                              setCommissionForm((prev) => ({ ...prev, notes: event.target.value }))
                            }
                          />
                        </label>
                        <p className="portal-muted" style={{ margin: 0 }}>
                          Recording this expenses the commission against the unit&apos;s project and records what
                          is owed to the broker. Withholding tax is deducted when you pay.
                        </p>
                        <button type="submit" className="portal-primary-btn" disabled={mutating}>
                          {mutating ? 'Saving...' : 'Record Commission'}
                        </button>
                      </form>
                    ) : null}

                    <div className="portal-entity-form" style={{ marginBottom: 14 }}>
                      <div className="portal-entity-grid-3">
                        <label>
                          <span>Broker</span>
                          <select value={filterBrokerId} onChange={(event) => setFilterBrokerId(event.target.value)}>
                            <option value="">All brokers</option>
                            {brokers.map((broker) => (
                              <option key={broker.id} value={broker.id}>
                                {broker.companyName || broker.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Project</span>
                          <select value={filterProjectId} onChange={(event) => setFilterProjectId(event.target.value)}>
                            <option value="">All projects</option>
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.code} — {project.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="portal-check" style={{ alignSelf: 'end' }}>
                          <input
                            type="checkbox"
                            checked={unpaidOnly}
                            onChange={(event) => setUnpaidOnly(event.target.checked)}
                          />
                          <span>Only unpaid</span>
                        </label>
                      </div>
                    </div>

                    <div className="list-toolbar">
                      <ListSearch controls={commissionControls} placeholder="Search broker, unit, contract…" />
                      <ListExport
                        rows={commissionControls.filtered}
                        config={{
                          fileName: 'broker-commissions',
                          dateOf: (row) => row.earnedAt,
                          dateLabel: 'Earned',
                          columns: [
                            { header: 'Broker', value: (row) => row.broker?.companyName || row.broker?.name || '' },
                            { header: 'Unit', value: (row) => row.unit?.unitNumber || '' },
                            { header: 'Contract', value: (row) => row.contract?.contractNumber || '' },
                            { header: 'Sale Price', value: (row) => Number(row.salePrice) },
                            { header: 'Rate %', value: (row) => (row.ratePercent == null ? '' : Number(row.ratePercent)) },
                            { header: 'Currency', value: (row) => row.currency },
                            { header: 'Amount', value: (row) => Number(row.amount) },
                            { header: 'Status', value: (row) => row.status },
                            { header: 'Earned', value: (row) => formatDate(row.earnedAt) },
                            { header: 'Notes', value: (row) => row.notes || '' },
                          ],
                        }}
                      />
                    </div>

                    <div className="portal-list-stack">
                      {commissionControls.visible.length === 0 ? (
                        <div className="portal-empty-state">
                          {commissionControls.search
                            ? 'No commissions match that search.'
                            : 'No commissions recorded yet.'}
                        </div>
                      ) : (
                        commissionControls.visible.map((commission) => (
                          <div key={commission.id} className="portal-record">
                            <div className="portal-list-row">
                              <div>
                                <strong>
                                  {commission.broker?.companyName || commission.broker?.name} —{' '}
                                  {commission.unit?.unitNumber}
                                </strong>
                                <p>
                                  {commission.contract?.contractNumber} • sale{' '}
                                  {formatMoney(commission.salePrice)}
                                  {commission.ratePercent
                                    ? ` • ${(Number(commission.ratePercent) * 100).toFixed(2)}%`
                                    : ' • fixed amount'}{' '}
                                  • earned {formatDate(commission.earnedAt)}
                                </p>
                                {commission.payments.length ? (
                                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                    Paid {formatMoney(commission.amountPaid || 0)} across{' '}
                                    {commission.payments.length} payment
                                    {commission.payments.length === 1 ? '' : 's'}
                                    {commission.payments.some((p) => Number(p.whtAmount) > 0)
                                      ? ` • WHT ${formatMoney(
                                          commission.payments.reduce((s, p) => s + Number(p.whtAmount), 0),
                                        )}`
                                      : ''}
                                  </p>
                                ) : null}
                              </div>
                              <span>{STATUS_LABELS[commission.status]}</span>
                              <span>{formatMoney(commission.amount)}</span>
                            </div>

                            {commission.status !== 'CANCELLED' && commission.status !== 'PAID' ? (
                              <p className="portal-muted" style={{ margin: '6px 0 0' }}>
                                Outstanding {formatMoney(commission.outstanding || 0)}
                              </p>
                            ) : null}

                            <div className="portal-action-row">
                              {canUpdateCommission && commission.status === 'PENDING' ? (
                                <button
                                  type="button"
                                  className="portal-inline-btn"
                                  disabled={mutating}
                                  onClick={() => void onApprove(commission)}
                                >
                                  Approve
                                </button>
                              ) : null}
                              {canPay &&
                              (commission.status === 'APPROVED' || commission.status === 'PARTIALLY_PAID') ? (
                                <button
                                  type="button"
                                  className="portal-inline-btn"
                                  onClick={() => {
                                    setPayingId(payingId === commission.id ? null : commission.id);
                                    setPayForm({
                                      amount: String(commission.outstanding ?? ''),
                                      whtRateId: '',
                                      reference: '',
                                      paymentMethod: 'BANK_TRANSFER',
                                    });
                                  }}
                                >
                                  {payingId === commission.id ? 'Cancel' : 'Pay Broker'}
                                </button>
                              ) : null}
                              {canUpdateCommission &&
                              commission.status !== 'CANCELLED' &&
                              !commission.payments.length ? (
                                <button
                                  type="button"
                                  className="portal-inline-btn is-danger"
                                  disabled={mutating}
                                  onClick={() => void onCancel(commission)}
                                >
                                  Cancel
                                </button>
                              ) : null}
                            </div>

                            {payingId === commission.id && canPay ? (
                              <form className="portal-entity-form portal-inline-form" onSubmit={onPay}>
                                <div className="portal-entity-grid-3">
                                  <label>
                                    <span>Amount (gross)</span>
                                    <input
                                      type="number"
                                      min={0.01}
                                      step="0.01"
                                      value={payForm.amount}
                                      onChange={(event) =>
                                        setPayForm((prev) => ({ ...prev, amount: event.target.value }))
                                      }
                                      required
                                    />
                                  </label>
                                  <label>
                                    <span>Withholding Tax</span>
                                    <select
                                      value={payForm.whtRateId}
                                      onChange={(event) =>
                                        setPayForm((prev) => ({ ...prev, whtRateId: event.target.value }))
                                      }
                                    >
                                      <option value="">Broker default</option>
                                      {taxRates.map((rate) => (
                                        <option key={rate.id} value={rate.id}>
                                          {rate.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    <span>Reference</span>
                                    <input
                                      value={payForm.reference}
                                      onChange={(event) =>
                                        setPayForm((prev) => ({ ...prev, reference: event.target.value }))
                                      }
                                    />
                                  </label>
                                </div>
                                <p className="portal-muted" style={{ margin: 0 }}>
                                  Withholding tax is deducted from what the broker receives and posted to the tax
                                  payable account.
                                </p>
                                <button type="submit" className="portal-primary-btn" disabled={mutating}>
                                  {mutating ? 'Saving...' : 'Record Payment'}
                                </button>
                              </form>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                    <ListPager controls={commissionControls} noun="commissions" />
                  </article>
                ) : null}

                {tab === 'brokers' ? (
                  <article className="portal-card" data-tour="brokers.list">
                    <div className="portal-card-header-row">
                      <h2 style={{ margin: 0 }}>Brokers</h2><TourLauncher tour="inquiries-and-brokers" />
                      {canManageBrokers ? (
                        <button
                          type="button"
                          className="portal-inline-btn"
                          onClick={() => {
                            setEditingBrokerId(null);
                            setBrokerForm(emptyBrokerForm());
                            setShowBrokerForm((prev) => !prev);
                          }}
                        >
                          {showBrokerForm ? 'Close' : 'Add Broker'}
                        </button>
                      ) : null}
                    </div>

                    {showBrokerForm && canManageBrokers ? (
                      <form className="portal-entity-form portal-detail-form" onSubmit={onSaveBroker}>
                        <div className="portal-entity-grid-2">
                          <label>
                            <span>Name</span>
                            <input
                              value={brokerForm.name}
                              onChange={(event) => setBrokerForm((prev) => ({ ...prev, name: event.target.value }))}
                              required
                            />
                          </label>
                          <label>
                            <span>Company</span>
                            <input
                              value={brokerForm.companyName}
                              onChange={(event) =>
                                setBrokerForm((prev) => ({ ...prev, companyName: event.target.value }))
                              }
                            />
                          </label>
                        </div>
                        <div className="portal-entity-grid-3">
                          <label>
                            <span>Phone</span>
                            <input
                              value={brokerForm.phone}
                              onChange={(event) => setBrokerForm((prev) => ({ ...prev, phone: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>Email</span>
                            <input
                              type="email"
                              value={brokerForm.email}
                              onChange={(event) => setBrokerForm((prev) => ({ ...prev, email: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>KRA PIN</span>
                            <input
                              value={brokerForm.kraPin}
                              onChange={(event) => setBrokerForm((prev) => ({ ...prev, kraPin: event.target.value }))}
                            />
                          </label>
                        </div>
                        <div className="portal-entity-grid-2">
                          <label>
                            <span>Default Commission Rate (%)</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={brokerForm.defaultRatePercent}
                              onChange={(event) =>
                                setBrokerForm((prev) => ({ ...prev, defaultRatePercent: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Withholding Tax on Payment</span>
                            <select
                              value={brokerForm.defaultWhtRateId}
                              onChange={(event) =>
                                setBrokerForm((prev) => ({ ...prev, defaultWhtRateId: event.target.value }))
                              }
                            >
                              <option value="">None</option>
                              {taxRates.map((rate) => (
                                <option key={rate.id} value={rate.id}>
                                  {rate.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label>
                          <span>Notes</span>
                          <input
                            value={brokerForm.notes}
                            onChange={(event) => setBrokerForm((prev) => ({ ...prev, notes: event.target.value }))}
                          />
                        </label>
                        <div className="portal-check-row">
                          <label className="portal-check">
                            <input
                              type="checkbox"
                              checked={brokerForm.isActive}
                              onChange={(event) =>
                                setBrokerForm((prev) => ({ ...prev, isActive: event.target.checked }))
                              }
                            />
                            <span>Active</span>
                          </label>
                        </div>
                        <button type="submit" className="portal-primary-btn" disabled={mutating}>
                          {mutating ? 'Saving...' : editingBrokerId ? 'Save Broker' : 'Add Broker'}
                        </button>
                      </form>
                    ) : null}

                    <div className="list-toolbar">
                      <ListSearch controls={brokerControls} placeholder="Search brokers…" />
                      <ListExport
                        rows={brokerControls.filtered}
                        config={{
                          fileName: 'brokers',
                          columns: [
                            { header: 'Name', value: (row) => row.name },
                            { header: 'Company', value: (row) => row.companyName || '' },
                            { header: 'Email', value: (row) => row.email || '' },
                            { header: 'Phone', value: (row) => row.phone || '' },
                          ],
                        }}
                      />
                    </div>
                    <div className="portal-list-stack">
                      {brokerControls.visible.length === 0 ? (
                        <div className="portal-empty-state">
                          {brokerControls.search ? 'No brokers match that search.' : 'No brokers yet.'}
                        </div>
                      ) : (
                        brokerControls.visible.map((broker) => {
                          const theirs = commissions.filter(
                            (commission) =>
                              commission.brokerId === broker.id && commission.status !== 'CANCELLED',
                          );
                          const earned = theirs.reduce((sum, c) => sum + Number(c.amount), 0);
                          const owing = theirs.reduce((sum, c) => sum + Number(c.outstanding || 0), 0);
                          return (
                            <div key={broker.id} className="portal-record">
                              <div className="portal-list-row">
                                <div>
                                  <strong>
                                    {broker.companyName || broker.name}
                                    {!broker.isActive ? ' (inactive)' : ''}
                                  </strong>
                                  <p>
                                    {broker.companyName ? `${broker.name} • ` : ''}
                                    {[broker.phone, broker.email].filter(Boolean).join(' • ') || 'No contact'}
                                  </p>
                                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                    {(Number(broker.defaultRate) * 100).toFixed(2)}% default
                                    {broker.defaultWhtRate ? ` • ${broker.defaultWhtRate.name}` : ' • no WHT'}
                                    {broker.kraPin ? ` • PIN ${broker.kraPin}` : ''}
                                  </p>
                                </div>
                                <span>{theirs.length} sale{theirs.length === 1 ? '' : 's'}</span>
                                <span>{formatMoney(earned)}</span>
                              </div>
                              {owing > 0 ? (
                                <p className="portal-muted" style={{ margin: '6px 0 0' }}>
                                  Owed {formatMoney(owing)}
                                </p>
                              ) : null}
                              {canManageBrokers ? (
                                <div className="portal-action-row">
                                  <button
                                    type="button"
                                    className="portal-inline-btn"
                                    onClick={() => {
                                      setEditingBrokerId(broker.id);
                                      setBrokerForm({
                                        name: broker.name,
                                        companyName: broker.companyName || '',
                                        email: broker.email || '',
                                        phone: broker.phone || '',
                                        kraPin: broker.kraPin || '',
                                        defaultRatePercent: String(Number(broker.defaultRate) * 100),
                                        defaultWhtRateId: broker.defaultWhtRateId || '',
                                        notes: broker.notes || '',
                                        isActive: broker.isActive,
                                      });
                                      setShowBrokerForm(true);
                                    }}
                                  >
                                    Edit
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                    <ListPager controls={brokerControls} noun="brokers" />
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
