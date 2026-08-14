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
  downloadFile,
  formatDate,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
  uploadMedia,
} from '../lib';

type PettyCashBox = { id: string; name: string; custodian: string; currency: string; floatAmount: string | number; isActive: boolean };

type PettyCashVoucher = {
  id: string;
  voucherNumber: string;
  boxId: string;
  type: 'TOPUP' | 'EXPENSE';
  amount: string | number;
  payee?: string | null;
  purpose: string;
  receiptUrl?: string | null;
  status: 'DRAFT' | 'APPROVED' | 'VOID';
  printCount: number;
  createdAt: string;
};

type PettyCashReconciliation = {
  id: string;
  boxId: string;
  periodEnd: string;
  expectedBalance: string | number;
  countedBalance: string | number;
  variance: string | number;
};

type BoxBalance = { boxId: string; openingFloat: number; balance: number };

export default function PettyCashPage() {
  const dialog = usePortalDialog();
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const [boxes, setBoxes] = useState<PettyCashBox[]>([]);
  const [vouchers, setVouchers] = useState<PettyCashVoucher[]>([]);
  const [reconciliations, setReconciliations] = useState<PettyCashReconciliation[]>([]);
  const [balances, setBalances] = useState<Record<string, BoxBalance>>({});
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const [downloadingVoucherId, setDownloadingVoucherId] = useState<string | null>(null);

  const [showBoxForm, setShowBoxForm] = useState(false);
  const [boxName, setBoxName] = useState('');
  const [boxCustodian, setBoxCustodian] = useState('');
  const [boxFloat, setBoxFloat] = useState('0');

  const [showVoucherForm, setShowVoucherForm] = useState(false);
  const [voucherType, setVoucherType] = useState<'TOPUP' | 'EXPENSE'>('EXPENSE');
  const [voucherAmount, setVoucherAmount] = useState('');
  const [voucherPayee, setVoucherPayee] = useState('');
  const [voucherPurpose, setVoucherPurpose] = useState('');
  const [voucherReceiptUrl, setVoucherReceiptUrl] = useState('');

  const [showReconForm, setShowReconForm] = useState(false);
  const [reconCounted, setReconCounted] = useState('');
  const [reconNotes, setReconNotes] = useState('');

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await loadProfile(authToken);
      const [nextBoxes, nextVouchers, nextRecon] = await Promise.all([
        hasPermission(nextProfile, 'petty-cash-box.read')
          ? apiRequest<PettyCashBox[]>('/petty-cash-boxes', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'petty-cash-voucher.read')
          ? apiRequest<PettyCashVoucher[]>('/petty-cash-vouchers', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'petty-cash-reconciliation.read')
          ? apiRequest<PettyCashReconciliation[]>('/petty-cash-reconciliations', { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);
      setProfile(nextProfile);
      setBoxes(nextBoxes);
      setVouchers(nextVouchers);
      setReconciliations(nextRecon);
      setActiveBoxId((prev) => prev || nextBoxes[0]?.id || null);

      if (hasPermission(nextProfile, 'petty-cash-box.read')) {
        const balanceEntries = await Promise.all(
          nextBoxes.map((box) =>
            apiRequest<BoxBalance>(`/petty-cash-boxes/${box.id}/balance`, { method: 'GET' }, authToken).then(
              (result) => [box.id, result] as const,
            ),
          ),
        );
        setBalances(Object.fromEntries(balanceEntries));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load petty cash.');
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

  const activeBox = useMemo(() => boxes.find((box) => box.id === activeBoxId) || null, [boxes, activeBoxId]);
  const activeVouchers = useMemo(() => vouchers.filter((voucher) => voucher.boxId === activeBoxId), [vouchers, activeBoxId]);
  const activeReconciliations = useMemo(
    () => reconciliations.filter((recon) => recon.boxId === activeBoxId),
    [reconciliations, activeBoxId],
  );

  const canCreateBox = hasPermission(profile, 'petty-cash-box.create');
  const canCreateVoucher = hasPermission(profile, 'petty-cash-voucher.create');
  const canUpdateVoucher = hasPermission(profile, 'petty-cash-voucher.update');
  const canCreateRecon = hasPermission(profile, 'petty-cash-reconciliation.create');

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

  async function onCreateBox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateBox) return;
    await runMutation(async () => {
      await apiRequest(
        '/petty-cash-boxes',
        { method: 'POST', body: JSON.stringify({ name: boxName, custodian: boxCustodian, floatAmount: Number(boxFloat || 0) }) },
        token,
      );
      setShowBoxForm(false);
      setBoxName('');
      setBoxCustodian('');
      setBoxFloat('0');
    }, 'Petty cash box created.');
  }

  async function onUploadReceipt(file: File) {
    if (!token) return;
    setUploadingReceipt(true);
    setErrorMessage(null);
    try {
      const uploaded = await uploadMedia(file, token);
      setVoucherReceiptUrl(uploaded.url);
      setFeedback('Receipt uploaded.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload receipt.');
    } finally {
      setUploadingReceipt(false);
    }
  }

  async function onCreateVoucher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateVoucher || !activeBoxId) return;
    await runMutation(async () => {
      await apiRequest(
        '/petty-cash-vouchers',
        {
          method: 'POST',
          body: JSON.stringify({
            boxId: activeBoxId,
            type: voucherType,
            amount: Number(voucherAmount),
            payee: voucherPayee || undefined,
            purpose: voucherPurpose,
            receiptUrl: voucherReceiptUrl || undefined,
            createdBy: profile?.email,
          }),
        },
        token,
      );
      setShowVoucherForm(false);
      setVoucherAmount('');
      setVoucherPayee('');
      setVoucherPurpose('');
      setVoucherReceiptUrl('');
    }, 'Voucher recorded.');
  }

  async function onPrintVoucher(voucher: PettyCashVoucher) {
    if (!token) return;
    setDownloadingVoucherId(voucher.id);
    setErrorMessage(null);
    try {
      if (canUpdateVoucher) {
        await apiRequest(`/petty-cash-vouchers/${voucher.id}/print`, { method: 'POST' }, token);
      }
      await downloadFile(`/petty-cash-vouchers/${voucher.id}/pdf`, token, `voucher-${voucher.voucherNumber}.pdf`);
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to print voucher.');
    } finally {
      setDownloadingVoucherId(null);
    }
  }

  async function onVoidVoucher(id: string) {
    if (!token || !canUpdateVoucher) return;
    const confirmed = await dialog.confirm({
      title: 'Void Voucher',
      message: 'Void this voucher? This reverses its GL entry.',
      confirmLabel: 'Void',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/petty-cash-vouchers/${id}/void`, { method: 'POST' }, token);
    }, 'Voucher voided.');
  }

  async function onCreateReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateRecon || !activeBoxId) return;
    await runMutation(async () => {
      await apiRequest(
        '/petty-cash-reconciliations',
        {
          method: 'POST',
          body: JSON.stringify({
            boxId: activeBoxId,
            periodEnd: new Date().toISOString().slice(0, 10),
            countedBalance: Number(reconCounted),
            notes: reconNotes || undefined,
            reconciledBy: profile?.email,
          }),
        },
        token,
      );
      setShowReconForm(false);
      setReconCounted('');
      setReconNotes('');
    }, 'Reconciliation recorded.');
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading petty cash...</article>
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
            pageTitle="Petty Cash"
            pageSubtitle="Cash boxes, top-up/expense vouchers, and reconciliations."
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

            <article className="portal-card">
              <div className="portal-card-header-row">
                <h2 style={{ margin: 0 }}>Petty Cash Boxes</h2>
                {canCreateBox ? (
                  <button type="button" className="portal-inline-btn" onClick={() => setShowBoxForm((prev) => !prev)}>
                    {showBoxForm ? 'Close' : 'New Box'}
                  </button>
                ) : null}
              </div>

              {showBoxForm && canCreateBox ? (
                <form className="portal-entity-form portal-detail-form" onSubmit={onCreateBox}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Name</span>
                      <input value={boxName} onChange={(event) => setBoxName(event.target.value)} required />
                    </label>
                    <label>
                      <span>Custodian</span>
                      <input value={boxCustodian} onChange={(event) => setBoxCustodian(event.target.value)} required />
                    </label>
                  </div>
                  <label>
                    <span>Opening Float</span>
                    <input type="number" min={0} step="0.01" value={boxFloat} onChange={(event) => setBoxFloat(event.target.value)} />
                  </label>
                  <button type="submit" className="portal-primary-btn" disabled={mutating}>
                    {mutating ? 'Saving...' : 'Create Box'}
                  </button>
                </form>
              ) : null}

              {boxes.length === 0 ? (
                <div className="portal-empty-state">No petty cash boxes yet.</div>
              ) : (
                <div className="portal-action-row" style={{ flexWrap: 'wrap' }}>
                  {boxes.map((box) => (
                    <button
                      key={box.id}
                      type="button"
                      className={`portal-inline-btn${box.id === activeBoxId ? ' is-active' : ''}`}
                      onClick={() => setActiveBoxId(box.id)}
                    >
                      {box.name} — {formatMoney(balances[box.id]?.balance ?? box.floatAmount, box.currency)}
                    </button>
                  ))}
                </div>
              )}
            </article>

            {activeBox ? (
              <div className="portal-stack-grid" style={{ marginTop: 20 }}>
                <article className="portal-card">
                  <div className="portal-card-header-row">
                    <div>
                      <h2 style={{ margin: 0 }}>{activeBox.name} — Vouchers</h2>
                      <p className="portal-muted">Custodian: {activeBox.custodian}</p>
                    </div>
                    {canCreateVoucher ? (
                      <button type="button" className="portal-inline-btn" onClick={() => setShowVoucherForm((prev) => !prev)}>
                        {showVoucherForm ? 'Close' : 'New Voucher'}
                      </button>
                    ) : null}
                  </div>

                  {showVoucherForm && canCreateVoucher ? (
                    <form className="portal-entity-form portal-detail-form" onSubmit={onCreateVoucher}>
                      <div className="portal-entity-grid-2">
                        <label>
                          <span>Type</span>
                          <select value={voucherType} onChange={(event) => setVoucherType(event.target.value as any)}>
                            <option value="EXPENSE">Expense</option>
                            <option value="TOPUP">Top-up</option>
                          </select>
                        </label>
                        <label>
                          <span>Amount</span>
                          <input type="number" min={0.01} step="0.01" value={voucherAmount} onChange={(event) => setVoucherAmount(event.target.value)} required />
                        </label>
                      </div>
                      <div className="portal-entity-grid-2">
                        <label>
                          <span>Payee</span>
                          <input value={voucherPayee} onChange={(event) => setVoucherPayee(event.target.value)} />
                        </label>
                        <label>
                          <span>Purpose</span>
                          <input value={voucherPurpose} onChange={(event) => setVoucherPurpose(event.target.value)} required />
                        </label>
                      </div>

                      <div>
                        <span style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Receipt</span>
                        <div className="portal-action-row">
                          <button
                            type="button"
                            className="portal-inline-btn"
                            disabled={uploadingReceipt}
                            onClick={() => receiptInputRef.current?.click()}
                          >
                            {uploadingReceipt ? 'Uploading...' : voucherReceiptUrl ? 'Replace Receipt' : 'Attach Receipt'}
                          </button>
                          {voucherReceiptUrl ? (
                            <a href={voucherReceiptUrl} target="_blank" rel="noreferrer" className="portal-inline-btn">
                              View
                            </a>
                          ) : null}
                        </div>
                        <input
                          ref={receiptInputRef}
                          type="file"
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void onUploadReceipt(file);
                            event.target.value = '';
                          }}
                        />
                      </div>

                      <button type="submit" className="portal-primary-btn" disabled={mutating || uploadingReceipt}>
                        {mutating ? 'Saving...' : 'Save Voucher'}
                      </button>
                    </form>
                  ) : null}

                  <div className="portal-list-stack">
                    {activeVouchers.length === 0 ? (
                      <div className="portal-empty-state">No vouchers for this box yet.</div>
                    ) : (
                      activeVouchers.map((voucher) => (
                        <div key={voucher.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>{voucher.voucherNumber}</strong>
                              <p>{voucher.purpose}</p>
                              <p>
                                {voucher.payee ? `${voucher.payee} • ` : ''}
                                {formatDate(voucher.createdAt)}
                                {voucher.printCount > 0 ? ` • Printed ${voucher.printCount}x` : ''}
                              </p>
                            </div>
                            <span>{voucher.type}</span>
                            <span>{formatMoney(voucher.amount, activeBox.currency)}</span>
                          </div>
                          <div className="portal-action-row">
                            {voucher.receiptUrl ? (
                              <a href={voucher.receiptUrl} target="_blank" rel="noreferrer" className="portal-inline-btn">
                                Print Receipt
                              </a>
                            ) : null}
                            <button
                              type="button"
                              className="portal-inline-btn"
                              disabled={downloadingVoucherId === voucher.id}
                              onClick={() => void onPrintVoucher(voucher)}
                            >
                              {downloadingVoucherId === voucher.id ? 'Preparing...' : 'Print Voucher'}
                            </button>
                            {canUpdateVoucher && voucher.status !== 'VOID' ? (
                              <button type="button" className="portal-inline-btn is-danger" onClick={() => void onVoidVoucher(voucher.id)}>
                                Void
                              </button>
                            ) : null}
                            {voucher.status === 'VOID' ? <span className="portal-chip is-danger">VOID</span> : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>

                <article className="portal-card">
                  <div className="portal-card-header-row">
                    <h2 style={{ margin: 0 }}>Reconciliations</h2>
                    {canCreateRecon ? (
                      <button type="button" className="portal-inline-btn" onClick={() => setShowReconForm((prev) => !prev)}>
                        {showReconForm ? 'Close' : 'Reconcile'}
                      </button>
                    ) : null}
                  </div>

                  {showReconForm && canCreateRecon ? (
                    <form className="portal-entity-form portal-detail-form" onSubmit={onCreateReconciliation}>
                      <p className="portal-muted">
                        Expected balance: {formatMoney(balances[activeBox.id]?.balance ?? 0, activeBox.currency)}
                      </p>
                      <label>
                        <span>Counted Balance</span>
                        <input type="number" min={0} step="0.01" value={reconCounted} onChange={(event) => setReconCounted(event.target.value)} required />
                      </label>
                      <label>
                        <span>Notes</span>
                        <textarea rows={2} value={reconNotes} onChange={(event) => setReconNotes(event.target.value)} />
                      </label>
                      <button type="submit" className="portal-primary-btn" disabled={mutating}>
                        {mutating ? 'Saving...' : 'Record Reconciliation'}
                      </button>
                    </form>
                  ) : null}

                  <div className="portal-list-stack">
                    {activeReconciliations.length === 0 ? (
                      <div className="portal-empty-state">No reconciliations recorded yet.</div>
                    ) : (
                      activeReconciliations.map((recon) => (
                        <div key={recon.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>{formatDate(recon.periodEnd)}</strong>
                              <p>
                                Expected {formatMoney(recon.expectedBalance, activeBox.currency)} • Counted{' '}
                                {formatMoney(recon.countedBalance, activeBox.currency)}
                              </p>
                            </div>
                            <span>Variance</span>
                            <span>{formatMoney(recon.variance, activeBox.currency)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              </div>
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
