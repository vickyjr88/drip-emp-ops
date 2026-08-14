"use client";

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PasswordInput } from '../components/password-input';
import { EliteLayout } from '../components/elite-layout';

type CustomerSession = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type UtilityCharge = {
  id: string;
  category: string;
  amount: string | number;
  dueDay: number;
};

type PortalTenancy = {
  id: string;
  status: string;
  unitNumber: string;
  projectName: string;
  leaseStart: string;
  leaseEnd?: string | null;
  monthlyRent: string | number;
  currency: string;
  depositAmount?: string | number | null;
  rentDueDay: number;
  utilityCharges: UtilityCharge[];
};

type PayToAccount = {
  purpose: string;
  isFallback: boolean;
  accountName: string;
  bankName: string;
  accountNumber: string;
  branch?: string | null;
  currencyCode: string;
  type: string;
};

type RentChangeRequest = {
  id: string;
  proposedRent: string | number;
  currentRent?: string | number | null;
  currency: string;
  effectiveFrom?: string | null;
  ownerNote?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
};

type PortalOwnership = {
  id: string;
  unitId: string;
  unitNumber: string;
  projectName: string;
  ownershipPercentage: string | number;
  isPrimaryOwner: boolean;
  acquiredAt: string;
  canRequestRentChange: boolean;
  isTenanted: boolean;
  currentRent?: string | number | null;
  currency: string;
  rentChangeRequests: RentChangeRequest[];
};

type PortalContract = {
  id: string;
  contractNumber: string;
  unitNumber: string;
  projectName: string;
  currency: string;
  totalAgreedPrice: string | number;
  contractStatus: string;
  amountPaid: number;
  balance: number;
  payTo?: PayToAccount | null;
  paymentReference: string;
  installments: Array<{ id: string; sequence: number; dueDate: string; amount: string | number }>;
};

type PortalPayment = {
  id: string;
  receiptNumber: string;
  category?: string;
  amountPaid: string | number;
  currency: string;
  paymentDate: string;
  paymentMethod: string;
};

type Outstanding = {
  currency: string;
  month: string;
  totalOutstanding: number;
  lines: Array<{
    category: string;
    due: number;
    paid: number;
    outstanding: number;
    isPaid: boolean;
    dueDay: number;
  }>;
};

type Dashboard = {
  paymentDetails: {
    rent: PayToAccount | null;
    utilities: PayToAccount | null;
    reference: string | null;
  };
  tenancies: PortalTenancy[];
  ownerships: PortalOwnership[];
  contracts: PortalContract[];
  rentalPayments: PortalPayment[];
  salesPayments: PortalPayment[];
  outstanding: Outstanding | null;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
// Deliberately distinct from the staff portal key so the two sessions cannot
// be confused for one another in the same browser.
const TOKEN_KEY = 'drl_customer_token';

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
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      // Keep the status-based message.
    }
    const error = new Error(message);
    (error as any).status = response.status;
    throw error;
  }

  return (await response.json()) as T;
}

function money(value: string | number, currency: string) {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric)) return `${currency} 0.00`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

function ordinalDay(day: number) {
  const r10 = day % 10;
  const r100 = day % 100;
  if (r10 === 1 && r100 !== 11) return `${day}st`;
  if (r10 === 2 && r100 !== 12) return `${day}nd`;
  if (r10 === 3 && r100 !== 13) return `${day}rd`;
  return `${day}th`;
}

function label(value: string) {
  return value.replaceAll('_', ' ');
}

/**
 * Where to send money. Renders a clear fallback when no account is configured
 * for the project, so a payer is never left staring at an empty panel.
 */
