"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../../../components/notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../../components/elite-layout';
import { PortalShell } from '../../../components/portal-shell';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  formatDate,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../../lib';

type Supplier = {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  kraPin?: string | null;
  paymentTermsDays: number;
  isActive: boolean;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  taxAmount: number;
  status: string;
  amountPaid: number;
  outstanding: number;
  isOverdue: boolean;
};

type PaymentRow = {
  id: string;
  paymentNumber: string;
  amount: number;
  whtAmount: number;
  netPaid: number;
  status: string;
  stagedAt: string;
  paidAt?: string | null;
  allocatedCount: number;
};

type TaggedRow = {
  lineId: string;
  entryId: string;
  entryNumber: string;
  entryDate: string;
  memo?: string | null;
  source: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
};

type Account = {
  supplier: Supplier;
  summary: {
    invoicedTotal: number;
    paidTotal: number;
    outstanding: number;
    cashPaid: number;
    withholdingTax: number;
    stagedNotPaid: number;
    directSpend: number;
    invoiceCount: number;
    overdueCount: number;
    overdueAmount: number;
  };
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  taggedTransactions: TaggedRow[];
};

type JournalLine = {
  id: string;
  accountId: string;
  account?: { code: string; name: string; type: string };
  debit: string | number;
  credit: string | number;
  memo?: string | null;
  supplier?: { id: string; name: string } | null;
};

type JournalEntry = {
  id: string;
  entryNumber: string;
  entryDate: string;
  memo?: string | null;
  source: string;
  lines: JournalLine[];
};

