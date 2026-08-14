"use client";

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  uploadMedia,
} from '../lib';

type Supplier = { id: string; name: string; email?: string | null; phone?: string | null; paymentTermsDays: number; isActive: boolean };

type SupplierInvoiceAttachment = { id: string; fileName: string; url: string };

type SupplierInvoice = {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  amount: string | number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'STAGED' | 'PAID' | 'DISPUTED' | 'CANCELLED';
  attachments: SupplierInvoiceAttachment[];
};

type SupplierPaymentAllocation = { id: string; supplierInvoiceId: string; allocatedAmount: string | number; supplierInvoice?: SupplierInvoice };

type SupplierPayment = {
  id: string;
  paymentNumber: string;
  supplierId: string;
  amount: string | number;
  currency: string;
  status: 'STAGED' | 'APPROVED' | 'PAID' | 'CANCELLED';
  stagedAt: string;
  allocations: SupplierPaymentAllocation[];
};

type ApTab = 'suppliers' | 'invoices' | 'payments';

type TaxRate = { id: string; name: string; rate: string | number; appliesTo: 'OUTPUT' | 'INPUT' | 'WITHHOLDING' };
type BankAccount = { id: string; name: string; type: 'BANK' | 'MOBILE_MONEY'; currencyCode: string };

function supplierLabel(supplier?: Supplier) {
  return supplier?.name || 'Unknown supplier';
}

