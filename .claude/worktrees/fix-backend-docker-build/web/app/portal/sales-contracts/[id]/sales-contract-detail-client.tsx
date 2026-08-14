"use client";

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { usePortalDialog } from '../../components/portal-dialog';

type AuthRole = { id: string; name: string; permissions: string[] };

type AuthProfile = {
  id: string;
  email: string;
  name?: string;
  role: string | null;
  roles?: AuthRole[];
  permissions?: string[];
};

type Unit = {
  id: string;
  unitNumber: string;
  block: { blockName: string; project: { name: string } };
};

type Customer = { id: string; firstName: string; lastName: string; email: string };

type Installment = {
  id: string;
  sequence: number;
  dueDate: string;
  amount: string | number;
  invoiceId?: string | null;
};

type SalesContract = {
  id: string;
  contractNumber: string;
  currency: string;
  totalAgreedPrice: string | number;
  contractStatus: string;
  unit: Unit;
  primaryCustomer: Customer;
  installments: Installment[];
};

type InvoiceLine = { id: string; description: string; amount: string | number; taxAmount?: string | number };

type Invoice = {
  id: string;
  invoiceNumber: string;
  amount: string | number;
  currency: string;
  dueDate: string;
  status: string;
  issuedAt: string;
  lines: InvoiceLine[];
};

type PaymentSummary = {
  totalAgreedPrice: number;
  paid: number;
  balance: number;
  paidPercent: number;
};

type AvailableUnit = {
  id: string;
  unitNumber: string;
  status: string;
  priceKes: string | number;
  priceUsd: string | number;
};

type Amendment = {
  id: string;
  type: 'UNIT_TRANSFER' | 'PRICE_CHANGE' | 'OWNERSHIP_TRANSFER' | 'CANCELLATION' | 'MANUAL_EDIT';
  fieldChanges: Record<string, unknown>;
  reason?: string | null;
  amendedBy: string;
  amendedAt: string;
};

const AMENDMENT_TYPE_LABELS: Record<Amendment['type'], string> = {
  UNIT_TRANSFER: 'Unit Transfer',
  PRICE_CHANGE: 'Price Change',
  OWNERSHIP_TRANSFER: 'Ownership Transfer',
  CANCELLATION: 'Cancellation',
  MANUAL_EDIT: 'Manual Edit',
};

type InstallmentForm = { dueDate: string; amount: string };

type PaymentFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY';

type GeneratorForm = {
  startDate: string;
  years: string;
  months: string;
  frequency: PaymentFrequency;
  depositAmount: string;
};

const FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  SEMI_ANNUALLY: 'Semi-Annually',
  ANNUALLY: 'Annually',
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const TOKEN_KEY = 'drl_access_token';