function PayToBlock({
  title,
  account,
  reference,
  note,
}: {
  title: string;
  account?: PayToAccount | null;
  reference?: string | null;
  note?: string;
}) {
  if (!account) {
    return (
      <div className="portal-record">
        <strong>{title}</strong>
        <div className="portal-empty-state" style={{ marginTop: 8 }}>
          Payment details have not been published for this development yet. Please contact our office for
          account details before paying.
        </div>
      </div>
    );
  }

  return (
    <div className="portal-record">
      <strong>{title}</strong>
      {note ? (
        <p className="portal-muted" style={{ margin: '4px 0 8px' }}>
          {note}
        </p>
      ) : null}
      <div className="portal-info-list">
        <div className="portal-info-row">
          <span>{account.type === 'MOBILE_MONEY' ? 'Provider' : 'Bank'}</span>
          <strong>{account.bankName}</strong>
        </div>
        <div className="portal-info-row">
          <span>Account Name</span>
          <strong>{account.accountName}</strong>
        </div>
        <div className="portal-info-row">
          <span>{account.type === 'MOBILE_MONEY' ? 'Number' : 'Account Number'}</span>
          <strong>{account.accountNumber}</strong>
        </div>
        {account.branch ? (
          <div className="portal-info-row">
            <span>Branch</span>
            <strong>{account.branch}</strong>
          </div>
        ) : null}
        <div className="portal-info-row">
          <span>Currency</span>
          <strong>{account.currencyCode}</strong>
        </div>
        {reference ? (
          <div className="portal-info-row">
            <span>Payment Reference</span>
            <strong>{reference}</strong>
          </div>
        ) : null}
      </div>
      {reference ? (
        <p className="portal-muted" style={{ margin: '8px 0 0' }}>
          Always quote <strong>{reference}</strong> on your transfer so we can match your payment.
        </p>
      ) : null}
      {account.isFallback ? (
        <p className="portal-muted" style={{ margin: '8px 0 0' }}>
          This is our general collection account.
        </p>
      ) : null}
    </div>
  );
}

