"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import { ListExport } from '../../components/list-export';
import { ListPager, ListSearch, useListControls } from '../../components/list-controls';
import { TourLauncher } from '../../tours/tour-launcher';
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
  storeId?: string | null;
  glExpenseAccountId?: string | null;
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
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [tab, setTab] = useState<ApTab>('invoices');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierBalances, setSupplierBalances] = useState<
    Array<{ id: string; name: string; invoicedTotal: number; paidTotal: number; outstanding: number }>
  >([]);
  const [stores, setStores] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<
    Array<{ id: string; code: string; name: string; type: string; parentId?: string | null }>
  >([]);
  const [recatInvoiceId, setRecatInvoiceId] = useState<string | null>(null);
  const [recatForm, setRecatForm] = useState({ storeId: '', glExpenseAccountId: '' });
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
      const [nextSuppliers, nextBalances, nextInvoices, nextPayments, nextTaxRates, nextBanks, nextStores, nextAccounts] = await Promise.all([
        hasPermission(nextProfile, 'supplier.read')
          ? apiRequest<{ items: Supplier[] }>('/suppliers?take=500', { method: 'GET' }, authToken).then(
              (page) => page.items,
            )
          : Promise.resolve([]),
        hasPermission(nextProfile, 'supplier.read')
          ? apiRequest<any[]>('/suppliers/balances', { method: 'GET' }, authToken)
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
        hasPermission(nextProfile, 'store.read')
          ? apiRequest<any[]>('/stores', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'chart-of-account.read')
          ? apiRequest<any[]>('/chart-of-accounts', { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);
      setProfile(nextProfile);
      setSuppliers(nextSuppliers);
      setSupplierBalances(nextBalances);
      setStores(nextStores);
      // Only leaf expense accounts: posting to a parent bypasses the category
      // split the store cost report is built on.
      setExpenseAccounts(
        nextAccounts.filter((account: any) => account.type === 'EXPENSE' && account.parentId),
      );
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

  async function onRecategoriseInvoice(invoiceId: string) {
    if (!token) return;
    await runMutation(async () => {
      await apiRequest(
        `/supplier-invoices/${invoiceId}/recategorise`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            storeId: recatForm.storeId || null,
            glExpenseAccountId: recatForm.glExpenseAccountId || null,
          }),
        },
        token,
      );
      setRecatInvoiceId(null);
    }, 'Invoice recategorised — the store cost report now reflects this spend.');
  }

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

  const supplierControls = useListControls(suppliers, (row) => [
    row.name,
    row.email,
    row.phone,
  ]);

  const invoiceControls = useListControls(supplierInvoices, (row) => [
    row.invoiceNumber,
    row.status,
    row.currency,
    supplierLabel(supplierMap.get(row.supplierId)),
  ]);

  const paymentControls = useListControls(supplierPayments, (row) => [
    row.paymentNumber,
    row.status,
    row.currency,
    supplierLabel(supplierMap.get(row.supplierId)),
  ]);

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
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
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
              <article className="portal-card" data-tour="payable.suppliers">
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

                <div className="list-toolbar">
                  <ListSearch controls={supplierControls} placeholder="Search suppliers…" />
                    <ListExport
                      rows={supplierControls.filtered}
                      config={{
                        fileName: 'suppliers',
                        columns: [
                          { header: 'Name', value: (row) => row.name },
                          { header: 'Email', value: (row) => row.email || '' },
                          { header: 'Phone', value: (row) => row.phone || '' },
                          { header: 'Payment Terms (days)', value: (row) => row.paymentTermsDays },
                          { header: 'Active', value: (row) => row.isActive ? 'Yes' : 'No' },
                        ],
                      }}
                    />
                </div>
                <div className="portal-list-stack">
                  {suppliers.length === 0 ? (
                    <div className="portal-empty-state">No suppliers yet.</div>
                  ) : (
                    supplierControls.visible.map((supplier) => {
                      const balance = supplierBalances.find((row) => row.id === supplier.id);
                      return (
                        <div key={supplier.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>{supplier.name}</strong>
                              <p>
                                {supplier.email || 'No email'} • {supplier.phone || 'No phone'}
                              </p>
                              {balance ? (
                                <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                  Invoiced {formatMoney(balance.invoicedTotal)} • paid{' '}
                                  {formatMoney(balance.paidTotal)}
                                </p>
                              ) : null}
                            </div>
                            <span>{supplier.paymentTermsDays} day terms</span>
                            <span>
                              {balance && balance.outstanding > 0
                                ? `${formatMoney(balance.outstanding)} owing`
                                : supplier.isActive
                                  ? 'Settled'
                                  : 'INACTIVE'}
                            </span>
                          </div>
                          <div className="portal-action-row">
                            <Link
                              href={`/portal/accounting/payable/${supplier.id}`}
                              className="portal-inline-btn"
                            >
                              View Account
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <ListPager controls={supplierControls} noun="suppliers" />
              </article>
            ) : null}

            {tab === 'invoices' ? (
              <article className="portal-card" data-tour="payable.invoices">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Supplier Invoices</h2><TourLauncher tour="accounting-basics" />
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

                <div className="list-toolbar">
                  <ListSearch controls={invoiceControls} placeholder="Search invoices or suppliers…" />
                  <ListExport
                    rows={invoiceControls.filtered}
                    config={{
                      fileName: 'supplier-invoices',
                      dateOf: (row) => row.invoiceDate,
                      dateLabel: 'Invoiced',
                      columns: [
                        { header: 'Invoice Number', value: (row) => row.invoiceNumber },
                        { header: 'Supplier', value: (row) => supplierLabel(supplierMap.get(row.supplierId)) },
                        { header: 'Currency', value: (row) => row.currency },
                        { header: 'Amount', value: (row) => Number(row.amount) },
                        { header: 'Status', value: (row) => row.status },
                        { header: 'Invoiced', value: (row) => formatDate(row.invoiceDate) },
                        { header: 'Due', value: (row) => formatDate(row.dueDate) },
                        { header: 'Store', value: (row) => stores.find((p) => p.id === row.storeId)?.name || '' },
                      ],
                    }}
                  />
                </div>

                <div className="portal-list-stack">
                  {invoiceControls.visible.length === 0 ? (
                    <div className="portal-empty-state">
                      {invoiceControls.search ? 'No invoices match that search.' : 'No supplier invoices yet.'}
                    </div>
                  ) : (
                    invoiceControls.visible.map((invoice) => (
                      <div key={invoice.id} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>{invoice.invoiceNumber}</strong>
                            <p>{supplierLabel(supplierMap.get(invoice.supplierId))}</p>
                            <p>Due {formatDate(invoice.dueDate)}</p>
                            <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                              {invoice.storeId
                                ? stores.find((store) => store.id === invoice.storeId)?.name ||
                                  'Unknown store'
                                : 'No store'}
                              {' • '}
                              {invoice.glExpenseAccountId
                                ? expenseAccounts.find((account) => account.id === invoice.glExpenseAccountId)
                                    ?.name || 'Unknown category'
                                : 'Uncategorised'}
                            </p>
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
                          {canUpdateInvoice ? (
                            <button
                              type="button"
                              className="portal-inline-btn"
                              onClick={() => {
                                if (recatInvoiceId === invoice.id) {
                                  setRecatInvoiceId(null);
                                  return;
                                }
                                setRecatInvoiceId(invoice.id);
                                setRecatForm({
                                  storeId: invoice.storeId || '',
                                  glExpenseAccountId: invoice.glExpenseAccountId || '',
                                });
                              }}
                            >
                              {recatInvoiceId === invoice.id ? 'Cancel' : 'Recategorise'}
                            </button>
                          ) : null}
                        </div>

                        {recatInvoiceId === invoice.id && canUpdateInvoice ? (
                          <form
                            className="portal-entity-form portal-inline-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void onRecategoriseInvoice(invoice.id);
                            }}
                          >
                            <p className="portal-muted" style={{ margin: 0 }}>
                              Tag this spend so it shows on the store cost report. Amounts are not
                              changed — only where the cost is reported.
                            </p>
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>Store</span>
                                <select
                                  value={recatForm.storeId}
                                  onChange={(event) =>
                                    setRecatForm((prev) => ({ ...prev, storeId: event.target.value }))
                                  }
                                >
                                  <option value="">No store</option>
                                  {stores.map((store) => (
                                    <option key={store.id} value={store.id}>
                                      {store.code} — {store.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Expense Category</span>
                                <select
                                  value={recatForm.glExpenseAccountId}
                                  onChange={(event) =>
                                    setRecatForm((prev) => ({
                                      ...prev,
                                      glExpenseAccountId: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Uncategorised</option>
                                  {expenseAccounts.map((account) => (
                                    <option key={account.id} value={account.id}>
                                      {account.code} — {account.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <button type="submit" className="portal-primary-btn" disabled={mutating}>
                              {mutating ? 'Saving...' : 'Save Tagging'}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
                <ListPager controls={invoiceControls} noun="invoices" />

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
              <article className="portal-card" data-tour="payable.payments">
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

                <div className="list-toolbar">
                  <ListSearch controls={paymentControls} placeholder="Search payments or suppliers…" />
                  <ListExport
                    rows={paymentControls.filtered}
                    config={{
                      fileName: 'supplier-payments',
                      dateOf: (row) => row.stagedAt,
                      dateLabel: 'Staged',
                      columns: [
                        { header: 'Payment Number', value: (row) => row.paymentNumber },
                        { header: 'Supplier', value: (row) => supplierLabel(supplierMap.get(row.supplierId)) },
                        { header: 'Currency', value: (row) => row.currency },
                        { header: 'Amount', value: (row) => Number(row.amount) },
                        { header: 'Status', value: (row) => row.status },
                        { header: 'Staged', value: (row) => formatDate(row.stagedAt) },
                        { header: 'Allocations', value: (row) => row.allocations?.length ?? 0 },
                      ],
                    }}
                  />
                </div>

                <div className="portal-list-stack">
                  {paymentControls.visible.length === 0 ? (
                    <div className="portal-empty-state">
                      {paymentControls.search ? 'No payments match that search.' : 'No payments staged yet.'}
                    </div>
                  ) : (
                    paymentControls.visible.map((payment) => (
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
                <ListPager controls={paymentControls} noun="payments" />
              </article>
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
