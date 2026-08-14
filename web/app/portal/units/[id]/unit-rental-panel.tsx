"use client";

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';

export type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type Tenancy = {
  id: string;
  unitId: string;
  tenantId: string;
  leaseStart: string;
  leaseEnd?: string | null;
  status: 'PENDING' | 'ACTIVE' | 'ENDED';
  monthlyRent: string | number;
  currency: string;
  depositAmount?: string | number | null;
  rentDueDay?: number;
  notes?: string | null;
};

export type UtilityCharge = {
  id: string;
  tenancyId: string;
  category: string;
  amount: string | number;
  dueDay?: number | null;
  isActive: boolean;
  notes?: string | null;
};

export type RentChangeRequest = {
  id: string;
  unitId: string;
  proposedRent: string | number;
  currentRent?: string | number | null;
  currency: string;
  effectiveFrom?: string | null;
  ownerNote?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  reviewNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  requestedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
};

export type ReminderPreviewItem = {
  ruleId: string;
  ruleName: string;
  channel: string;
  targetType: string;
  targetId: string;
  dueDate: string;
  customerName: string;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  amountOutstanding: number;
  currency: string;
  description: string;
  smsBody?: string | null;
  emailSubject?: string | null;
  skipReason?: string | null;
};

export type RentalPayment = {
  id: string;
  tenancyId: string;
  receiptNumber: string;
  category: string;
  amountPaid: string | number;
  currency: string;
  paymentMethod: string;
  transactionReference: string;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
  paymentDate: string;
  notes?: string | null;
};

export type CollectionsReport = {
  from: string;
  to: string;
  currency: string;
  grandTotal: number;
  paymentCount: number;
  byCategory: Array<{ category: string; total: number; count: number }>;
  byMonth: Array<{ month: string; total: number; byCategory: Record<string, number> }>;
};

const RENTAL_CATEGORIES = [
  'RENT',
  'WATER',
  'ELECTRICITY',
  'GARBAGE',
  'SECURITY',
  'INTERNET',
  'PARKING',
  'SERVICE_CHARGE',
  'OTHER',
] as const;

type TenancyForm = {
  tenantId: string;
  leaseStart: string;
  leaseEnd: string;
  status: Tenancy['status'];
  monthlyRent: string;
  currency: string;
  depositAmount: string;
  notes: string;
};

type RentalPaymentForm = {
  tenancyId: string;
  receiptNumber: string;
  category: string;
  amountPaid: string;
  currency: string;
  paymentMethod: string;
  transactionReference: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  paymentDate: string;
  notes: string;
};