export default function SupplierAccountClient({ supplierId }: { supplierId: string }) {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();

  const [account, setAccount] = useState<Account | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [showTagger, setShowTagger] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidates, setCandidates] = useState<JournalEntry[]>([]);
  const [searching, setSearching] = useState(false);

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
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        setAccount(
          await apiRequest<Account>(
            `/suppliers/${supplierId}/account?${params}`,
            { method: 'GET' },
            authToken,
          ),
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load this supplier.');
      } finally {
        setLoading(false);
      }
    },
    [supplierId, from, to],
  );

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const canTag = hasPermission(profile, 'journal-entry.update');
  const roleLabel = useMemo(() => roleLabelFor(profile), [profile]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  /** Ledger lines that could belong to this supplier but carry no tag yet. */
  async function searchCandidates() {
    if (!token) return;
    setSearching(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({ take: '25' });
      if (candidateSearch.trim()) params.set('search', candidateSearch.trim());
      const page = await apiRequest<{ items: JournalEntry[] }>(
        `/journal-entries?${params}`,
        { method: 'GET' },
        token,
      );
      setCandidates(page.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not search transactions.');
    } finally {
      setSearching(false);
    }
  }

  async function tagLine(lineId: string, supplier: string | null) {
    if (!token) return;
    setBusy(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      await apiRequest(
        `/suppliers/journal-lines/${lineId}/tag`,
        { method: 'PATCH', body: JSON.stringify({ supplierId: supplier }) },
        token,
      );
      setFeedback(supplier ? 'Transaction tagged to this supplier.' : 'Tag removed.');
      await load(token);
      if (showTagger) await searchCandidates();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update the tag.');
    } finally {
      setBusy(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-auth-section" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading supplier account...</article>
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
              <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                Go to Portal Login
              </Link>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!account) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main is-authenticated">
          <section className="lp-container portal-auth-section">
            <article className="portal-card">
              <div className="portal-empty-state">{errorMessage || 'Supplier not found.'}</div>
              <Link href="/portal/accounting/payable" className="portal-ghost-btn" style={{ display: 'inline-flex', width: 'fit-content', marginTop: 12 }}>
                Back to Payables
              </Link>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  const { supplier, summary } = account;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="accounting"
            pageTitle={supplier.name}
            pageSubtitle="What this supplier has been invoiced, what they have been paid, and what is still owed."
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={hasPermission(profile, 'role.read')}
            onLogout={onLogout}
            onRefresh={() => token && void load(token)}
          >
            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <Link href="/portal/accounting/payable" className="portal-ghost-btn">
                Back to Payables
              </Link>
            </div>


            <div className="portal-stats-grid">
              <article className="portal-card portal-stat-card">
                <span>Invoiced</span>
                <strong>{formatMoney(summary.invoicedTotal)}</strong>
              </article>
              <article className="portal-card portal-stat-card">
                <span>Paid</span>
                <strong>{formatMoney(summary.paidTotal)}</strong>
              </article>
              <article className="portal-card portal-stat-card">
                <span>Still Owed</span>
                <strong>{formatMoney(summary.outstanding)}</strong>
              </article>
              <article className="portal-card portal-stat-card">
                <span>Overdue</span>
                <strong>{formatMoney(summary.overdueAmount)}</strong>
              </article>
            </div>

            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>Contact &amp; Terms</h2>
              <div className="portal-info-list">
                <div className="portal-info-row">
                  <span>Contact</span>
                  <strong>{supplier.contactName || '—'}</strong>
                </div>
                <div className="portal-info-row">
                  <span>Phone / Email</span>
                  <strong>{[supplier.phone, supplier.email].filter(Boolean).join(' • ') || '—'}</strong>
                </div>
                <div className="portal-info-row">
                  <span>KRA PIN</span>
                  <strong>{supplier.kraPin || '—'}</strong>
                </div>
                <div className="portal-info-row">
                  <span>Payment Terms</span>
                  <strong>{supplier.paymentTermsDays} days</strong>
                </div>
                <div className="portal-info-row">
                  <span>Cash Paid Out</span>
                  <strong>
                    {formatMoney(summary.cashPaid)}
                    {summary.withholdingTax > 0 ? ` (WHT ${formatMoney(summary.withholdingTax)})` : ''}
                  </strong>
                </div>
                {summary.stagedNotPaid > 0 ? (
                  <div className="portal-info-row">
                    <span>Staged, Not Yet Paid</span>
                    <strong>{formatMoney(summary.stagedNotPaid)}</strong>
                  </div>
                ) : null}
                {summary.directSpend !== 0 ? (
                  <div className="portal-info-row">
                    <span>Direct Spend (no invoice)</span>
                    <strong>{formatMoney(summary.directSpend)}</strong>
                  </div>
                ) : null}
              </div>

              <div className="portal-entity-form" style={{ marginTop: 14 }}>
                <div className="portal-entity-grid-3">
                  <label>
                    <span>From</span>
                    <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                  </label>
                  <label>
                    <span>To</span>
                    <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                  </label>
                  <div className="portal-check-row" style={{ alignItems: 'flex-end' }}>
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => {
                        setFrom('');
                        setTo('');
                      }}
                    >
                      Clear dates
                    </button>
                  </div>
                </div>
              </div>
            </article>

            <article className="portal-card">
              <div className="portal-card-header-row">
                <h2 style={{ margin: 0 }}>Invoices</h2>
                <span className="portal-muted">
                  {summary.invoiceCount} invoice{summary.invoiceCount === 1 ? '' : 's'}
                  {summary.overdueCount > 0 ? ` • ${summary.overdueCount} overdue` : ''}
                </span>
              </div>
              <div className="portal-list-stack">
                {account.invoices.length === 0 ? (
                  <div className="portal-empty-state">No invoices for this supplier.</div>
                ) : (
                  account.invoices.map((invoice) => (
                    <div key={invoice.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>
                            {invoice.invoiceNumber}
                            {invoice.isOverdue ? ' — OVERDUE' : ''}
                          </strong>
                          <p>
                            Invoiced {formatDate(invoice.invoiceDate)} • due {formatDate(invoice.dueDate)}
                            {invoice.taxAmount > 0 ? ` • tax ${formatMoney(invoice.taxAmount)}` : ''}
                          </p>
                          {invoice.amountPaid > 0 ? (
                            <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                              Paid {formatMoney(invoice.amountPaid)} of {formatMoney(invoice.amount)}
                            </p>
                          ) : null}
                        </div>
                        <span>{invoice.status}</span>
                        <span>
                          {invoice.outstanding > 0
                            ? `${formatMoney(invoice.outstanding)} owing`
                            : formatMoney(invoice.amount)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>Payments</h2>
              <div className="portal-list-stack">
                {account.payments.length === 0 ? (
                  <div className="portal-empty-state">No payments recorded yet.</div>
                ) : (
                  account.payments.map((payment) => (
                    <div key={payment.id} className="portal-list-row">
                      <div>
                        <strong>{payment.paymentNumber}</strong>
                        <p>
                          {payment.status === 'PAID'
                            ? `Paid ${formatDate(payment.paidAt)}`
                            : `Staged ${formatDate(payment.stagedAt)}`}
                          {' • '}
                          {payment.allocatedCount} invoice{payment.allocatedCount === 1 ? '' : 's'}
                          {payment.whtAmount > 0 ? ` • WHT ${formatMoney(payment.whtAmount)}` : ''}
                        </p>
                      </div>
                      <span>{payment.status}</span>
                      <span>{formatMoney(payment.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="portal-card">
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Tagged Transactions</h2>
                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                    Ledger entries attributed to this supplier without going through an invoice.
                  </p>
                </div>
                {canTag ? (
                  <button
                    type="button"
                    className="portal-inline-btn"
                    onClick={() => {
                      const next = !showTagger;
                      setShowTagger(next);
                      if (next && !candidates.length) void searchCandidates();
                    }}
                  >
                    {showTagger ? 'Close' : 'Tag a Transaction'}
                  </button>
                ) : null}
              </div>

              {showTagger && canTag ? (
                <div className="portal-entity-form" style={{ marginBottom: 16 }}>
                  <div className="portal-entity-grid-3">
                    <label style={{ gridColumn: 'span 2' }}>
                      <span>Find a ledger transaction</span>
                      <input
                        value={candidateSearch}
                        placeholder="Description, entry number, account…"
                        onChange={(event) => setCandidateSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void searchCandidates();
                        }}
                      />
                    </label>
                    <div className="portal-check-row" style={{ alignItems: 'flex-end' }}>
                      <button
                        type="button"
                        className="portal-primary-btn"
                        disabled={searching}
                        onClick={() => void searchCandidates()}
                      >
                        {searching ? 'Searching...' : 'Search'}
                      </button>
                    </div>
                  </div>

                  <div className="portal-list-stack">
                    {candidates.length === 0 ? (
                      <div className="portal-empty-state">
                        {searching ? 'Searching…' : 'No transactions found. Try a different search.'}
                      </div>
                    ) : (
                      candidates.map((entry) =>
                        entry.lines
                          // Only expense-side lines are worth attributing; the
                          // cash side of a payment is not supplier-specific.
                          .filter((line) => Number(line.debit) > 0 && line.account?.type === 'EXPENSE')
                          .map((line) => (
                            <div key={line.id} className="portal-record">
                              <div className="portal-list-row">
                                <div>
                                  <strong>{line.memo || entry.memo || entry.entryNumber}</strong>
                                  <p>
                                    {entry.entryNumber} • {formatDate(entry.entryDate)} •{' '}
                                    {line.account?.code} {line.account?.name}
                                  </p>
                                  {line.supplier ? (
                                    <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                      Currently tagged to {line.supplier.name}
                                    </p>
                                  ) : null}
                                </div>
                                <span>{formatMoney(line.debit)}</span>
                              </div>
                              <div className="portal-action-row">
                                {line.supplier?.id === supplierId ? (
                                  <button
                                    type="button"
                                    className="portal-inline-btn is-danger"
                                    disabled={busy}
                                    onClick={() => void tagLine(line.id, null)}
                                  >
                                    Remove Tag
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="portal-inline-btn"
                                    disabled={busy}
                                    onClick={() => void tagLine(line.id, supplierId)}
                                  >
                                    {line.supplier ? `Reassign to ${supplier.name}` : `Tag to ${supplier.name}`}
                                  </button>
                                )}
                              </div>
                            </div>
                          )),
                      )
                    )}
                  </div>
                </div>
              ) : null}

              <div className="portal-list-stack">
                {account.taggedTransactions.length === 0 ? (
                  <div className="portal-empty-state">
                    No transactions tagged to this supplier yet.
                  </div>
                ) : (
                  account.taggedTransactions.map((row) => (
                    <div key={row.lineId} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{row.memo || row.entryNumber}</strong>
                          <p>
                            {row.entryNumber} • {formatDate(row.entryDate)} • {row.accountCode}{' '}
                            {row.accountName}
                          </p>
                        </div>
                        <span>{row.source}</span>
                        <span>{formatMoney(row.debit || row.credit)}</span>
                      </div>
                      {canTag ? (
                        <div className="portal-action-row">
                          <button
                            type="button"
                            className="portal-inline-btn is-danger"
                            disabled={busy}
                            onClick={() => void tagLine(row.lineId, null)}
                          >
                            Remove Tag
                          </button>
                        </div>
                      ) : null}
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
