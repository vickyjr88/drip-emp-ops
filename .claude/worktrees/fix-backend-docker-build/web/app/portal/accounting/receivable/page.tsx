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
  downloadFile,
  formatDate,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../lib';

type Customer = { id: string; firstName: string; lastName: string; email: string };

type InvoiceLine = { id: string; description: string; amount: string | number };

type Invoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  sourceType: 'SALES_CONTRACT' | 'TENANCY' | 'MANUAL';
  currency: string;
  amount: string | number;
  dueDate: string;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' | 'OVERDUE';
  issuedAt: string;
  sentAt?: string | null;
  lines: InvoiceLine[];
  allocations?: { allocatedAmount: string | number }[];
};

type ReceiptAllocation = { id: string; invoiceId: string; allocatedAmount: string | number };

type Receipt = {
  id: string;
  receiptNumber: string;
  customerId: string;
  amount: string | number;
  currency: string;
  paymentMethod: string;
  status: 'ACTIVE' | 'CANCELLED' | 'REFUNDED';
  receivedAt: string;
  printCount: number;
  allocations: ReceiptAllocation[];
};

type AgingRow = {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: string;
  balance: number;
  daysOverdue: number;
  bucket: string;
};

type AgingReport = { asOf: string; buckets: Record<string, number>; rows: AgingRow[] };

type BankAccount = { id: string; name: string; type: 'BANK' | 'MOBILE_MONEY'; currencyCode: string };

type InvoiceLineForm = { description: string; amount: string; taxRateId: string };

type TaxRate = { id: string; name: string; rate: string | number; appliesTo: 'OUTPUT' | 'INPUT' | 'WITHHOLDING' };

type Project = { id: string; code: string; name: string };

type Refund = {
  id: string;
  receiptId: string;
  amount: string | number;
  reason: string;
  method: string;
  status: 'PENDING' | 'PROCESSED' | 'REJECTED';
  requestedBy: string;
  processedBy?: string | null;
  processedAt?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
};

type ArTab = 'invoices' | 'receipts' | 'refunds' | 'aging';

function customerLabel(customer?: Customer) {
  if (!customer) return 'Unknown customer';
  return `${customer.firstName} ${customer.lastName}`;
}

function invoiceBalance(invoice: Invoice) {
  const paid = (invoice.allocations || []).reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
  return Number(invoice.amount) - paid;
}