export default function AccountsPayablePage() {
  const dialog = usePortalDialog();
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [tab, setTab] = useState<ApTab>('invoices');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierDefaultWhtRateId, setSupplierDefaultWhtRateId] = useState('');

  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceSupplierId, setInvoiceSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceTaxRateId, setInvoiceTaxRateId] = useState('');
  const [attachTargetId, setAttachTargetId] = useState<string | null>(null);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentSupplierId, setPaymentSupplierId] = useState('');
  const [paymentInvoiceId, setPaymentInvoiceId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentBankAccountId, setPaymentBankAccountId] = useState('');
  const [paymentWhtRateId, setPaymentWhtRateId] = useState('');

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await loadProfile(authToken);
      const [nextSuppliers, nextInvoices, nextPayments, nextTaxRates, nextBanks] = await Promise.all([
        hasPermission(nextProfile, 'supplier.read')
          ? apiRequest<Supplier[]>('/suppliers?take=500', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'supplier-invoice.read')
          ? apiRequest<SupplierInvoice[]>('/supplier-invoices?take=200', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'supplier-payment.read')
          ? apiRequest<SupplierPayment[]>('/supplier-payments?take=200', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'tax-rate.read')
          ? apiRequest<TaxRate[]>('/tax-rates?activeOnly=true', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'bank-account.read')
          ? apiRequest<BankAccount[]>('/bank-accounts', { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);
      setProfile(nextProfile);
      setSuppliers(nextSuppliers);
      setSupplierInvoices(nextInvoices);
      setSupplierPayments(nextPayments);
      setTaxRates(nextTaxRates);
      setBankAccounts(nextBanks);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load accounts payable.');
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

  const supplierMap = useMemo(() => {
    const map = new Map<string, Supplier>();
    for (const supplier of suppliers) map.set(supplier.id, supplier);
    return map;
  }, [suppliers]);

  const approvedInvoicesForSupplier = useMemo(
    () => supplierInvoices.filter((invoice) => invoice.supplierId === paymentSupplierId && invoice.status === 'APPROVED'),
    [supplierInvoices, paymentSupplierId],
  );

  const canCreateSupplier = hasPermission(profile, 'supplier.create');
  const canCreateInvoice = hasPermission(profile, 'supplier-invoice.create');
  const canUpdateInvoice = hasPermission(profile, 'supplier-invoice.update');
  const canCreatePayment = hasPermission(profile, 'supplier-payment.create');
  const canUpdatePayment = hasPermission(profile, 'supplier-payment.update');

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

  async function onCreateSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateSupplier) return;
    await runMutation(async () => {
      await apiRequest(
        '/suppliers',
        {
          method: 'POST',
          body: JSON.stringify({
            name: supplierName,
            email: supplierEmail || undefined,
            phone: supplierPhone || undefined,
            defaultWhtRateId: supplierDefaultWhtRateId || undefined,
          }),
        },
        token,
      );
      setShowSupplierForm(false);
      setSupplierName('');
      setSupplierEmail('');
      setSupplierPhone('');
      setSupplierDefaultWhtRateId('');
    }, 'Supplier added.');
  }

  async function onCreateInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateInvoice) return;
    await runMutation(async () => {
      await apiRequest(
        '/supplier-invoices',
        {
          method: 'POST',
          body: JSON.stringify({
            invoiceNumber,
            supplierId: invoiceSupplierId,
            invoiceDate,
            dueDate: invoiceDueDate,
            amount: Number(invoiceAmount),
            taxRateId: invoiceTaxRateId || undefined,
            createdBy: profile?.email,
          }),
        },
        token,
      );
      setShowInvoiceForm(false);
      setInvoiceSupplierId('');
      setInvoiceNumber('');
      setInvoiceDate('');
      setInvoiceDueDate('');
      setInvoiceAmount('');
      setInvoiceTaxRateId('');
    }, 'Supplier invoice created.');
  }

  async function onApproveInvoice(id: string) {
    if (!token || !canUpdateInvoice) return;
    await runMutation(async () => {
      await apiRequest(`/supplier-invoices/${id}/approve`, { method: 'POST', body: JSON.stringify({ approvedBy: profile?.email }) }, token);
    }, 'Supplier invoice approved.');
  }

  async function onDisputeInvoice(id: string) {
    if (!token || !canUpdateInvoice) return;
    await runMutation(async () => {
      await apiRequest(`/supplier-invoices/${id}/dispute`, { method: 'POST' }, token);
    }, 'Supplier invoice marked disputed.');
  }

  async function onEmailInvoice(id: string) {
    if (!token || !canUpdateInvoice) return;
    await runMutation(async () => {
      await apiRequest(`/supplier-invoices/${id}/email`, { method: 'POST' }, token);
    }, 'Supplier invoice emailed.');
  }

  async function onAttachFile(invoiceId: string, file: File) {
    if (!token) return;
    setUploading(true);
    setErrorMessage(null);
    try {
      const uploaded = await uploadMedia(file, token);
      await apiRequest(
        `/supplier-invoices/${invoiceId}/attachments`,
        { method: 'POST', body: JSON.stringify({ fileName: file.name, url: uploaded.url, objectKey: uploaded.objectKey, uploadedBy: profile?.email }) },
        token,
      );
      setFeedback('Attachment uploaded.');
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload attachment.');
    } finally {
      setUploading(false);
    }
  }

  async function onStagePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreatePayment) return;
    await runMutation(async () => {
      await apiRequest(
        '/supplier-payments',
        {
          method: 'POST',
          body: JSON.stringify({
            supplierId: paymentSupplierId,
            bankAccountId: paymentBankAccountId || undefined,
            whtRateId: paymentWhtRateId || undefined,
            allocations: [{ supplierInvoiceId: paymentInvoiceId, amount: Number(paymentAmount) }],
            stagedBy: profile?.email,
          }),
        },
        token,
      );
      setShowPaymentForm(false);
      setPaymentSupplierId('');
      setPaymentInvoiceId('');
      setPaymentAmount('');
      setPaymentBankAccountId('');
      setPaymentWhtRateId('');
    }, 'Payment staged.');
  }

  async function onApprovePayment(id: string) {
    if (!token || !canUpdatePayment) return;
    await runMutation(async () => {
      await apiRequest(`/supplier-payments/${id}/approve`, { method: 'POST', body: JSON.stringify({ approvedBy: profile?.email }) }, token);
    }, 'Payment approved.');
  }

  async function onReleasePayment(id: string) {
    if (!token || !canUpdatePayment) return;
    const confirmed = await dialog.confirm({
      title: 'Release Payment',
      message: 'Release this payment? This posts the GL entry and marks it paid.',
      confirmLabel: 'Release',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/supplier-payments/${id}/release`, { method: 'POST' }, token);
    }, 'Payment released.');
  }

  async function onCancelPayment(id: string) {
    if (!token || !canUpdatePayment) return;
    await runMutation(async () => {
      await apiRequest(`/supplier-payments/${id}/cancel`, { method: 'POST' }, token);
    }, 'Payment cancelled.');
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading accounts payable...</article>
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
            pageTitle="Accounts Payable"
            pageSubtitle="Suppliers, supplier invoices, staged payments, and statement reconciliation."
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
              <button type="button" className={`portal-inline-btn${tab === 'suppliers' ? ' is-active' : ''}`} onClick={() => setTab('suppliers')}>
                Suppliers
              </button>
              <button type="button" className={`portal-inline-btn${tab === 'invoices' ? ' is-active' : ''}`} onClick={() => setTab('invoices')}>
                Supplier Invoices
              </button>
              <button type="button" className={`portal-inline-btn${tab === 'payments' ? ' is-active' : ''}`} onClick={() => setTab('payments')}>
                Payments
              </button>
            </div>

            {tab === 'suppliers' ? (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Suppliers</h2>
                  {canCreateSupplier ? (
                    <button type="button" className="portal-inline-btn" onClick={() => setShowSupplierForm((prev) => !prev)}>
                      {showSupplierForm ? 'Close' : 'Add Supplier'}
                    </button>
                  ) : null}
                </div>

                {showSupplierForm && canCreateSupplier ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onCreateSupplier}>
                    <label>
                      <span>Name</span>
                      <input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} required />
                    </label>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Email</span>
                        <input type="email" value={supplierEmail} onChange={(event) => setSupplierEmail(event.target.value)} />
                      </label>
                      <label>
                        <span>Phone</span>
                        <input value={supplierPhone} onChange={(event) => setSupplierPhone(event.target.value)} />
                      </label>
                    </div>
                    <label>
                      <span>Default Withholding Tax (optional)</span>
                      <select value={supplierDefaultWhtRateId} onChange={(event) => setSupplierDefaultWhtRateId(event.target.value)}>
                        <option value="">None</option>
                        {taxRates
                          .filter((rate) => rate.appliesTo === 'WITHHOLDING')
                          .map((rate) => (
                            <option key={rate.id} value={rate.id}>
                              {rate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Saving...' : 'Add Supplier'}
                    </button>
                  </form>
                ) : null}

                <div className="portal-list-stack">
                  {suppliers.length === 0 ? (
                    <div className="portal-empty-state">No suppliers yet.</div>
                  ) : (
                    suppliers.map((supplier) => (
                      <div key={supplier.id} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>{supplier.name}</strong>
                            <p>
                              {supplier.email || 'No email'} • {supplier.phone || 'No phone'}
                            </p>
                          </div>
                          <span>{supplier.paymentTermsDays} day terms</span>
                          <span>{supplier.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ) : null}

            {tab === 'invoices' ? (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Supplier Invoices</h2>
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
                        <span>Supplier</span>
                        <select value={invoiceSupplierId} onChange={(event) => setInvoiceSupplierId(event.target.value)} required>
                          <option value="">Select supplier</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Invoice Number</span>
                        <input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required />
                      </label>
                    </div>
                    <div className="portal-entity-grid-3">
                      <label>
                        <span>Invoice Date</span>
                        <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required />
                      </label>
                      <label>
                        <span>Due Date</span>
                        <input type="date" value={invoiceDueDate} onChange={(event) => setInvoiceDueDate(event.target.value)} required />
                      </label>
                      <label>
                        <span>Amount (KES)</span>
                        <input type="number" min={0.01} step="0.01" value={invoiceAmount} onChange={(event) => setInvoiceAmount(event.target.value)} required />
                      </label>
                    </div>
                    <label>
                      <span>Input VAT (optional — backed out of the gross amount above)</span>
                      <select value={invoiceTaxRateId} onChange={(event) => setInvoiceTaxRateId(event.target.value)}>
                        <option value="">No tax</option>
                        {taxRates
                          .filter((rate) => rate.appliesTo === 'INPUT')
                          .map((rate) => (
                            <option key={rate.id} value={rate.id}>
                              {rate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Saving...' : 'Create Invoice'}
                    </button>
                  </form>
                ) : null}

                <div className="portal-list-stack">
                  {supplierInvoices.length === 0 ? (
                    <div className="portal-empty-state">No supplier invoices yet.</div>
                  ) : (
                    supplierInvoices.map((invoice) => (
                      <div key={invoice.id} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>{invoice.invoiceNumber}</strong>
                            <p>{supplierLabel(supplierMap.get(invoice.supplierId))}</p>
                            <p>Due {formatDate(invoice.dueDate)}</p>
                          </div>
                          <span>{invoice.status.replaceAll('_', ' ')}</span>
                          <span>{formatMoney(invoice.amount, invoice.currency)}</span>
                        </div>

                        {invoice.attachments.length > 0 ? (
                          <div className="portal-action-row" style={{ flexWrap: 'wrap' }}>
                            {invoice.attachments.map((attachment) => (
                              <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="portal-inline-btn">
                                {attachment.fileName}
                              </a>
                            ))}
                          </div>
                        ) : null}

                        <div className="portal-action-row">
                          {canUpdateInvoice && invoice.status === 'PENDING_APPROVAL' ? (
                            <button type="button" className="portal-inline-btn" onClick={() => void onApproveInvoice(invoice.id)}>
                              Approve
                            </button>
                          ) : null}
                          {canUpdateInvoice && invoice.status === 'PENDING_APPROVAL' ? (
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDisputeInvoice(invoice.id)}>
                              Dispute
                            </button>
                          ) : null}
                          {canUpdateInvoice ? (
                            <button type="button" className="portal-inline-btn" onClick={() => void onEmailInvoice(invoice.id)}>
                              Email Supplier
                            </button>
                          ) : null}
                          {canUpdateInvoice ? (
                            <button
                              type="button"
                              className="portal-inline-btn"
                              disabled={uploading}
                              onClick={() => {
                                setAttachTargetId(invoice.id);
                                attachmentInputRef.current?.click();
                              }}
                            >
                              {uploading && attachTargetId === invoice.id ? 'Uploading...' : 'Attach Document'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <input
                  ref={attachmentInputRef}
                  type="file"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file && attachTargetId) {
                      void onAttachFile(attachTargetId, file);
                    }
                    event.target.value = '';
                  }}
                />
              </article>
            ) : null}

            {tab === 'payments' ? (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Supplier Payments</h2>
                  {canCreatePayment ? (
                    <button type="button" className="portal-inline-btn" onClick={() => setShowPaymentForm((prev) => !prev)}>
                      {showPaymentForm ? 'Close' : 'Stage Payment'}
                    </button>
                  ) : null}
                </div>

                {showPaymentForm && canCreatePayment ? (
                  <form className="portal-entity-form portal-detail-form" onSubmit={onStagePayment}>
                    <label>
                      <span>Supplier</span>
                      <select
                        value={paymentSupplierId}
                        onChange={(event) => {
                          setPaymentSupplierId(event.target.value);
                          setPaymentInvoiceId('');
                        }}
                        required
                      >
                        <option value="">Select supplier</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Approved Invoice</span>
                      <select value={paymentInvoiceId} onChange={(event) => setPaymentInvoiceId(event.target.value)} required>
                        <option value="">Select invoice</option>
                        {approvedInvoicesForSupplier.map((invoice) => (
                          <option key={invoice.id} value={invoice.id}>
                            {invoice.invoiceNumber} — {formatMoney(invoice.amount, invoice.currency)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Amount</span>
                        <input type="number" min={0.01} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required />
                      </label>
                      <label>
                        <span>Pay From Account (optional)</span>
                        <select value={paymentBankAccountId} onChange={(event) => setPaymentBankAccountId(event.target.value)}>
                          <option value="">Auto-resolve</option>
                          {bankAccounts.map((bank) => (
                            <option key={bank.id} value={bank.id}>
                              {bank.name} ({bank.type === 'MOBILE_MONEY' ? 'Mobile Money' : 'Bank'})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      <span>Withholding Tax Override (optional — defaults to supplier default, if any)</span>
                      <select value={paymentWhtRateId} onChange={(event) => setPaymentWhtRateId(event.target.value)}>
                        <option value="">Use supplier default</option>
                        {taxRates
                          .filter((rate) => rate.appliesTo === 'WITHHOLDING')
                          .map((rate) => (
                            <option key={rate.id} value={rate.id}>
                              {rate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Saving...' : 'Stage Payment'}
                    </button>
                  </form>
                ) : null}

                <div className="portal-list-stack">
                  {supplierPayments.length === 0 ? (
                    <div className="portal-empty-state">No payments staged yet.</div>
                  ) : (
                    supplierPayments.map((payment) => (
                      <div key={payment.id} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>{payment.paymentNumber}</strong>
                            <p>{supplierLabel(supplierMap.get(payment.supplierId))}</p>
                            <p>Staged {formatDate(payment.stagedAt)}</p>
                          </div>
                          <span>{payment.status}</span>
                          <span>{formatMoney(payment.amount, payment.currency)}</span>
                        </div>
                        <div className="portal-action-row">
                          {canUpdatePayment && payment.status === 'STAGED' ? (
                            <button type="button" className="portal-inline-btn" onClick={() => void onApprovePayment(payment.id)}>
                              Approve
                            </button>
                          ) : null}
                          {canUpdatePayment && payment.status === 'APPROVED' ? (
                            <button type="button" className="portal-inline-btn" onClick={() => void onReleasePayment(payment.id)}>
                              Release Payment
                            </button>
                          ) : null}
                          {canUpdatePayment && payment.status !== 'PAID' && payment.status !== 'CANCELLED' ? (
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => void onCancelPayment(payment.id)}>
                              Cancel
                            </button>
                          ) : null}
                        </div>
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