async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function downloadFile(path: string, token: string, fallbackFileName: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `Download failed with status ${response.status}`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const fileName = match ? match[1] : fallbackFileName;

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function hasPermission(profile: AuthProfile | null | undefined, permission: string): boolean {
  if (!profile) return false;
  if (profile.role === 'ADMIN' || profile.roles?.some((role) => role.name === 'ADMIN')) return true;
  return Boolean(profile.permissions?.includes(permission));
}

function formatMoney(value: string | number, currency: string) {
  const numericValue = Number(value || 0);
  if (Number.isNaN(numericValue)) return `${currency} 0.00`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(numericValue);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

function toDateInputValue(value?: string) {
  if (!value) return '';
  return value.slice(0, 10);
}

function makeInstallmentsFromContract(contract: SalesContract | null): InstallmentForm[] {
  if (!contract || contract.installments.length === 0) return [];
  return contract.installments.map((installment) => ({
    dueDate: toDateInputValue(installment.dueDate),
    amount: String(Number(installment.amount)),
  }));
}

export default function SalesContractDetailClient({ contractId }: { contractId: string }) {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const [contract, setContract] = useState<SalesContract | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [installmentForms, setInstallmentForms] = useState<InstallmentForm[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [downloadingScheduleId, setDownloadingScheduleId] = useState(false);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const [downloadingContract, setDownloadingContract] = useState(false);

  const [showGenerator, setShowGenerator] = useState(false);
  const [generatorForm, setGeneratorForm] = useState<GeneratorForm>({
    startDate: '',
    years: '0',
    months: '0',
    frequency: 'MONTHLY',
    depositAmount: '',
  });
  const [generating, setGenerating] = useState(false);

  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [availableUnits, setAvailableUnits] = useState<AvailableUnit[]>([]);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferToUnitId, setTransferToUnitId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferring, setTransferring] = useState(false);

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRate, setCancelRate] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(
    async (authToken: string) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);
        setProfile(nextProfile);

        const nextContract = await apiRequest<SalesContract>(`/sales-contracts/${contractId}`, { method: 'GET' }, authToken);
        setContract(nextContract);
        setInstallmentForms(makeInstallmentsFromContract(nextContract));

        const summary = await apiRequest<PaymentSummary>(`/sales-contracts/${contractId}/payment-summary`, { method: 'GET' }, authToken);
        setPaymentSummary(summary);

        if (hasPermission(nextProfile, 'invoice.read')) {
          const allInvoices = await apiRequest<Invoice[]>('/invoices?take=500', { method: 'GET' }, authToken);
          const invoiceIds = new Set(nextContract.installments.map((installment) => installment.invoiceId).filter(Boolean));
          setInvoices(allInvoices.filter((invoice) => invoiceIds.has(invoice.id)));
        }

        if (hasPermission(nextProfile, 'sales-contract.read')) {
          const nextAmendments = await apiRequest<Amendment[]>(`/sales-contracts/${contractId}/amendments`, { method: 'GET' }, authToken);
          setAmendments(nextAmendments);
        }

        if (hasPermission(nextProfile, 'unit.read')) {
          const allUnits = await apiRequest<AvailableUnit[]>('/units?take=1000', { method: 'GET' }, authToken);
          setAvailableUnits(allUnits.filter((unit) => unit.status === 'AVAILABLE' && unit.id !== nextContract.unit.id));
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load sales contract.');
      } finally {
        setLoading(false);
      }
    },
    [contractId],
  );

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const canUpdate = hasPermission(profile, 'sales-contract.update');

  const scheduledTotal = useMemo(
    () => installmentForms.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [installmentForms],
  );

  const hasInvoicedInstallments = useMemo(
    () => (contract?.installments || []).some((installment) => Boolean(installment.invoiceId)),
    [contract],
  );

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  function updateInstallment(index: number, patch: Partial<InstallmentForm>) {
    setInstallmentForms((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function addInstallment() {
    setInstallmentForms((prev) => [...prev, { dueDate: '', amount: '' }]);
  }

  function removeInstallment(index: number) {
    setInstallmentForms((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  async function onSaveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdate) return;

    setSavingSchedule(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      await apiRequest(
        `/sales-contracts/${contractId}/payment-schedule`,
        {
          method: 'POST',
          body: JSON.stringify({
            installments: installmentForms
              .filter((item) => item.dueDate && item.amount)
              .map((item) => ({ dueDate: item.dueDate, amount: Number(item.amount) })),
          }),
        },
        token,
      );
      setFeedback('Payment schedule saved.');
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save payment schedule.');
    } finally {
      setSavingSchedule(false);
    }
  }

  async function onDownloadSchedule() {
    if (!token || !contract) return;
    setDownloadingScheduleId(true);
    setErrorMessage(null);
    try {
      await downloadFile(
        `/sales-contracts/${contractId}/payment-schedule/pdf`,
        token,
        `payment-schedule-${contract.contractNumber}.pdf`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download payment schedule.');
    } finally {
      setDownloadingScheduleId(false);
    }
  }

  async function onDownloadContract() {
    if (!token || !contract) return;
    setDownloadingContract(true);
    setErrorMessage(null);
    try {
      await downloadFile(`/sales-contracts/${contractId}/pdf`, token, `contract-${contract.contractNumber}.pdf`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download contract.');
    } finally {
      setDownloadingContract(false);
    }
  }

  async function onGenerateSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdate) return;

    const durationMonths = Number(generatorForm.years || 0) * 12 + Number(generatorForm.months || 0);
    if (durationMonths <= 0) {
      setErrorMessage('Enter a payment period of at least one month.');
      return;
    }

    setGenerating(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      const result = await apiRequest<{ installments: { dueDate: string; amount: number }[] }>(
        `/sales-contracts/${contractId}/payment-schedule/generate`,
        {
          method: 'POST',
          body: JSON.stringify({
            startDate: generatorForm.startDate,
            durationMonths,
            frequency: generatorForm.frequency,
            depositAmount: generatorForm.depositAmount ? Number(generatorForm.depositAmount) : undefined,
          }),
        },
        token,
      );
      setInstallmentForms(
        result.installments.map((item) => ({ dueDate: item.dueDate, amount: String(item.amount) })),
      );
      setFeedback('Schedule generated below — review and adjust before saving.');
      setShowGenerator(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to generate payment schedule.');
    } finally {
      setGenerating(false);
    }
  }

  async function onTransferUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdate || !transferToUnitId) return;

    setTransferring(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      const result = await apiRequest<{ excessAmount: number }>(
        '/unit-transfers',
        {
          method: 'POST',
          body: JSON.stringify({
            contractId,
            toUnitId: transferToUnitId,
            reason: transferReason || undefined,
          }),
        },
        token,
      );
      setFeedback(
        result.excessAmount > 0
          ? `Unit transferred. The customer has overpaid by ${formatMoney(result.excessAmount, contract?.currency || 'KES')} against the new unit's price — process a refund for the excess.`
          : 'Unit transferred. Payments carried over; generate a new schedule for the outstanding balance.',
      );
      setShowTransferForm(false);
      setTransferToUnitId('');
      setTransferReason('');
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to transfer unit.');
    } finally {
      setTransferring(false);
    }
  }

  async function onCancelContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdate || !cancelReason) return;
    const confirmed = await dialog.confirm({
      title: 'Cancel Contract',
      message: 'Cancel this contract? The unit will be released and any un-invoiced schedule cleared.',
      confirmLabel: 'Cancel Contract',
      danger: true,
    });
    if (!confirmed) return;

    setCancelling(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      const result = await apiRequest<{ cancellationCharge: number; refundableAmount: number }>(
        `/sales-contracts/${contractId}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: cancelReason,
            cancellationChargeRate: cancelRate ? Number(cancelRate) / 100 : undefined,
            cancelledBy: profile?.email,
          }),
        },
        token,
      );
      setFeedback(
        `Contract cancelled. Cancellation charge ${formatMoney(result.cancellationCharge, contract?.currency || 'KES')}; ${formatMoney(result.refundableAmount, contract?.currency || 'KES')} is refundable to the customer.`,
      );
      setShowCancelForm(false);
      setCancelReason('');
      setCancelRate('');
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to cancel contract.');
    } finally {
      setCancelling(false);
    }
  }

  async function onDownloadInvoice(invoice: Invoice) {
    if (!token) return;
    setDownloadingInvoiceId(invoice.id);
    setErrorMessage(null);
    try {
      await downloadFile(`/invoices/${invoice.id}/pdf`, token, `invoice-${invoice.invoiceNumber}.pdf`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download invoice.');
    } finally {
      setDownloadingInvoiceId(null);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading sales contract...</article>
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

  if (!contract) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main is-authenticated">
          <section className="lp-container portal-auth-section">
            <PortalShell
              active="units"
              pageTitle="Sales Contract"
              email={profile.email}
              roleLabel={profile.role || 'Unassigned'}
              permissionCount={profile.permissions?.length || 0}
              canReadRbac={false}
              onLogout={onLogout}
            >
              <article className="portal-card portal-error">{errorMessage || 'Contract not found.'}</article>
            </PortalShell>
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
            active="units"
            pageTitle={`Contract ${contract.contractNumber}`}
            pageSubtitle="Payment schedule and generated invoices for this sales contract."
            email={profile.email}
            roleLabel={profile.role || 'Unassigned'}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={false}
            onLogout={onLogout}
          >
            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <Link href={`/portal/units/${contract.unit.id}`} className="portal-ghost-btn">
                Back to Unit
              </Link>
              <button type="button" className="portal-inline-btn" disabled={downloadingContract} onClick={() => void onDownloadContract()}>
                {downloadingContract ? 'Preparing...' : 'Download Contract'}
              </button>
            </div>

            {feedback ? <article className="portal-card portal-feedback">{feedback}</article> : null}
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <article className="portal-card">
              <div className="portal-detail-stats">
                <div>
                  <span>Unit</span>
                  <strong>
                    {contract.unit.block.project.name} — Block {contract.unit.block.blockName}, Unit {contract.unit.unitNumber}
                  </strong>
                </div>
                <div>
                  <span>Customer</span>
                  <strong>
                    {contract.primaryCustomer.firstName} {contract.primaryCustomer.lastName}
                  </strong>
                </div>
                <div>
                  <span>Total Agreed Price</span>
                  <strong>{formatMoney(contract.totalAgreedPrice, contract.currency)}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{contract.contractStatus}</strong>
                </div>
                {paymentSummary ? (
                  <>
                    <div>
                      <span>Paid to Date</span>
                      <strong>
                        {formatMoney(paymentSummary.paid, contract.currency)} ({paymentSummary.paidPercent.toFixed(1)}%)
                      </strong>
                    </div>
                    <div>
                      <span>Balance</span>
                      <strong>{formatMoney(paymentSummary.balance, contract.currency)}</strong>
                    </div>
                  </>
                ) : null}
              </div>
              {paymentSummary ? (
                <div className="portal-progress-bar" style={{ marginTop: 12 }}>
                  <div
                    className="portal-progress-bar-fill"
                    style={{ width: `${Math.min(paymentSummary.paidPercent, 100)}%` }}
                  />
                </div>
              ) : null}
            </article>

            {canUpdate && contract.contractStatus !== 'CANCELLED' ? (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Unit Transfer &amp; Cancellation</h2>
                </div>
                <div className="portal-action-row" style={{ marginBottom: 12 }}>
                  <button type="button" className="portal-inline-btn" onClick={() => { setShowTransferForm((prev) => !prev); setShowCancelForm(false); }}>
                    {showTransferForm ? 'Close' : 'Change Unit'}
                  </button>
                  <button type="button" className="portal-inline-btn is-danger" onClick={() => { setShowCancelForm((prev) => !prev); setShowTransferForm(false); }}>
                    {showCancelForm ? 'Close' : 'Cancel Contract'}
                  </button>
                </div>

                {showTransferForm ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onTransferUnit}>
                    <p className="portal-muted" style={{ margin: '0 0 4px' }}>
                      Moves this customer to a different unit. Any un-invoiced installments are cleared and the
                      contract price updates to the new unit&apos;s price; payments already made carry over as-is.
                      The old unit becomes available; the new one is marked sold. If payments already made exceed the
                      new unit&apos;s price, the excess is reported so it can be refunded.
                    </p>
                    <label>
                      <span>New Unit</span>
                      <select value={transferToUnitId} onChange={(event) => setTransferToUnitId(event.target.value)} required>
                        <option value="">Select an available unit</option>
                        {availableUnits.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.unitNumber} — {formatMoney(contract.currency === 'USD' ? unit.priceUsd : unit.priceKes, contract.currency)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Reason (optional)</span>
                      <input value={transferReason} onChange={(event) => setTransferReason(event.target.value)} />
                    </label>
                    <button type="submit" className="portal-primary-btn" disabled={transferring || !transferToUnitId}>
                      {transferring ? 'Transferring...' : 'Transfer Unit'}
                    </button>
                  </form>
                ) : null}

                {showCancelForm ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onCancelContract}>
                    <p className="portal-muted" style={{ margin: '0 0 4px' }}>
                      Cancels the contract, releases the unit back to available, and clears any un-invoiced
                      installments. A cancellation charge is deducted from what&apos;s been paid to date; the
                      remainder is reported as refundable.
                    </p>
                    <label>
                      <span>Reason</span>
                      <input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} required />
                    </label>
                    <label>
                      <span>Cancellation Charge % (optional — defaults to the project&apos;s configured rate)</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={cancelRate}
                        onChange={(event) => setCancelRate(event.target.value)}
                      />
                    </label>
                    <button type="submit" className="portal-primary-btn is-danger" disabled={cancelling || !cancelReason}>
                      {cancelling ? 'Cancelling...' : 'Cancel Contract'}
                    </button>
                  </form>
                ) : null}
              </article>
            ) : null}

            <article className="portal-card">
              <div className="portal-card-header-row">
                <h2 style={{ margin: 0 }}>Payment Schedule</h2>
                <button
                  type="button"
                  className="portal-inline-btn"
                  disabled={downloadingScheduleId || contract.installments.length === 0}
                  onClick={() => void onDownloadSchedule()}
                >
                  {downloadingScheduleId ? 'Preparing...' : 'Download Schedule PDF'}
                </button>
              </div>
              <p className="portal-muted" style={{ margin: '0 0 12px' }}>
                Installments drive bulk invoice generation for this contract — each installment becomes its own invoice
                once its due date arrives. Contracts without a schedule fall back to a single invoice for the full
                contract amount.
              </p>

              {canUpdate && !hasInvoicedInstallments ? (
                <div className="portal-card" style={{ marginBottom: 12 }}>
                  <div className="portal-card-header-row">
                    <h3 style={{ margin: 0, fontSize: 15 }}>Generate Schedule Automatically</h3>
                    <button type="button" className="portal-inline-btn" onClick={() => setShowGenerator((prev) => !prev)}>
                      {showGenerator ? 'Close' : 'Generate'}
                    </button>
                  </div>
                  {showGenerator ? (
                    <form className="portal-entity-form portal-detail-form" onSubmit={onGenerateSchedule}>
                      <p className="portal-muted" style={{ margin: '0 0 4px' }}>
                        Pick a payment period (e.g. 3 years paid monthly) and the schedule below will be filled in
                        automatically, splitting the{' '}
                        {paymentSummary && paymentSummary.paid > 0
                          ? `outstanding balance of ${formatMoney(paymentSummary.balance, contract.currency)} (${formatMoney(paymentSummary.paid, contract.currency)} already paid)`
                          : 'agreed price'}
                        . You can still adjust any installment by hand afterwards.
                      </p>
                      <div className="portal-entity-grid-3">
                        <label>
                          <span>Start Date</span>
                          <input
                            type="date"
                            value={generatorForm.startDate}
                            onChange={(event) => setGeneratorForm((prev) => ({ ...prev, startDate: event.target.value }))}
                            required
                          />
                        </label>
                        <label>
                          <span>Years</span>
                          <input
                            type="number"
                            min={0}
                            max={50}
                            value={generatorForm.years}
                            onChange={(event) => setGeneratorForm((prev) => ({ ...prev, years: event.target.value }))}
                          />
                        </label>
                        <label>
                          <span>Months</span>
                          <input
                            type="number"
                            min={0}
                            max={11}
                            value={generatorForm.months}
                            onChange={(event) => setGeneratorForm((prev) => ({ ...prev, months: event.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="portal-entity-grid-2">
                        <label>
                          <span>Payment Frequency</span>
                          <select
                            value={generatorForm.frequency}
                            onChange={(event) => setGeneratorForm((prev) => ({ ...prev, frequency: event.target.value as PaymentFrequency }))}
                          >
                            {(Object.keys(FREQUENCY_LABELS) as PaymentFrequency[]).map((frequency) => (
                              <option key={frequency} value={frequency}>
                                {FREQUENCY_LABELS[frequency]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Upfront Deposit (optional)</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={generatorForm.depositAmount}
                            onChange={(event) => setGeneratorForm((prev) => ({ ...prev, depositAmount: event.target.value }))}
                          />
                        </label>
                      </div>
                      <button type="submit" className="portal-primary-btn" disabled={generating}>
                        {generating ? 'Generating...' : 'Generate Schedule'}
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}

              {hasInvoicedInstallments ? (
                <div className="portal-card portal-feedback" style={{ marginBottom: 12 }}>
                  Some installments already have invoices generated and can no longer be edited here. Cancel those
                  invoices first if the schedule needs to change.
                </div>
              ) : null}

              {canUpdate ? (
                <form className="portal-entity-form portal-detail-form" onSubmit={onSaveSchedule}>
                  {installmentForms.map((installment, index) => (
                    <div key={index} className="portal-entity-grid-3">
                      <label>
                        <span>Installment {index + 1} — Due Date</span>
                        <input
                          type="date"
                          value={installment.dueDate}
                          onChange={(event) => updateInstallment(index, { dueDate: event.target.value })}
                          disabled={hasInvoicedInstallments}
                          required
                        />
                      </label>
                      <label>
                        <span>Amount ({contract.currency})</span>
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={installment.amount}
                          onChange={(event) => updateInstallment(index, { amount: event.target.value })}
                          disabled={hasInvoicedInstallments}
                          required
                        />
                      </label>
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        {!hasInvoicedInstallments ? (
                          <button type="button" className="portal-inline-btn is-danger" onClick={() => removeInstallment(index)}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {!hasInvoicedInstallments ? (
                    <div className="portal-action-row">
                      <button type="button" className="portal-inline-btn" onClick={addInstallment}>
                        Add Installment
                      </button>
                    </div>
                  ) : null}

                  <p
                    style={{
                      fontSize: 13,
                      color: Math.abs(scheduledTotal - Number(contract.totalAgreedPrice)) < 0.01 ? '#2e7d43' : '#c0392b',
                    }}
                  >
                    Scheduled total {formatMoney(scheduledTotal, contract.currency)} of{' '}
                    {formatMoney(contract.totalAgreedPrice, contract.currency)} agreed
                    {Math.abs(scheduledTotal - Number(contract.totalAgreedPrice)) >= 0.01 ? ' (does not match agreed price)' : ''}
                  </p>

                  {!hasInvoicedInstallments ? (
                    <button type="submit" className="portal-primary-btn" disabled={savingSchedule || installmentForms.length === 0}>
                      {savingSchedule ? 'Saving...' : 'Save Schedule'}
                    </button>
                  ) : null}
                </form>
              ) : null}

              <div className="portal-list-stack" style={{ marginTop: 16 }}>
                {contract.installments.length === 0 ? (
                  <div className="portal-empty-state">No payment schedule configured yet.</div>
                ) : (
                  contract.installments.map((installment) => (
                    <div key={installment.id} className="portal-list-row">
                      <div>
                        <strong>Installment {installment.sequence}</strong>
                        <p>Due {formatDate(installment.dueDate)}</p>
                      </div>
                      <span>{installment.invoiceId ? 'Invoiced' : 'Pending'}</span>
                      <span>{formatMoney(installment.amount, contract.currency)}</span>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="portal-card">
              <h2 style={{ margin: '0 0 12px' }}>Generated Invoices</h2>
              <div className="portal-list-stack">
                {invoices.length === 0 ? (
                  <div className="portal-empty-state">No invoices generated from this contract yet.</div>
                ) : (
                  invoices.map((invoice) => (
                    <div key={invoice.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{invoice.invoiceNumber}</strong>
                          <p>Due {formatDate(invoice.dueDate)} • Issued {formatDate(invoice.issuedAt)}</p>
                        </div>
                        <span>{invoice.status.replaceAll('_', ' ')}</span>
                        <span>{formatMoney(invoice.amount, invoice.currency)}</span>
                      </div>
                      <div className="portal-action-row">
                        <button
                          type="button"
                          className="portal-inline-btn"
                          disabled={downloadingInvoiceId === invoice.id}
                          onClick={() => void onDownloadInvoice(invoice)}
                        >
                          {downloadingInvoiceId === invoice.id ? 'Preparing...' : 'Download PDF'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="portal-card">
              <h2 style={{ margin: '0 0 12px' }}>Amendment History</h2>
              <div className="portal-list-stack">
                {amendments.length === 0 ? (
                  <div className="portal-empty-state">No amendments recorded for this contract yet.</div>
                ) : (
                  amendments.map((amendment) => (
                    <div key={amendment.id} className="portal-list-row">
                      <div>
                        <strong>{AMENDMENT_TYPE_LABELS[amendment.type]}</strong>
                        <p>{amendment.reason || 'No reason recorded'}</p>
                        <p>
                          By {amendment.amendedBy} • {formatDate(amendment.amendedAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