export default function AccountsReceivablePage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [tab, setTab] = useState<ArTab>('invoices');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [aging, setAging] = useState<AgingReport | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);

  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceCustomerId, setInvoiceCustomerId] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineForm[]>([{ description: '', amount: '', taxRateId: '' }]);
  const [invoiceProjectId, setInvoiceProjectId] = useState('');

  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptCustomerId, setReceiptCustomerId] = useState('');
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptMethod, setReceiptMethod] = useState('BANK_TRANSFER');
  const [receiptReference, setReceiptReference] = useState('');
  const [receiptAllocInvoiceId, setReceiptAllocInvoiceId] = useState('');
  const [receiptBankAccountId, setReceiptBankAccountId] = useState('');

  const [bulkSourceType, setBulkSourceType] = useState<'SALES_CONTRACT' | 'TENANCY'>('SALES_CONTRACT');
  const [bulkDueDate, setBulkDueDate] = useState('');

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await loadProfile(authToken);
      const [nextCustomers, nextInvoices, nextReceipts, nextAging, nextBanks, nextTaxRates, nextProjects, nextRefunds] = await Promise.all([
        hasPermission(nextProfile, 'customer.read')
          ? apiRequest<Customer[]>('/customers?take=500', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'invoice.read')
          ? apiRequest<Invoice[]>('/invoices?take=200', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'receipt.read')
          ? apiRequest<Receipt[]>('/receipts?take=200', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'invoice.read')
          ? apiRequest<AgingReport>('/invoices/reports/aging', { method: 'GET' }, authToken)
          : Promise.resolve(null),
        hasPermission(nextProfile, 'bank-account.read')
          ? apiRequest<BankAccount[]>('/bank-accounts', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'tax-rate.read')
          ? apiRequest<TaxRate[]>('/tax-rates?activeOnly=true', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'project.read')
          ? apiRequest<Project[]>('/projects', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'refund.read')
          ? apiRequest<Refund[]>('/refunds', { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);
      setProfile(nextProfile);
      setCustomers(nextCustomers);
      setInvoices(nextInvoices);
      setReceipts(nextReceipts);
      setAging(nextAging);
      setBankAccounts(nextBanks);
      setTaxRates(nextTaxRates);
      setProjects(nextProjects);
      setRefunds(nextRefunds);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load accounts receivable.');
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

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const customer of customers) map.set(customer.id, customer);
    return map;
  }, [customers]);

  const openInvoices = useMemo(
    () => invoices.filter((invoice) => ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)),
    [invoices],
  );

  const canCreateInvoice = hasPermission(profile, 'invoice.create');
  const canUpdateInvoice = hasPermission(profile, 'invoice.update');
  const canCreateReceipt = hasPermission(profile, 'receipt.create');
  const canUpdateReceipt = hasPermission(profile, 'receipt.update');
  const canCreateRefund = hasPermission(profile, 'refund.create');
  const canUpdateRefund = hasPermission(profile, 'refund.update');

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

  async function onCreateInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateInvoice) return;

    await runMutation(async () => {
      await apiRequest(
        '/invoices',
        {
          method: 'POST',
          body: JSON.stringify({
            customerId: invoiceCustomerId,
            dueDate: invoiceDueDate,
            projectId: invoiceProjectId || undefined,
            lines: invoiceLines
              .filter((line) => line.description && line.amount)
              .map((line) => ({
                description: line.description,
                amount: Number(line.amount),
                taxRateId: line.taxRateId || undefined,
              })),
            createdBy: profile?.email,
          }),
        },
        token,
      );
      setShowInvoiceForm(false);
      setInvoiceCustomerId('');
      setInvoiceDueDate('');
      setInvoiceProjectId('');
      setInvoiceLines([{ description: '', amount: '', taxRateId: '' }]);
    }, 'Invoice created.');
  }

  async function onBulkGenerate() {
    if (!token || !canCreateInvoice || !bulkDueDate) return;
    await runMutation(async () => {
      const result = await apiRequest<{ generatedCount: number }>(
        '/invoices/bulk-generate',
        {
          method: 'POST',
          body: JSON.stringify({ sourceType: bulkSourceType, dueDate: bulkDueDate, createdBy: profile?.email }),
        },
        token,
      );
      setFeedback(`Generated ${result.generatedCount} invoice(s).`);
    }, 'Bulk invoices generated.');
  }

  async function onEmailInvoice(id: string) {
    if (!token || !canUpdateInvoice) return;
    await runMutation(async () => {
      await apiRequest(`/invoices/${id}/email`, { method: 'POST' }, token);
    }, 'Invoice emailed.');
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

  async function onCancelInvoice(id: string) {
    if (!token || !canUpdateInvoice) return;
    const confirmed = await dialog.confirm({
      title: 'Cancel Invoice',
      message: 'Cancel this invoice? Only possible if no payments are allocated.',
      confirmLabel: 'Cancel Invoice',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ cancelledBy: profile?.email }) }, token);
    }, 'Invoice cancelled.');
  }

  async function onCreateReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateReceipt) return;

    await runMutation(async () => {
      await apiRequest(
        '/receipts',
        {
          method: 'POST',
          body: JSON.stringify({
            customerId: receiptCustomerId,
            amount: Number(receiptAmount),
            paymentMethod: receiptMethod,
            transactionReference: receiptReference || undefined,
            bankAccountId: receiptBankAccountId || undefined,
            allocations: receiptAllocInvoiceId
              ? [{ invoiceId: receiptAllocInvoiceId, amount: Number(receiptAmount) }]
              : undefined,
            createdBy: profile?.email,
          }),
        },
        token,
      );
      setShowReceiptForm(false);
      setReceiptCustomerId('');
      setReceiptAmount('');
      setReceiptReference('');
      setReceiptAllocInvoiceId('');
      setReceiptBankAccountId('');
    }, 'Receipt recorded.');
  }

  async function onDownloadReceipt(receipt: Receipt) {
    if (!token) return;
    setDownloadingReceiptId(receipt.id);
    setErrorMessage(null);
    try {
      await downloadFile(`/receipts/${receipt.id}/pdf`, token, `receipt-${receipt.receiptNumber}.pdf`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to download receipt.');
    } finally {
      setDownloadingReceiptId(null);
    }
  }

  async function onReprintReceipt(id: string) {
    if (!token || !canUpdateReceipt) return;
    await runMutation(async () => {
      await apiRequest(`/receipts/${id}/reprint`, { method: 'POST' }, token);
    }, 'Receipt marked for reprint.');
  }

  async function onCancelReceipt(id: string) {
    if (!token || !canUpdateReceipt) return;
    const result = await dialog.prompt({
      title: 'Cancel Receipt',
      fields: [
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'Reason for cancelling this receipt?' },
      ],
      confirmLabel: 'Cancel Receipt',
    });
    if (!result) return;
    await runMutation(async () => {
      await apiRequest(`/receipts/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: result.reason, cancelledBy: profile?.email }) }, token);
    }, 'Receipt cancelled.');
  }

  async function onRefundReceipt(receipt: Receipt) {
    if (!token || !canCreateRefund) return;
    const result = await dialog.prompt({
      title: 'Refund Receipt',
      message: `Refund amount (receipt total ${formatMoney(receipt.amount, receipt.currency)}):`,
      fields: [
        { name: 'amount', label: 'Refund Amount', type: 'number', required: true },
        { name: 'reason', label: 'Reason', type: 'textarea', defaultValue: 'Customer refund', placeholder: 'Reason for refund?' },
      ],
      confirmLabel: 'Request Refund',
    });
    if (!result) return;
    const amountStr = result.amount;
    const reason = result.reason || 'Customer refund';
    await runMutation(async () => {
      await apiRequest(
        '/refunds',
        {
          method: 'POST',
          body: JSON.stringify({
            receiptId: receipt.id,
            amount: Number(amountStr),
            reason,
            method: receipt.paymentMethod,
            requestedBy: profile?.email,
          }),
        },
        token,
      );
    }, 'Refund requested — awaiting approval before payout.');
  }

  async function onApproveRefund(id: string) {
    if (!token || !canUpdateRefund) return;
    const confirmed = await dialog.confirm({
      title: 'Approve Refund',
      message: 'Approve this refund? This posts the ledger entry and pays it out.',
      confirmLabel: 'Approve',
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/refunds/${id}/approve`, { method: 'POST', body: JSON.stringify({ processedBy: profile?.email }) }, token);
    }, 'Refund approved and processed.');
  }

  async function onRejectRefund(id: string) {
    if (!token || !canUpdateRefund) return;
    const result = await dialog.prompt({
      title: 'Reject Refund',
      fields: [
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'Reason for rejecting this refund?' },
      ],
      confirmLabel: 'Reject Refund',
    });
    if (!result) return;
    await runMutation(async () => {
      await apiRequest(`/refunds/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: result.reason, processedBy: profile?.email }) }, token);
    }, 'Refund rejected.');
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading accounts receivable...</article>
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
            pageTitle="Accounts Receivable"
            pageSubtitle="Invoices, receipts, partial payments, refunds, and aging."
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
              <button type="button" className={`portal-inline-btn${tab === 'invoices' ? ' is-active' : ''}`} onClick={() => setTab('invoices')}>
                Invoices
              </button>
              <button type="button" className={`portal-inline-btn${tab === 'receipts' ? ' is-active' : ''}`} onClick={() => setTab('receipts')}>
                Receipts
              </button>
              <button type="button" className={`portal-inline-btn${tab === 'refunds' ? ' is-active' : ''}`} onClick={() => setTab('refunds')}>
                Refunds{refunds.filter((refund) => refund.status === 'PENDING').length > 0 ? ` (${refunds.filter((refund) => refund.status === 'PENDING').length})` : ''}
              </button>
              <button type="button" className={`portal-inline-btn${tab === 'aging' ? ' is-active' : ''}`} onClick={() => setTab('aging')}>
                Aging
              </button>
            </div>

            {tab === 'invoices' ? (
              <div className="portal-stack-grid">
                {canCreateInvoice ? (
                  <article className="portal-card">
                    <div className="portal-card-header-row">
                      <h2 style={{ margin: 0 }}>Bulk Generate Invoices</h2>
                    </div>
                    <div className="portal-entity-form">
                      <div className="portal-entity-grid-3">
                        <label>
                          <span>Source</span>
                          <select value={bulkSourceType} onChange={(event) => setBulkSourceType(event.target.value as any)}>
                            <option value="SALES_CONTRACT">Active Sales Contracts</option>
                            <option value="TENANCY">Active Tenancies (Rent)</option>
                          </select>
                        </label>
                        <label>
                          <span>Due Date</span>
                          <input type="date" value={bulkDueDate} onChange={(event) => setBulkDueDate(event.target.value)} />
                        </label>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                          <button type="button" className="portal-primary-btn" disabled={mutating || !bulkDueDate} onClick={() => void onBulkGenerate()}>
                            {mutating ? 'Generating...' : 'Generate'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ) : null}

                <article className="portal-card">
                  <div className="portal-card-header-row">
                    <h2 style={{ margin: 0 }}>Invoices</h2>
                    {canCreateInvoice ? (
                      <button type="button" className="portal-inline-btn" onClick={() => setShowInvoiceForm((prev) => !prev)}>
                        {showInvoiceForm ? 'Close' : 'New Invoice'}
                      </button>
                    ) : null}
                  </div>

                  {showInvoiceForm && canCreateInvoice ? (
                    <form className="portal-entity-form portal-detail-form" onSubmit={onCreateInvoice}>
                      <div className="portal-entity-grid-2">
                        <label>
                          <span>Customer</span>
                          <select value={invoiceCustomerId} onChange={(event) => setInvoiceCustomerId(event.target.value)} required>
                            <option value="">Select customer</option>
                            {customers.map((customer) => (
                              <option key={customer.id} value={customer.id}>
                                {customerLabel(customer)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Due Date</span>
                          <input type="date" value={invoiceDueDate} onChange={(event) => setInvoiceDueDate(event.target.value)} required />
                        </label>
                      </div>
                      <label>
                        <span>Project (optional)</span>
                        <select value={invoiceProjectId} onChange={(event) => setInvoiceProjectId(event.target.value)}>
                          <option value="">Not project-specific</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.code} — {project.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <span style={{ fontSize: 13, fontWeight: 600 }}>Line Items</span>
                      {invoiceLines.map((line, index) => (
                        <div key={index} className="portal-entity-grid-3">
                          <label>
                            <span>Description</span>
                            <input
                              value={line.description}
                              onChange={(event) =>
                                setInvoiceLines((prev) =>
                                  prev.map((item, itemIndex) => (itemIndex === index ? { ...item, description: event.target.value } : item)),
                                )
                              }
                              required
                            />
                          </label>
                          <label>
                            <span>Amount (KES)</span>
                            <input
                              type="number"
                              min={0.01}
                              step="0.01"
                              value={line.amount}
                              onChange={(event) =>
                                setInvoiceLines((prev) =>
                                  prev.map((item, itemIndex) => (itemIndex === index ? { ...item, amount: event.target.value } : item)),
                                )
                              }
                              required
                            />
                          </label>
                          <label>
                            <span>Tax (optional)</span>
                            <select
                              value={line.taxRateId}
                              onChange={(event) =>
                                setInvoiceLines((prev) =>
                                  prev.map((item, itemIndex) => (itemIndex === index ? { ...item, taxRateId: event.target.value } : item)),
                                )
                              }
                            >
                              <option value="">No tax</option>
                              {taxRates
                                .filter((rate) => rate.appliesTo === 'OUTPUT')
                                .map((rate) => (
                                  <option key={rate.id} value={rate.id}>
                                    {rate.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                      ))}
                      <div className="portal-action-row">
                        <button
                          type="button"
                          className="portal-inline-btn"
                          onClick={() => setInvoiceLines((prev) => [...prev, { description: '', amount: '', taxRateId: '' }])}
                        >
                          Add Line
                        </button>
                        {invoiceLines.length > 1 ? (
                          <button
                            type="button"
                            className="portal-inline-btn is-danger"
                            onClick={() => setInvoiceLines((prev) => prev.slice(0, -1))}
                          >
                            Remove Last Line
                          </button>
                        ) : null}
                      </div>
                      <button type="submit" className="portal-primary-btn" disabled={mutating}>
                        {mutating ? 'Saving...' : 'Create Invoice'}
                      </button>
                    </form>
                  ) : null}

                  <div className="portal-list-stack">
                    {invoices.length === 0 ? (
                      <div className="portal-empty-state">No invoices yet.</div>
                    ) : (
                      invoices.map((invoice) => {
                        const balance = invoiceBalance(invoice);
                        return (
                          <div key={invoice.id} className="portal-record">
                            <div className="portal-list-row">
                              <div>
                                <strong>{invoice.invoiceNumber}</strong>
                                <p>{customerLabel(customerMap.get(invoice.customerId))}</p>
                                <p>
                                  Due {formatDate(invoice.dueDate)} • {invoice.sourceType.replaceAll('_', ' ')}
                                  {invoice.sentAt ? ` • Emailed ${formatDate(invoice.sentAt)}` : ''}
                                </p>
                              </div>
                              <span>{invoice.status.replaceAll('_', ' ')}</span>
                              <span>
                                {formatMoney(invoice.amount, invoice.currency)}
                                {balance > 0.01 && balance < Number(invoice.amount) ? (
                                  <> ({formatMoney(balance, invoice.currency)} due)</>
                                ) : null}
                              </span>
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
                              {canUpdateInvoice ? (
                                <button type="button" className="portal-inline-btn" onClick={() => void onEmailInvoice(invoice.id)}>
                                  Email
                                </button>
                              ) : null}
                              {canUpdateInvoice && invoice.status !== 'CANCELLED' && invoice.status !== 'PAID' ? (
                                <button type="button" className="portal-inline-btn is-danger" onClick={() => void onCancelInvoice(invoice.id)}>
                                  Cancel
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              </div>
            ) : null}

            {tab === 'receipts' ? (
              <div className="portal-stack-grid">
                <article className="portal-card">
                  <div className="portal-card-header-row">
                    <h2 style={{ margin: 0 }}>Receipts</h2>
                    {canCreateReceipt ? (
                      <button type="button" className="portal-inline-btn" onClick={() => setShowReceiptForm((prev) => !prev)}>
                        {showReceiptForm ? 'Close' : 'Record Receipt'}
                      </button>
                    ) : null}
                  </div>

                  {showReceiptForm && canCreateReceipt ? (
                    <form className="portal-entity-form portal-detail-form" onSubmit={onCreateReceipt}>
                      <div className="portal-entity-grid-2">
                        <label>
                          <span>Customer</span>
                          <select value={receiptCustomerId} onChange={(event) => setReceiptCustomerId(event.target.value)} required>
                            <option value="">Select customer</option>
                            {customers.map((customer) => (
                              <option key={customer.id} value={customer.id}>
                                {customerLabel(customer)}
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
                            value={receiptAmount}
                            onChange={(event) => setReceiptAmount(event.target.value)}
                            required
                          />
                        </label>
                      </div>
                      <div className="portal-entity-grid-2">
                        <label>
                          <span>Method</span>
                          <select value={receiptMethod} onChange={(event) => setReceiptMethod(event.target.value)}>
                            <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                            <option value="CASH">CASH</option>
                            <option value="CARD">CARD</option>
                            <option value="CHEQUE">CHEQUE</option>
                            <option value="MOBILE_MONEY">MOBILE_MONEY</option>
                          </select>
                        </label>
                        <label>
                          <span>Transaction Reference</span>
                          <input value={receiptReference} onChange={(event) => setReceiptReference(event.target.value)} />
                        </label>
                      </div>
                      <label>
                        <span>Received Into (optional — auto-resolved from project/purpose if left blank)</span>
                        <select value={receiptBankAccountId} onChange={(event) => setReceiptBankAccountId(event.target.value)}>
                          <option value="">Auto-resolve</option>
                          {bankAccounts.map((bank) => (
                            <option key={bank.id} value={bank.id}>
                              {bank.name} ({bank.type === 'MOBILE_MONEY' ? 'Mobile Money' : 'Bank'})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Allocate to Invoice (optional — deposit/installment)</span>
                        <select value={receiptAllocInvoiceId} onChange={(event) => setReceiptAllocInvoiceId(event.target.value)}>
                          <option value="">Leave unallocated</option>
                          {openInvoices
                            .filter((invoice) => invoice.customerId === receiptCustomerId)
                            .map((invoice) => (
                              <option key={invoice.id} value={invoice.id}>
                                {invoice.invoiceNumber} — balance {formatMoney(invoiceBalance(invoice), invoice.currency)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button type="submit" className="portal-primary-btn" disabled={mutating}>
                        {mutating ? 'Saving...' : 'Record Receipt'}
                      </button>
                    </form>
                  ) : null}

                  <div className="portal-list-stack">
                    {receipts.length === 0 ? (
                      <div className="portal-empty-state">No receipts yet.</div>
                    ) : (
                      receipts.map((receipt) => (
                        <div key={receipt.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>{receipt.receiptNumber}</strong>
                              <p>{customerLabel(customerMap.get(receipt.customerId))}</p>
                              <p>
                                {receipt.paymentMethod.replaceAll('_', ' ')} • {formatDate(receipt.receivedAt)}
                                {receipt.printCount > 0 ? ` • Printed ${receipt.printCount}x` : ''}
                              </p>
                            </div>
                            <span>{receipt.status}</span>
                            <span>{formatMoney(receipt.amount, receipt.currency)}</span>
                          </div>
                          <div className="portal-action-row">
                            <button
                              type="button"
                              className="portal-inline-btn"
                              disabled={downloadingReceiptId === receipt.id}
                              onClick={() => void onDownloadReceipt(receipt)}
                            >
                              {downloadingReceiptId === receipt.id ? 'Preparing...' : 'Download Receipt'}
                            </button>
                            {canUpdateReceipt ? (
                              <button type="button" className="portal-inline-btn" onClick={() => void onReprintReceipt(receipt.id)}>
                                Reprint
                              </button>
                            ) : null}
                            {canCreateRefund && receipt.status === 'ACTIVE' ? (
                              <button type="button" className="portal-inline-btn" onClick={() => void onRefundReceipt(receipt)}>
                                Request Refund
                              </button>
                            ) : null}
                            {canUpdateReceipt && receipt.status === 'ACTIVE' ? (
                              <button type="button" className="portal-inline-btn is-danger" onClick={() => void onCancelReceipt(receipt.id)}>
                                Cancel
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              </div>
            ) : null}

            {tab === 'refunds' ? (
              <div className="portal-stack-grid">
                <article className="portal-card">
                  <h2 style={{ margin: '0 0 12px' }}>Refunds</h2>
                  <p className="portal-muted" style={{ margin: '0 0 12px' }}>
                    Refund requests wait here for approval before anything is paid out or posted to the ledger.
                  </p>
                  <div className="portal-list-stack">
                    {refunds.length === 0 ? (
                      <div className="portal-empty-state">No refunds requested yet.</div>
                    ) : (
                      refunds.map((refund) => {
                        const receipt = receipts.find((item) => item.id === refund.receiptId);
                        return (
                          <div key={refund.id} className="portal-record">
                            <div className="portal-list-row">
                              <div>
                                <strong>{receipt?.receiptNumber || refund.receiptId}</strong>
                                <p>{refund.reason}</p>
                                <p>
                                  {refund.method.replaceAll('_', ' ')} • Requested by {refund.requestedBy} • {formatDate(refund.createdAt)}
                                  {refund.processedAt ? ` • ${refund.status === 'REJECTED' ? 'Rejected' : 'Processed'} ${formatDate(refund.processedAt)}` : ''}
                                </p>
                                {refund.status === 'REJECTED' && refund.rejectedReason ? <p>Rejection reason: {refund.rejectedReason}</p> : null}
                              </div>
                              <span>{refund.status}</span>
                              <span>{formatMoney(refund.amount, receipt?.currency || 'KES')}</span>
                            </div>
                            {canUpdateRefund && refund.status === 'PENDING' ? (
                              <div className="portal-action-row">
                                <button type="button" className="portal-inline-btn" onClick={() => void onApproveRefund(refund.id)}>
                                  Approve
                                </button>
                                <button type="button" className="portal-inline-btn is-danger" onClick={() => void onRejectRefund(refund.id)}>
                                  Reject
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              </div>
            ) : null}

            {tab === 'aging' ? (
              <div className="portal-stack-grid">
                <article className="portal-card">
                  <h2>AR Aging {aging ? `(as of ${formatDate(aging.asOf)})` : ''}</h2>
                  {aging ? (
                    <>
                      <div className="portal-detail-stats" style={{ marginBottom: 16 }}>
                        <div>
                          <span>Current</span>
                          <strong>{formatMoney(aging.buckets.current)}</strong>
                        </div>
                        <div>
                          <span>1-30 Days</span>
                          <strong>{formatMoney(aging.buckets.days30)}</strong>
                        </div>
                        <div>
                          <span>31-60 Days</span>
                          <strong>{formatMoney(aging.buckets.days60)}</strong>
                        </div>
                        <div>
                          <span>61-90 Days</span>
                          <strong>{formatMoney(aging.buckets.days90)}</strong>
                        </div>
                        <div>
                          <span>90+ Days</span>
                          <strong>{formatMoney(aging.buckets.days90plus)}</strong>
                        </div>
                      </div>
                      <div className="portal-list-stack">
                        {aging.rows.length === 0 ? (
                          <div className="portal-empty-state">Nothing outstanding.</div>
                        ) : (
                          aging.rows.map((row) => (
                            <div key={row.invoiceId} className="portal-record">
                              <div className="portal-list-row">
                                <div>
                                  <strong>{row.invoiceNumber}</strong>
                                  <p>{row.customerName}</p>
                                  <p>Due {formatDate(row.dueDate)} • {row.daysOverdue > 0 ? `${row.daysOverdue} days overdue` : 'Not yet due'}</p>
                                </div>
                                <span>{row.bucket.replace('days', '').replace('plus', '+')}</span>
                                <span>{formatMoney(row.balance)}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="portal-empty-state">No aging data available.</div>
                  )}
                </article>
              </div>
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