export default function AccountClient() {
  const [initialized, setInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const [rentFormUnitId, setRentFormUnitId] = useState<string | null>(null);
  const [proposedRent, setProposedRent] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [ownerNote, setOwnerNote] = useState('');
  const [submittingRent, setSubmittingRent] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setSession(null);
    setDashboard(null);
  }, []);

  const load = useCallback(
    async (authToken: string) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [me, data] = await Promise.all([
          apiRequest<CustomerSession>('/customer-portal/me', { method: 'GET' }, authToken),
          apiRequest<Dashboard>('/customer-portal/dashboard', { method: 'GET' }, authToken),
        ]);
        setSession(me);
        setDashboard(data);
      } catch (error) {
        // A dead or revoked token should return the visitor to the sign-in form
        // rather than stranding them on an error.
        if ((error as any)?.status === 401) {
          signOut();
          setErrorMessage('Your session has ended. Please sign in again.');
        } else {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load your account.');
        }
      } finally {
        setLoading(false);
      }
    },
    [signOut],
  );

  useEffect(() => {
    if (!initialized || !token) return;
    void load(token);
  }, [initialized, token, load]);

  async function onSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setErrorMessage(null);
    try {
      const result = await apiRequest<{ access_token: string; customer: CustomerSession }>(
        '/customer-portal/login',
        { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) },
      );
      window.localStorage.setItem(TOKEN_KEY, result.access_token);
      setPassword('');
      setToken(result.access_token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setSigningIn(false);
    }
  }

  async function onSubmitRentChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !rentFormUnitId) return;

    const amount = Number(proposedRent);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Enter a proposed rent greater than zero.');
      return;
    }

    setSubmittingRent(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      await apiRequest(
        '/customer-portal/rent-change-requests',
        {
          method: 'POST',
          body: JSON.stringify({
            unitId: rentFormUnitId,
            proposedRent: amount,
            effectiveFrom: effectiveFrom || undefined,
            ownerNote: ownerNote.trim() || undefined,
          }),
        },
        token,
      );
      setRentFormUnitId(null);
      setProposedRent('');
      setEffectiveFrom('');
      setOwnerNote('');
      setFeedback('Rent change submitted. Our team will review it and confirm with you.');
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to submit the rent change.');
    } finally {
      setSubmittingRent(false);
    }
  }

  async function onWithdrawRentChange(requestId: string) {
    if (!token) return;
    setErrorMessage(null);
    setFeedback(null);
    try {
      await apiRequest(
        `/customer-portal/rent-change-requests/${requestId}/withdraw`,
        { method: 'POST' },
        token,
      );
      setFeedback('Request withdrawn.');
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to withdraw the request.');
    }
  }

  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setChangingPassword(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      await apiRequest(
        '/customer-portal/change-password',
        { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) },
        token,
      );
      setFeedback('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setShowPasswordForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to change your password.');
    } finally {
      setChangingPassword(false);
    }
  }

  if (!initialized) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading...</article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!token) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72, maxWidth: 460 }}>
            <article className="portal-card">
              <h1 style={{ marginTop: 0 }}>My Account</h1>
              <p className="portal-muted">
                Sign in to view your unit, rent and utility charges, and payment history.
              </p>

              {errorMessage ? (
                <div className="portal-error" style={{ marginBottom: 12 }}>
                  {errorMessage}
                </div>
              ) : null}

              <form className="portal-entity-form" onSubmit={onSignIn}>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Password</span>
                  <PasswordInput
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </label>
                <button type="submit" className="portal-primary-btn" disabled={signingIn}>
                  {signingIn ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              <p className="portal-muted" style={{ marginBottom: 0, marginTop: 14 }}>
                No account yet? Contact our office and we will set up your access.
              </p>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (loading && !dashboard) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading your account...</article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  const tenancy = dashboard?.tenancies.find((item) => item.status === 'ACTIVE') || null;
  const outstanding = dashboard?.outstanding || null;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section" style={{ paddingTop: 40 }}>
          <div className="portal-stack-grid">
            <article className="portal-card">
              <div className="portal-card-header-row">
                <div>
                  <h1 style={{ margin: 0, fontSize: 24 }}>
                    Welcome, {session?.firstName} {session?.lastName}
                  </h1>
                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                    {session?.email}
                    {session?.phone ? ` • ${session.phone}` : ''}
                  </p>
                </div>
                <div className="portal-inline-actions">
                  <button
                    type="button"
                    className="portal-inline-btn"
                    onClick={() => setShowPasswordForm((prev) => !prev)}
                  >
                    {showPasswordForm ? 'Close' : 'Change Password'}
                  </button>
                  <button type="button" className="portal-ghost-btn" onClick={signOut}>
                    Sign Out
                  </button>
                </div>
              </div>

              {feedback ? <div className="portal-feedback">{feedback}</div> : null}
              {errorMessage ? <div className="portal-error">{errorMessage}</div> : null}

              {showPasswordForm ? (
                <form className="portal-entity-form portal-inline-form" onSubmit={onChangePassword}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Current Password</span>
                      <PasswordInput
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        required
                      />
                    </label>
                    <label>
                      <span>New Password (min 8 characters)</span>
                      <PasswordInput
                        autoComplete="new-password"
                        minLength={8}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        required
                      />
                    </label>
                  </div>
                  <button type="submit" className="portal-primary-btn" disabled={changingPassword}>
                    {changingPassword ? 'Saving...' : 'Update Password'}
                  </button>
                </form>
              ) : null}
            </article>

            {outstanding ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>What You Owe This Month</h2>
                <div className="portal-detail-stats" style={{ marginBottom: 16 }}>
                  <div>
                    <span>Outstanding ({outstanding.month})</span>
                    <strong>{money(outstanding.totalOutstanding, outstanding.currency)}</strong>
                  </div>
                </div>
                <div className="portal-list-stack">
                  {outstanding.lines.map((line) => (
                    <div key={line.category} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{label(line.category)}</strong>
                          <p>
                            Due on the {ordinalDay(line.dueDay)}
                            {line.paid > 0 ? ` • ${money(line.paid, outstanding.currency)} paid` : ''}
                          </p>
                        </div>
                        <span>{line.isPaid ? 'PAID' : 'DUE'}</span>
                        <span>
                          {line.isPaid
                            ? money(line.due, outstanding.currency)
                            : money(line.outstanding, outstanding.currency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            {tenancy ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>How to Pay</h2>
                <p className="portal-muted" style={{ marginTop: 0 }}>
                  Use these details to pay your rent and utility charges.
                </p>
                <div className="portal-list-stack">
                  <PayToBlock
                    title="Rent"
                    account={dashboard?.paymentDetails?.rent}
                    reference={dashboard?.paymentDetails?.reference}
                  />
                  <PayToBlock
                    title="Utilities"
                    account={dashboard?.paymentDetails?.utilities}
                    reference={dashboard?.paymentDetails?.reference}
                    note="Water, electricity, service charge and other monthly utilities."
                  />
                </div>
              </article>
            ) : null}

            {tenancy ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>My Home</h2>
                <div className="portal-detail-stats" style={{ marginBottom: 16 }}>
                  <div>
                    <span>Unit</span>
                    <strong>{tenancy.unitNumber}</strong>
                  </div>
                  <div>
                    <span>Development</span>
                    <strong>{tenancy.projectName}</strong>
                  </div>
                  <div>
                    <span>Monthly Rent</span>
                    <strong>{money(tenancy.monthlyRent, tenancy.currency)}</strong>
                  </div>
                  <div>
                    <span>Rent Due Day</span>
                    <strong>{ordinalDay(tenancy.rentDueDay)}</strong>
                  </div>
                  <div>
                    <span>Lease Start</span>
                    <strong>{formatDate(tenancy.leaseStart)}</strong>
                  </div>
                  <div>
                    <span>Lease End</span>
                    <strong>{formatDate(tenancy.leaseEnd)}</strong>
                  </div>
                </div>

                <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Monthly Charges</h3>
                <div className="portal-list-stack">
                  <div className="portal-record">
                    <div className="portal-list-row">
                      <div>
                        <strong>RENT</strong>
                        <p>Due on the {ordinalDay(tenancy.rentDueDay)} of each month</p>
                      </div>
                      <span>{tenancy.currency}</span>
                      <span>{money(tenancy.monthlyRent, tenancy.currency)}</span>
                    </div>
                  </div>
                  {tenancy.utilityCharges.map((charge) => (
                    <div key={charge.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{label(charge.category)}</strong>
                          <p>Due on the {ordinalDay(charge.dueDay)} of each month</p>
                        </div>
                        <span>{tenancy.currency}</span>
                        <span>{money(charge.amount, tenancy.currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            {dashboard?.ownerships.length ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>Units I Own</h2>
                <div className="portal-list-stack">
                  {dashboard.ownerships.map((ownership) => {
                    const pending = ownership.rentChangeRequests.find(
                      (request) => request.status === 'PENDING',
                    );
                    const decided = ownership.rentChangeRequests.filter(
                      (request) => request.status !== 'PENDING',
                    );

                    return (
                      <div key={ownership.id} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>
                              {ownership.unitNumber} • {ownership.projectName}
                            </strong>
                            <p>
                              Acquired {formatDate(ownership.acquiredAt)}
                              {ownership.isPrimaryOwner ? ' • Primary owner' : ''}
                              {ownership.isTenanted ? ' • Currently let' : ' • Vacant'}
                            </p>
                          </div>
                          <span>Share</span>
                          <span>{Number(ownership.ownershipPercentage)}%</span>
                        </div>

                        <div className="portal-info-list" style={{ marginTop: 10 }}>
                          <div className="portal-info-row">
                            <span>Current Rent</span>
                            <strong>
                              {ownership.currentRent != null
                                ? money(ownership.currentRent, ownership.currency)
                                : 'Not let'}
                            </strong>
                          </div>
                        </div>

                        {pending ? (
                          <div className="portal-record" style={{ marginTop: 10 }}>
                            <div className="portal-list-row">
                              <div>
                                <strong>Rent change awaiting review</strong>
                                <p>
                                  Proposed {money(pending.proposedRent, pending.currency)}
                                  {pending.effectiveFrom
                                    ? ` from ${formatDate(pending.effectiveFrom)}`
                                    : ''}{' '}
                                  • submitted {formatDate(pending.createdAt)}
                                </p>
                              </div>
                              <span>PENDING</span>
                              <span>{money(pending.proposedRent, pending.currency)}</span>
                            </div>
                            <div className="portal-action-row">
                              <button
                                type="button"
                                className="portal-inline-btn is-danger"
                                onClick={() => void onWithdrawRentChange(pending.id)}
                              >
                                Withdraw
                              </button>
                            </div>
                          </div>
                        ) : ownership.canRequestRentChange ? (
                          <div className="portal-inline-actions" style={{ marginTop: 10 }}>
                            <button
                              type="button"
                              className="portal-inline-btn"
                              onClick={() => {
                                setRentFormUnitId(
                                  rentFormUnitId === ownership.unitId ? null : ownership.unitId,
                                );
                                setProposedRent(
                                  ownership.currentRent != null ? String(ownership.currentRent) : '',
                                );
                                setEffectiveFrom('');
                                setOwnerNote('');
                              }}
                            >
                              {rentFormUnitId === ownership.unitId ? 'Cancel' : 'Set Rent'}
                            </button>
                          </div>
                        ) : (
                          <p className="portal-muted" style={{ margin: '10px 0 0' }}>
                            Only the primary owner can propose a rent change for this unit.
                          </p>
                        )}

                        {rentFormUnitId === ownership.unitId && !pending ? (
                          <form
                            className="portal-entity-form portal-inline-form"
                            onSubmit={onSubmitRentChange}
                          >
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>Proposed Monthly Rent ({ownership.currency})</span>
                                <input
                                  inputMode="decimal"
                                  value={proposedRent}
                                  onChange={(event) => setProposedRent(event.target.value)}
                                  required
                                />
                              </label>
                              <label>
                                <span>Effective From (optional)</span>
                                <input
                                  type="date"
                                  value={effectiveFrom}
                                  onChange={(event) => setEffectiveFrom(event.target.value)}
                                />
                              </label>
                            </div>
                            <label>
                              <span>Note for our team (optional)</span>
                              <input
                                value={ownerNote}
                                onChange={(event) => setOwnerNote(event.target.value)}
                                maxLength={500}
                              />
                            </label>
                            <p className="portal-muted" style={{ margin: 0 }}>
                              {ownership.isTenanted
                                ? 'This unit is currently let, so our team will review the change and agree it with the tenant before it takes effect.'
                                : 'Our team will review and confirm this rent.'}
                            </p>
                            <button
                              type="submit"
                              className="portal-primary-btn"
                              disabled={submittingRent}
                            >
                              {submittingRent ? 'Submitting...' : 'Submit for Review'}
                            </button>
                          </form>
                        ) : null}

                        {decided.length ? (
                          <div style={{ marginTop: 10 }}>
                            <p className="portal-muted" style={{ margin: '0 0 6px' }}>
                              Recent rent decisions
                            </p>
                            {decided.map((request) => (
                              <p key={request.id} className="portal-muted" style={{ margin: '2px 0' }}>
                                {request.status} • {money(request.proposedRent, request.currency)}
                                {request.reviewedAt ? ` on ${formatDate(request.reviewedAt)}` : ''}
                                {request.reviewNote ? ` — ${request.reviewNote}` : ''}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </article>
            ) : null}

            {dashboard?.contracts.length ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>My Purchase</h2>
                {dashboard.contracts.map((contract) => (
                  <div key={contract.id} style={{ marginBottom: 18 }}>
                    <div className="portal-detail-stats" style={{ marginBottom: 12 }}>
                      <div>
                        <span>Contract</span>
                        <strong>{contract.contractNumber}</strong>
                      </div>
                      <div>
                        <span>Unit</span>
                        <strong>
                          {contract.unitNumber} • {contract.projectName}
                        </strong>
                      </div>
                      <div>
                        <span>Total Price</span>
                        <strong>{money(contract.totalAgreedPrice, contract.currency)}</strong>
                      </div>
                      <div>
                        <span>Paid to Date</span>
                        <strong>{money(contract.amountPaid, contract.currency)}</strong>
                      </div>
                      <div>
                        <span>Balance</span>
                        <strong>{money(contract.balance, contract.currency)}</strong>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong>{contract.contractStatus}</strong>
                      </div>
                    </div>

                    <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>How to Pay Your Installments</h3>
                    <div className="portal-list-stack" style={{ marginBottom: 16 }}>
                      <PayToBlock
                        title={`Installments — ${contract.contractNumber}`}
                        account={contract.payTo}
                        reference={contract.paymentReference}
                      />
                    </div>

                    {contract.installments.length ? (
                      <>
                        <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Payment Schedule</h3>
                        <div className="portal-list-stack">
                          {contract.installments.map((installment) => (
                            <div key={installment.id} className="portal-record">
                              <div className="portal-list-row">
                                <div>
                                  <strong>Installment {installment.sequence}</strong>
                                  <p>Due {formatDate(installment.dueDate)}</p>
                                </div>
                                <span>{contract.currency}</span>
                                <span>{money(installment.amount, contract.currency)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                ))}
              </article>
            ) : null}

            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>Payment History</h2>
              {!dashboard?.rentalPayments.length && !dashboard?.salesPayments.length ? (
                <div className="portal-empty-state">No payments recorded yet.</div>
              ) : (
                <div className="portal-list-stack">
                  {dashboard?.rentalPayments.map((payment) => (
                    <div key={payment.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>
                            {label(payment.category || 'PAYMENT')} • {payment.receiptNumber}
                          </strong>
                          <p>
                            {formatDate(payment.paymentDate)} • {label(payment.paymentMethod)}
                          </p>
                        </div>
                        <span>{payment.currency}</span>
                        <span>{money(payment.amountPaid, payment.currency)}</span>
                      </div>
                    </div>
                  ))}
                  {dashboard?.salesPayments.map((payment) => (
                    <div key={payment.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>PURCHASE • {payment.receiptNumber}</strong>
                          <p>
                            {formatDate(payment.paymentDate)} • {label(payment.paymentMethod)}
                          </p>
                        </div>
                        <span>{payment.currency}</span>
                        <span>{money(payment.amountPaid, payment.currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            {!tenancy && !dashboard?.ownerships.length && !dashboard?.contracts.length ? (
              <article className="portal-card">
                <div className="portal-empty-state">
                  We do not have any active tenancy or ownership on file for you yet. Please contact our
                  office if you think this is a mistake.
                </div>
              </article>
            ) : null}
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