function formatMoney(value: string | number, currency: string) {
  const numericValue = Number(value || 0);
  if (Number.isNaN(numericValue)) {
    return `${currency} 0.00`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

function ordinalDay(day: number) {
  const remainderTen = day % 10;
  const remainderHundred = day % 100;
  if (remainderTen === 1 && remainderHundred !== 11) return `${day}st`;
  if (remainderTen === 2 && remainderHundred !== 12) return `${day}nd`;
  if (remainderTen === 3 && remainderHundred !== 13) return `${day}rd`;
  return `${day}th`;
}

function customerLabel(customer?: Customer | null) {
  if (!customer) return 'Unknown';
  return `${customer.firstName} ${customer.lastName}`;
}

function makeTenancyForm(tenancy?: Tenancy, defaultTenantId = ''): TenancyForm {
  return {
    tenantId: tenancy?.tenantId || defaultTenantId,
    leaseStart: tenancy?.leaseStart ? tenancy.leaseStart.slice(0, 10) : '',
    leaseEnd: tenancy?.leaseEnd ? tenancy.leaseEnd.slice(0, 10) : '',
    status: tenancy?.status || 'ACTIVE',
    monthlyRent: tenancy ? String(tenancy.monthlyRent) : '',
    currency: tenancy?.currency || 'KES',
    depositAmount: tenancy?.depositAmount != null ? String(tenancy.depositAmount) : '',
    notes: tenancy?.notes || '',
  };
}

function makeRentalPaymentForm(payment?: RentalPayment, defaultTenancyId = ''): RentalPaymentForm {
  return {
    tenancyId: payment?.tenancyId || defaultTenancyId,
    receiptNumber: payment?.receiptNumber || '',
    category: payment?.category || 'RENT',
    amountPaid: payment ? String(payment.amountPaid) : '',
    currency: payment?.currency || 'KES',
    paymentMethod: payment?.paymentMethod || 'BANK_TRANSFER',
    transactionReference: payment?.transactionReference || '',
    billingPeriodStart: payment?.billingPeriodStart ? payment.billingPeriodStart.slice(0, 10) : '',
    billingPeriodEnd: payment?.billingPeriodEnd ? payment.billingPeriodEnd.slice(0, 10) : '',
    paymentDate: payment?.paymentDate ? payment.paymentDate.slice(0, 10) : '',
    notes: payment?.notes || '',
  };
}

type Props = {
  unitId: string;
  customers: Customer[];
  tenancies: Tenancy[];
  utilityCharges: UtilityCharge[];
  rentalPayments: RentalPayment[];
  collections: CollectionsReport | null;
  collectionsFrom: string;
  collectionsTo: string;
  onCollectionsFromChange: (value: string) => void;
  onCollectionsToChange: (value: string) => void;
  onLoadCollections: () => void;
  mutating: boolean;
  rentChangeRequests: RentChangeRequest[];
  onReviewRentChange: (id: string, status: 'APPROVED' | 'REJECTED') => void;
  reminderPreview: ReminderPreviewItem[] | null;
  reminderLoading: boolean;
  reminderSendingId: string | null;
  canPreviewReminders: boolean;
  canSendReminders: boolean;
  onPreviewReminders: () => void;
  onSendReminder: (item: ReminderPreviewItem) => void;
  onSendAllReminders: () => void;
  canCreateTenancy: boolean;
  canUpdateTenancy: boolean;
  canDeleteTenancy: boolean;
  canCreatePayment: boolean;
  canUpdatePayment: boolean;
  canDeletePayment: boolean;
  onCreateTenancy: (payload: Record<string, unknown>) => Promise<void>;
  onUpdateTenancy: (id: string, payload: Record<string, unknown>) => Promise<void>;
  onDeleteTenancy: (id: string) => Promise<void>;
  onCreateRentalPayment: (payload: Record<string, unknown>) => Promise<void>;
  onUpdateRentalPayment: (id: string, payload: Record<string, unknown>) => Promise<void>;
  onDeleteRentalPayment: (id: string) => Promise<void>;
};

export default function UnitRentalPanel({
  unitId,
  customers,
  tenancies,
  utilityCharges,
  rentalPayments,
  collections,
  collectionsFrom,
  collectionsTo,
  onCollectionsFromChange,
  onCollectionsToChange,
  onLoadCollections,
  mutating,
  rentChangeRequests,
  onReviewRentChange,
  reminderPreview,
  reminderLoading,
  reminderSendingId,
  canPreviewReminders,
  canSendReminders,
  onPreviewReminders,
  onSendReminder,
  onSendAllReminders,
  canCreateTenancy,
  canUpdateTenancy,
  canDeleteTenancy,
  canCreatePayment,
  canUpdatePayment,
  canDeletePayment,
  onCreateTenancy,
  onUpdateTenancy,
  onDeleteTenancy,
  onCreateRentalPayment,
  onUpdateRentalPayment,
  onDeleteRentalPayment,
}: Props) {
  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const customer of customers) map.set(customer.id, customer);
    return map;
  }, [customers]);

  const activeTenancy = tenancies.find((item) => item.status === 'ACTIVE') || null;
  const defaultTenancyId = activeTenancy?.id || tenancies[0]?.id || '';

  const activeCharges = useMemo(
    () => (activeTenancy ? utilityCharges.filter((charge) => charge.tenancyId === activeTenancy.id) : []),
    [activeTenancy, utilityCharges],
  );

  // Paused charges stay visible but stop billing, matching what the reminder
  // engine actually sends out.
  const totalMonthlyBilling = useMemo(() => {
    const rent = Number(activeTenancy?.monthlyRent || 0);
    const utilities = activeCharges.reduce(
      (sum, charge) => (charge.isActive ? sum + Number(charge.amount || 0) : sum),
      0,
    );
    return (Number.isNaN(rent) ? 0 : rent) + utilities;
  }, [activeTenancy, activeCharges]);

  const [showTenancyForm, setShowTenancyForm] = useState(false);
  const [tenancyForm, setTenancyForm] = useState<TenancyForm>(makeTenancyForm());
  const [editingTenancyId, setEditingTenancyId] = useState<string | null>(null);
  const [tenancyEditForm, setTenancyEditForm] = useState<TenancyForm>(makeTenancyForm());

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState<RentalPaymentForm>(makeRentalPaymentForm());
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentEditForm, setPaymentEditForm] = useState<RentalPaymentForm>(makeRentalPaymentForm());

  async function handleCreateTenancy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreateTenancy({
      unitId,
      tenantId: tenancyForm.tenantId,
      leaseStart: tenancyForm.leaseStart,
      leaseEnd: tenancyForm.leaseEnd || undefined,
      status: tenancyForm.status,
      monthlyRent: tenancyForm.monthlyRent,
      currency: tenancyForm.currency,
      depositAmount: tenancyForm.depositAmount || undefined,
      notes: tenancyForm.notes || undefined,
    });
    setTenancyForm(makeTenancyForm());
    setShowTenancyForm(false);
  }

  async function handleUpdateTenancy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTenancyId) return;
    await onUpdateTenancy(editingTenancyId, {
      tenantId: tenancyEditForm.tenantId,
      leaseStart: tenancyEditForm.leaseStart,
      leaseEnd: tenancyEditForm.leaseEnd || null,
      status: tenancyEditForm.status,
      monthlyRent: tenancyEditForm.monthlyRent,
      currency: tenancyEditForm.currency,
      depositAmount: tenancyEditForm.depositAmount || null,
      notes: tenancyEditForm.notes || null,
    });
    setEditingTenancyId(null);
  }

  async function handleCreatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreateRentalPayment({
      ...paymentForm,
      billingPeriodStart: paymentForm.billingPeriodStart || undefined,
      billingPeriodEnd: paymentForm.billingPeriodEnd || undefined,
      paymentDate: paymentForm.paymentDate || undefined,
      notes: paymentForm.notes || undefined,
    });
    setPaymentForm(makeRentalPaymentForm(undefined, defaultTenancyId));
    setShowPaymentForm(false);
  }

  async function handleUpdatePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPaymentId) return;
    await onUpdateRentalPayment(editingPaymentId, {
      ...paymentEditForm,
      billingPeriodStart: paymentEditForm.billingPeriodStart || null,
      billingPeriodEnd: paymentEditForm.billingPeriodEnd || null,
      paymentDate: paymentEditForm.paymentDate || undefined,
      notes: paymentEditForm.notes || null,
    });
    setEditingPaymentId(null);
  }

  const pendingRentChanges = rentChangeRequests.filter((request) => request.status === 'PENDING');
  const decidedRentChanges = rentChangeRequests.filter((request) => request.status !== 'PENDING');

  return (
    <div className="portal-stack-grid">
      {rentChangeRequests.length ? (
        <article className="portal-card">
          <h2 style={{ marginTop: 0 }}>Owner Rent Change Requests</h2>
          <p className="portal-muted" style={{ marginTop: 0 }}>
            Raised by the unit owner from their account. Approving applies the new rent to the active
            tenancy immediately.
          </p>

          <div className="portal-list-stack">
            {pendingRentChanges.map((request) => (
              <div key={request.id} className="portal-record">
                <div className="portal-list-row">
                  <div>
                    <strong>
                      {request.currentRent != null
                        ? `${formatMoney(request.currentRent, request.currency)} → `
                        : ''}
                      {formatMoney(request.proposedRent, request.currency)}
                    </strong>
                    <p>
                      {request.requestedBy
                        ? `${request.requestedBy.firstName} ${request.requestedBy.lastName}`
                        : 'Owner'}{' '}
                      • submitted {formatDate(request.createdAt)}
                      {request.effectiveFrom ? ` • effective ${formatDate(request.effectiveFrom)}` : ''}
                    </p>
                    {request.ownerNote ? (
                      <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                        “{request.ownerNote}”
                      </p>
                    ) : null}
                  </div>
                  <span>PENDING</span>
                  <span>{formatMoney(request.proposedRent, request.currency)}</span>
                </div>
                {canUpdateTenancy ? (
                  <div className="portal-action-row">
                    <button
                      type="button"
                      className="portal-inline-btn"
                      disabled={mutating}
                      onClick={() => onReviewRentChange(request.id, 'APPROVED')}
                    >
                      Approve &amp; Apply
                    </button>
                    <button
                      type="button"
                      className="portal-inline-btn is-danger"
                      disabled={mutating}
                      onClick={() => onReviewRentChange(request.id, 'REJECTED')}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <p className="portal-muted" style={{ margin: '8px 0 0' }}>
                    You need tenancy update rights to review this.
                  </p>
                )}
              </div>
            ))}

            {decidedRentChanges.map((request) => (
              <div key={request.id} className="portal-record">
                <div className="portal-list-row">
                  <div>
                    <strong>{formatMoney(request.proposedRent, request.currency)}</strong>
                    <p>
                      {request.status}
                      {request.reviewedAt ? ` on ${formatDate(request.reviewedAt)}` : ''}
                      {request.reviewedBy ? ` by ${request.reviewedBy}` : ''}
                      {request.reviewNote ? ` — ${request.reviewNote}` : ''}
                    </p>
                  </div>
                  <span>{request.status}</span>
                  <span>{formatMoney(request.proposedRent, request.currency)}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      <div className="portal-section-grid">
        <article className="portal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>Tenancy</h2>
            {canCreateTenancy ? (
              <button
                type="button"
                className="portal-inline-btn"
                onClick={() => {
                  setTenancyForm(makeTenancyForm(undefined, customers[0]?.id || ''));
                  setShowTenancyForm((prev) => !prev);
                }}
              >
                {showTenancyForm ? 'Close' : 'Assign Tenant'}
              </button>
            ) : null}
          </div>

          {activeTenancy ? (
            <>
              <div className="portal-detail-stats" style={{ marginBottom: 16 }}>
                <div>
                  <span>Current Tenant</span>
                  <strong>
                    <Link href={`/portal/customers/${activeTenancy.tenantId}`}>
                      {customerLabel(customerMap.get(activeTenancy.tenantId))}
                    </Link>
                  </strong>
                </div>
                <div>
                  <span>Monthly Rent</span>
                  <strong>{formatMoney(activeTenancy.monthlyRent, activeTenancy.currency)}</strong>
                </div>
                <div>
                  <span>Rent Due Day</span>
                  <strong>{ordinalDay(activeTenancy.rentDueDay ?? 1)}</strong>
                </div>
                <div>
                  <span>Total Monthly Billing</span>
                  <strong>{formatMoney(totalMonthlyBilling, activeTenancy.currency)}</strong>
                </div>
                <div>
                  <span>Lease Start</span>
                  <strong>{formatDate(activeTenancy.leaseStart)}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{activeTenancy.status}</strong>
                </div>
              </div>

              <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Monthly Charges</h3>
              <div className="portal-list-stack" style={{ marginBottom: 16 }}>
                <div className="portal-record">
                  <div className="portal-list-row">
                    <div>
                      <strong>RENT</strong>
                      <p>Due on the {ordinalDay(activeTenancy.rentDueDay ?? 1)} of each month</p>
                    </div>
                    <span>{activeTenancy.currency}</span>
                    <span>{formatMoney(activeTenancy.monthlyRent, activeTenancy.currency)}</span>
                  </div>
                </div>

                {activeCharges.length === 0 ? (
                  <div className="portal-empty-state">
                    No recurring utilities configured.{' '}
                    <Link href={`/portal/units/${unitId}/edit`}>Add them in the unit editor</Link>.
                  </div>
                ) : (
                  activeCharges.map((charge) => (
                    <div key={charge.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>
                            {charge.category.replaceAll('_', ' ')}
                            {!charge.isActive ? ' (paused)' : ''}
                          </strong>
                          <p>
                            Due on the {ordinalDay(charge.dueDay ?? activeTenancy.rentDueDay ?? 1)} of each
                            month
                            {charge.notes ? ` • ${charge.notes}` : ''}
                          </p>
                        </div>
                        <span>{activeTenancy.currency}</span>
                        <span>{formatMoney(charge.amount, activeTenancy.currency)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="portal-empty-state" style={{ marginBottom: 16 }}>
              No active tenant occupying this unit.
            </div>
          )}

          {showTenancyForm && canCreateTenancy ? (
            <form className="portal-entity-form portal-detail-form" onSubmit={handleCreateTenancy}>
              <label>
                <span>Tenant</span>
                <select
                  value={tenancyForm.tenantId}
                  onChange={(event) => setTenancyForm((prev) => ({ ...prev, tenantId: event.target.value }))}
                  required
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customerLabel(customer)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="portal-entity-grid-2">
                <label>
                  <span>Lease Start</span>
                  <input
                    type="date"
                    value={tenancyForm.leaseStart}
                    onChange={(event) => setTenancyForm((prev) => ({ ...prev, leaseStart: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Lease End</span>
                  <input
                    type="date"
                    value={tenancyForm.leaseEnd}
                    onChange={(event) => setTenancyForm((prev) => ({ ...prev, leaseEnd: event.target.value }))}
                  />
                </label>
              </div>
              <div className="portal-entity-grid-3">
                <label>
                  <span>Monthly Rent</span>
                  <input
                    value={tenancyForm.monthlyRent}
                    onChange={(event) => setTenancyForm((prev) => ({ ...prev, monthlyRent: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Currency</span>
                  <select
                    value={tenancyForm.currency}
                    onChange={(event) => setTenancyForm((prev) => ({ ...prev, currency: event.target.value }))}
                  >
                    <option value="KES">KES</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={tenancyForm.status}
                    onChange={(event) =>
                      setTenancyForm((prev) => ({ ...prev, status: event.target.value as Tenancy['status'] }))
                    }
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PENDING">PENDING</option>
                    <option value="ENDED">ENDED</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Deposit</span>
                <input
                  value={tenancyForm.depositAmount}
                  onChange={(event) => setTenancyForm((prev) => ({ ...prev, depositAmount: event.target.value }))}
                />
              </label>
              <label>
                <span>Notes</span>
                <input
                  value={tenancyForm.notes}
                  onChange={(event) => setTenancyForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </label>
              <button type="submit" className="portal-primary-btn" disabled={mutating}>
                {mutating ? 'Saving...' : 'Create Tenancy'}
              </button>
            </form>
          ) : null}

          <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Tenancy History</h3>
          <div className="portal-list-stack">
            {tenancies.length === 0 ? (
              <div className="portal-empty-state">No tenancy history for this unit.</div>
            ) : (
              tenancies.map((tenancy) => (
                <div key={tenancy.id} className="portal-record">
                  <div className="portal-list-row">
                    <div>
                      <strong>
                        <Link href={`/portal/customers/${tenancy.tenantId}`}>
                          {customerLabel(customerMap.get(tenancy.tenantId))}
                        </Link>
                      </strong>
                      <p>
                        {formatDate(tenancy.leaseStart)} → {formatDate(tenancy.leaseEnd)} •{' '}
                        {formatMoney(tenancy.monthlyRent, tenancy.currency)}/mo
                      </p>
                    </div>
                    <span>{tenancy.status}</span>
                    <span>{tenancy.currency}</span>
                  </div>
                  <div className="portal-action-row">
                    {canUpdateTenancy ? (
                      <button
                        type="button"
                        className="portal-inline-btn"
                        onClick={() => {
                          setEditingTenancyId(tenancy.id);
                          setTenancyEditForm(makeTenancyForm(tenancy));
                        }}
                      >
                        Edit
                      </button>
                    ) : null}
                    {canUpdateTenancy && tenancy.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        className="portal-inline-btn"
                        onClick={() =>
                          void onUpdateTenancy(tenancy.id, {
                            status: 'ENDED',
                            leaseEnd: new Date().toISOString().slice(0, 10),
                          })
                        }
                      >
                        End Tenancy
                      </button>
                    ) : null}
                    {canDeleteTenancy ? (
                      <button
                        type="button"
                        className="portal-inline-btn is-danger"
                        onClick={() => void onDeleteTenancy(tenancy.id)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>

                  {editingTenancyId === tenancy.id && canUpdateTenancy ? (
                    <form className="portal-entity-form portal-inline-form" onSubmit={handleUpdateTenancy}>
                      <label>
                        <span>Tenant</span>
                        <select
                          value={tenancyEditForm.tenantId}
                          onChange={(event) =>
                            setTenancyEditForm((prev) => ({ ...prev, tenantId: event.target.value }))
                          }
                          required
                        >
                          {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                              {customerLabel(customer)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="portal-entity-grid-2">
                        <label>
                          <span>Lease Start</span>
                          <input
                            type="date"
                            value={tenancyEditForm.leaseStart}
                            onChange={(event) =>
                              setTenancyEditForm((prev) => ({ ...prev, leaseStart: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <label>
                          <span>Lease End</span>
                          <input
                            type="date"
                            value={tenancyEditForm.leaseEnd}
                            onChange={(event) =>
                              setTenancyEditForm((prev) => ({ ...prev, leaseEnd: event.target.value }))
                            }
                          />
                        </label>
                      </div>
                      <div className="portal-entity-grid-3">
                        <label>
                          <span>Monthly Rent</span>
                          <input
                            value={tenancyEditForm.monthlyRent}
                            onChange={(event) =>
                              setTenancyEditForm((prev) => ({ ...prev, monthlyRent: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <label>
                          <span>Currency</span>
                          <select
                            value={tenancyEditForm.currency}
                            onChange={(event) =>
                              setTenancyEditForm((prev) => ({ ...prev, currency: event.target.value }))
                            }
                          >
                            <option value="KES">KES</option>
                            <option value="USD">USD</option>
                          </select>
                        </label>
                        <label>
                          <span>Status</span>
                          <select
                            value={tenancyEditForm.status}
                            onChange={(event) =>
                              setTenancyEditForm((prev) => ({
                                ...prev,
                                status: event.target.value as Tenancy['status'],
                              }))
                            }
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="PENDING">PENDING</option>
                            <option value="ENDED">ENDED</option>
                          </select>
                        </label>
                      </div>
                      <div className="portal-inline-actions">
                        <button type="submit" className="portal-primary-btn" disabled={mutating}>
                          Save
                        </button>
                        <button type="button" className="portal-ghost-btn" onClick={() => setEditingTenancyId(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </article>

        <article className="portal-card portal-payment-summary-card">
          <h2>Rent & Utility Collections</h2>
          <div className="portal-entity-form" style={{ marginBottom: 14 }}>
            <div className="portal-entity-grid-2">
              <label>
                <span>From</span>
                <input
                  type="date"
                  value={collectionsFrom}
                  onChange={(event) => onCollectionsFromChange(event.target.value)}
                />
              </label>
              <label>
                <span>To</span>
                <input
                  type="date"
                  value={collectionsTo}
                  onChange={(event) => onCollectionsToChange(event.target.value)}
                />
              </label>
            </div>
            <button type="button" className="portal-primary-btn" onClick={onLoadCollections} disabled={mutating}>
              Refresh Period Totals
            </button>
          </div>

          {collections ? (
            <>
              <div className="portal-payment-summary-grid">
                <div>
                  <span>Grand Total ({collections.currency})</span>
                  <strong>{formatMoney(collections.grandTotal, collections.currency)}</strong>
                </div>
                <div>
                  <span>Transactions</span>
                  <strong>{collections.paymentCount}</strong>
                </div>
              </div>
              <div className="portal-list-stack" style={{ marginTop: 14 }}>
                {collections.byCategory.length === 0 ? (
                  <div className="portal-empty-state">No rental/utility collections in this period.</div>
                ) : (
                  collections.byCategory.map((item) => (
                    <div key={item.category} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{item.category.replaceAll('_', ' ')}</strong>
                          <p>{item.count} payment{item.count === 1 ? '' : 's'}</p>
                        </div>
                        <span>{collections.currency}</span>
                        <span>{formatMoney(item.total, collections.currency)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {collections.byMonth.length > 0 ? (
                <>
                  <h3 style={{ margin: '16px 0 10px', fontSize: 16 }}>By Month</h3>
                  <div className="portal-list-stack">
                    {collections.byMonth.map((item) => (
                      <div key={item.month} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>{item.month}</strong>
                            <p>
                              {Object.entries(item.byCategory)
                                .map(([category, total]) => `${category}: ${formatMoney(total, collections.currency)}`)
                                .join(' • ')}
                            </p>
                          </div>
                          <span>TOTAL</span>
                          <span>{formatMoney(item.total, collections.currency)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <div className="portal-empty-state">Load a date range to see collections for this unit.</div>
          )}
        </article>
      </div>

      {canPreviewReminders && activeTenancy ? (
        <article className="portal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Payment Reminders</h2>
              <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                Check what rent and utility charges are outstanding for this tenant, then send a reminder
                without waiting for the schedule.
              </p>
            </div>
            <button
              type="button"
              className="portal-inline-btn"
              onClick={onPreviewReminders}
              disabled={reminderLoading}
            >
              {reminderLoading ? 'Checking...' : 'Check Outstanding'}
            </button>
          </div>

          {reminderPreview === null ? (
            <div className="portal-empty-state">
              Choose &ldquo;Check Outstanding&rdquo; to see what this tenant currently owes.
            </div>
          ) : reminderPreview.length === 0 ? (
            <div className="portal-empty-state">Nothing outstanding for this tenant right now.</div>
          ) : (
            <>
              <div className="portal-list-stack">
                {reminderPreview.map((item) => {
                  const rowId = `${item.ruleId}:${item.targetId}`;
                  return (
                    <div key={rowId} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{item.description}</strong>
                          <p>
                            {item.ruleName} • due {formatDate(item.dueDate)}
                            {item.skipReason ? ` • skipped: ${item.skipReason}` : ''}
                          </p>
                          <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                            {item.smsBody}
                          </p>
                        </div>
                        <span>{item.channel}</span>
                        <span>{formatMoney(item.amountOutstanding, item.currency)}</span>
                      </div>
                      <div className="portal-action-row">
                        {canSendReminders ? (
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => onSendReminder(item)}
                            disabled={Boolean(reminderSendingId)}
                          >
                            {reminderSendingId === rowId ? 'Sending...' : 'Send Reminder'}
                          </button>
                        ) : null}
                        <span className="portal-muted" style={{ alignSelf: 'center' }}>
                          {[item.recipientPhone, item.recipientEmail].filter(Boolean).join(' • ') ||
                            'No contact details on file'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {canSendReminders ? (
                <div className="portal-inline-actions" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="portal-primary-btn"
                    onClick={onSendAllReminders}
                    disabled={Boolean(reminderSendingId)}
                  >
                    {reminderSendingId === 'all'
                      ? 'Sending...'
                      : `Send All ${reminderPreview.length} Reminder${
                          reminderPreview.length === 1 ? '' : 's'
                        }`}
                  </button>
                </div>
              ) : (
                <div className="portal-role-banner" style={{ marginTop: 14 }}>
                  You do not have permission to send reminders.
                </div>
              )}
            </>
          )}
        </article>
      ) : null}

      <article className="portal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>Rent & Utility Payments</h2>
          {canCreatePayment ? (
            <button
              type="button"
              className="portal-inline-btn"
              disabled={tenancies.length === 0}
              onClick={() => {
                setPaymentForm(makeRentalPaymentForm(undefined, defaultTenancyId));
                setShowPaymentForm((prev) => !prev);
              }}
            >
              {showPaymentForm ? 'Close' : 'Record Payment'}
            </button>
          ) : null}
        </div>

        {tenancies.length === 0 ? (
          <div className="portal-empty-state">Create a tenancy before recording rent or utility payments.</div>
        ) : null}

        {showPaymentForm && canCreatePayment && tenancies.length > 0 ? (
          <form className="portal-entity-form portal-detail-form" onSubmit={handleCreatePayment}>
            <div className="portal-entity-grid-2">
              <label>
                <span>Tenancy</span>
                <select
                  value={paymentForm.tenancyId}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, tenancyId: event.target.value }))}
                  required
                >
                  {tenancies.map((tenancy) => (
                    <option key={tenancy.id} value={tenancy.id}>
                      {customerLabel(customerMap.get(tenancy.tenantId))} ({tenancy.status})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Category</span>
                <select
                  value={paymentForm.category}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, category: event.target.value }))}
                >
                  {RENTAL_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="portal-entity-grid-3">
              <label>
                <span>Receipt Number</span>
                <input
                  value={paymentForm.receiptNumber}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, receiptNumber: event.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Amount</span>
                <input
                  value={paymentForm.amountPaid}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, amountPaid: event.target.value }))}
                  required
                />
              </label>
              <label>
                <span>Currency</span>
                <select
                  value={paymentForm.currency}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, currency: event.target.value }))}
                >
                  <option value="KES">KES</option>
                  <option value="USD">USD</option>
                </select>
              </label>
            </div>
            <div className="portal-entity-grid-2">
              <label>
                <span>Method</span>
                <select
                  value={paymentForm.paymentMethod}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}
                >
                  <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                  <option value="CASH">CASH</option>
                  <option value="CARD">CARD</option>
                  <option value="MOBILE_MONEY">MOBILE_MONEY</option>
                  <option value="CHEQUE">CHEQUE</option>
                </select>
              </label>
              <label>
                <span>Transaction Reference</span>
                <input
                  value={paymentForm.transactionReference}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, transactionReference: event.target.value }))
                  }
                  required
                />
              </label>
            </div>
            <div className="portal-entity-grid-3">
              <label>
                <span>Payment Date</span>
                <input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, paymentDate: event.target.value }))}
                />
              </label>
              <label>
                <span>Period Start</span>
                <input
                  type="date"
                  value={paymentForm.billingPeriodStart}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, billingPeriodStart: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Period End</span>
                <input
                  type="date"
                  value={paymentForm.billingPeriodEnd}
                  onChange={(event) => setPaymentForm((prev) => ({ ...prev, billingPeriodEnd: event.target.value }))}
                />
              </label>
            </div>
            <button type="submit" className="portal-primary-btn" disabled={mutating}>
              {mutating ? 'Saving...' : 'Record Payment'}
            </button>
          </form>
        ) : null}

        <div className="portal-list-stack">
          {rentalPayments.length === 0 ? (
            <div className="portal-empty-state">No rent or utility payments recorded yet.</div>
          ) : (
            rentalPayments.map((payment) => {
              const tenancy = tenancies.find((item) => item.id === payment.tenancyId);
              return (
                <div key={payment.id} className="portal-record">
                  <div className="portal-list-row">
                    <div>
                      <strong>
                        {payment.category.replaceAll('_', ' ')} • {payment.receiptNumber}
                      </strong>
                      <p>
                        {payment.transactionReference} • {formatDate(payment.paymentDate)}
                        {tenancy
                          ? ` • ${customerLabel(customerMap.get(tenancy.tenantId))}`
                          : ''}
                      </p>
                    </div>
                    <span>{payment.currency}</span>
                    <span>{formatMoney(payment.amountPaid, payment.currency)}</span>
                  </div>
                  <div className="portal-action-row">
                    {canUpdatePayment ? (
                      <button
                        type="button"
                        className="portal-inline-btn"
                        onClick={() => {
                          setEditingPaymentId(payment.id);
                          setPaymentEditForm(makeRentalPaymentForm(payment));
                        }}
                      >
                        Edit
                      </button>
                    ) : null}
                    {canDeletePayment ? (
                      <button
                        type="button"
                        className="portal-inline-btn is-danger"
                        onClick={() => void onDeleteRentalPayment(payment.id)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>

                  {editingPaymentId === payment.id && canUpdatePayment ? (
                    <form className="portal-entity-form portal-inline-form" onSubmit={handleUpdatePayment}>
                      <div className="portal-entity-grid-2">
                        <label>
                          <span>Category</span>
                          <select
                            value={paymentEditForm.category}
                            onChange={(event) =>
                              setPaymentEditForm((prev) => ({ ...prev, category: event.target.value }))
                            }
                          >
                            {RENTAL_CATEGORIES.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Amount</span>
                          <input
                            value={paymentEditForm.amountPaid}
                            onChange={(event) =>
                              setPaymentEditForm((prev) => ({ ...prev, amountPaid: event.target.value }))
                            }
                            required
                          />
                        </label>
                      </div>
                      <div className="portal-entity-grid-2">
                        <label>
                          <span>Receipt</span>
                          <input
                            value={paymentEditForm.receiptNumber}
                            onChange={(event) =>
                              setPaymentEditForm((prev) => ({ ...prev, receiptNumber: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <label>
                          <span>Reference</span>
                          <input
                            value={paymentEditForm.transactionReference}
                            onChange={(event) =>
                              setPaymentEditForm((prev) => ({
                                ...prev,
                                transactionReference: event.target.value,
                              }))
                            }
                            required
                          />
                        </label>
                      </div>
                      <div className="portal-inline-actions">
                        <button type="submit" className="portal-primary-btn" disabled={mutating}>
                          Save
                        </button>
                        <button type="button" className="portal-ghost-btn" onClick={() => setEditingPaymentId(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </article>
    </div>
  );
}
