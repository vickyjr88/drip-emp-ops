"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import {
  emptyNextOfKinForm,
  NextOfKin,
  NextOfKinFormProps,
  normalizeNextOfKinList,
  serializeNextOfKinList,
  toNextOfKinFormList,
  totalNextOfKinOwnership,
} from '../next-of-kin';

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationalIdPassport?: string;
  kraPin?: string | null;
  nextOfKinJson?: NextOfKin | NextOfKin[] | { contacts?: NextOfKin[] } | null;
  portalEnabled?: boolean;
  portalLastLoginAt?: string | null;
  createdAt?: string;
};

type UnitOwnership = {
  id: string;
  unitId: string;
  customerId: string;
  ownershipPercentage: string | number;
  isPrimaryOwner: boolean;
};

type Unit = {
  id: string;
  unitNumber: string;
  status: string;
  floorNumber: number;
  bedrooms?: number;
};

type SalesContract = {
  id: string;
  contractNumber: string;
  unitId: string;
  primaryCustomerId: string;
  currency: string;
  totalAgreedPrice: string | number;
  contractStatus: string;
};

type Tenancy = {
  id: string;
  unitId: string;
  tenantId: string;
  leaseStart: string;
  leaseEnd?: string | null;
  status: string;
  monthlyRent: string | number;
  currency: string;
};

type CustomerDocument = {
  id: string;
  documentType: string;
  fileName: string;
  url: string;
  fileSize?: number | null;
  notes?: string | null;
  uploadedAt: string;
};

type AuthRole = {
  id: string;
  name: string;
  permissions: string[];
};

type AuthProfile = {
  id: string;
  email: string;
  role: string | null;
  roles?: AuthRole[];
  permissions?: string[];
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const TOKEN_KEY = 'de_access_token';

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

function hasPermission(profile: AuthProfile | null | undefined, permission: string): boolean {
  if (!profile) {
    return false;
  }

  if (profile.role === 'ADMIN' || profile.roles?.some((role) => role.name === 'ADMIN')) {
    return true;
  }

  return Boolean(profile.permissions?.includes(permission));
}

export default function CustomerDetailClient({ customerId }: { customerId: string }) {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ownerships, setOwnerships] = useState<UnitOwnership[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [nextOfKinForms, setNextOfKinForms] = useState<NextOfKinFormProps[]>([emptyNextOfKinForm('100')]);
  const [editingNextOfKin, setEditingNextOfKin] = useState(false);
  const [showPortalForm, setShowPortalForm] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');

  useEffect(() => {
    const savedToken = window.localStorage.getItem(TOKEN_KEY);
    setToken(savedToken);
    setInitialized(true);
  }, []);

  const loadCustomer = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);

      const [nextCustomer, nextOwnerships, nextUnits, nextContracts, nextTenancies, nextDocuments] = await Promise.all([
        apiRequest<Customer>(`/customers/${customerId}`, { method: 'GET' }, authToken),
        hasPermission(nextProfile, 'unit-ownership.read')
          ? apiRequest<UnitOwnership[]>('/unit-ownerships?take=500', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'unit.read')
          ? apiRequest<Unit[]>('/units?take=500', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'sales-contract.read')
          ? apiRequest<SalesContract[]>('/sales-contracts?take=500', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'tenancy.read')
          ? apiRequest<Tenancy[]>(`/tenancies?tenantId=${customerId}&take=200`, { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'customer-document.read')
          ? apiRequest<CustomerDocument[]>(
              `/customer-documents?customerId=${customerId}&take=200`,
              { method: 'GET' },
              authToken,
            )
          : Promise.resolve([]),
      ]);

      setProfile(nextProfile);
      setCustomer(nextCustomer);
      setOwnerships(nextOwnerships);
      setUnits(nextUnits);
      setContracts(nextContracts);
      setTenancies(nextTenancies);
      setDocuments(nextDocuments);
      setNextOfKinForms(toNextOfKinFormList(nextCustomer.nextOfKinJson));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load customer details.');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    if (!token) {
      setLoading(false);
      return;
    }

    void loadCustomer(token);
  }, [initialized, token, loadCustomer]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.location.hash === '#next-of-kin') {
      const element = document.getElementById('next-of-kin');
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [customer, loading]);

  const unitMap = useMemo(() => {
    const map = new Map<string, Unit>();
    for (const unit of units) {
      map.set(unit.id, unit);
    }
    return map;
  }, [units]);

  const matchedOwnerships = useMemo(
    () => ownerships.filter((ownership) => ownership.customerId === customerId),
    [ownerships, customerId],
  );

  const matchedContracts = useMemo(
    () => contracts.filter((contract) => contract.primaryCustomerId === customerId),
    [contracts, customerId],
  );

  const canUpdateCustomer = hasPermission(profile, 'customer.update');

  async function onSetPortalPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdateCustomer || !customer) return;

    if (portalPassword.trim().length < 8) {
      setErrorMessage('Portal password must be at least 8 characters.');
      return;
    }

    setMutating(true);
    setFeedback(null);
    setErrorMessage(null);
    try {
      const updated = await apiRequest<Customer>(
        `/customers/${customer.id}/portal-password`,
        { method: 'POST', body: JSON.stringify({ password: portalPassword }) },
        token,
      );
      setCustomer(updated);
      setPortalPassword('');
      setShowPortalForm(false);
      setFeedback(
        `Portal access is active. Share the password with ${updated.firstName} securely — it cannot be viewed again.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to set the portal password.');
    } finally {
      setMutating(false);
    }
  }

  async function onTogglePortalAccess(enabled: boolean) {
    if (!token || !canUpdateCustomer || !customer) return;

    setMutating(true);
    setFeedback(null);
    setErrorMessage(null);
    try {
      const updated = await apiRequest<Customer>(
        `/customers/${customer.id}/portal-access`,
        { method: 'PATCH', body: JSON.stringify({ enabled }) },
        token,
      );
      setCustomer(updated);
      setFeedback(enabled ? 'Portal access enabled.' : 'Portal access revoked.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to change portal access.');
    } finally {
      setMutating(false);
    }
  }

  async function onSaveNextOfKin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdateCustomer || !customer) {
      return;
    }

    const total = totalNextOfKinOwnership(nextOfKinForms.filter((entry) => entry.name.trim()));
    if (total > 100.0001) {
      setErrorMessage(`Next of kin ownership percentages total ${total.toFixed(1)}% and cannot exceed 100%.`);
      return;
    }

    setMutating(true);
    setFeedback(null);
    setErrorMessage(null);

    try {
      const nextOfKinJson = serializeNextOfKinList(nextOfKinForms);

      const updated = await apiRequest<Customer>(
        `/customers/${customer.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ nextOfKinJson }),
        },
        token,
      );

      setCustomer(updated);
      setNextOfKinForms(toNextOfKinFormList(updated.nextOfKinJson));
      setEditingNextOfKin(false);
      setFeedback('Next of kin list updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update next of kin.');
    } finally {
      setMutating(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-detail-shell">
            <p className="portal-kicker">Customer Profile</p>
            <h1>Loading customer...</h1>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-detail-shell">
            <p className="portal-kicker">Customer Profile</p>
            <h1>Authentication required</h1>
            <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
              Go to Portal Login
            </Link>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (errorMessage && !customer) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-detail-shell">
            <p className="portal-kicker">Customer Profile</p>
            <h1>Customer not available</h1>
            <p>{errorMessage}</p>
            <Link href="/portal/customers" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
              Back to Customers
            </Link>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!customer) {
    return null;
  }

  const nextOfKinList = normalizeNextOfKinList(customer.nextOfKinJson);
  const kinOwnershipTotal = totalNextOfKinOwnership(nextOfKinList);
  const roleLabel =
    profile.roles && profile.roles.length > 0
      ? profile.roles.map((role) => role.name).join(', ')
      : profile.role || 'Unassigned';
  const canReadRbac =
    hasPermission(profile, 'role.read') ||
    hasPermission(profile, 'permission.read') ||
    hasPermission(profile, 'user.read');

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="customers"
            pageTitle={`${customer.firstName} ${customer.lastName}`}
            pageSubtitle="Customer profile, next of kin, ownership, and documents"
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbac}
            onLogout={onLogout}
          >
          <div className="portal-detail-header" style={{ marginBottom: 0, paddingBottom: 0, border: 0 }}>
            <div className="portal-detail-meta">
              <span>{matchedOwnerships.length} unit{matchedOwnerships.length === 1 ? '' : 's'}</span>
              <span>{matchedContracts.length} contract{matchedContracts.length === 1 ? '' : 's'}</span>
              <span>{documents.length} document{documents.length === 1 ? '' : 's'}</span>
              <span>{nextOfKinList.length} next of kin</span>
            </div>
            <div className="portal-detail-header-actions">
              {canUpdateCustomer ? (
                <Link href={`/portal/customers/${customer.id}/edit`} className="portal-primary-btn">
                  Edit Customer
                </Link>
              ) : null}
              <Link href="/portal/customers" className="portal-ghost-btn portal-detail-back">
                Back to Customers
              </Link>
            </div>
          </div>


          <div className="portal-stack-grid">
            <div className="portal-detail-grid">
              <article className="portal-card">
                <h2>Contact & Identity</h2>
                <div className="portal-info-list">
                  <div className="portal-info-row">
                    <span>Email</span>
                    <strong>{customer.email}</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>Phone</span>
                    <strong>{customer.phone}</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>National ID / Passport</span>
                    <strong>{customer.nationalIdPassport || '—'}</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>KRA PIN</span>
                    <strong>{customer.kraPin || '—'}</strong>
                  </div>
                </div>
              </article>

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
                    <h2 style={{ margin: 0 }}>Customer Portal Access</h2>
                    <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                      Lets this customer sign in at <code>/account</code> to see their own unit, charges,
                      and payments.
                    </p>
                  </div>
                  {canUpdateCustomer ? (
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => {
                        setPortalPassword('');
                        setShowPortalForm((prev) => !prev);
                      }}
                    >
                      {showPortalForm ? 'Close' : customer.portalEnabled ? 'Reset Password' : 'Grant Access'}
                    </button>
                  ) : null}
                </div>

                <div className="portal-info-list">
                  <div className="portal-info-row">
                    <span>Status</span>
                    <strong>{customer.portalEnabled ? 'Active' : 'No access'}</strong>
                  </div>
                  <div className="portal-info-row">
                    <span>Last Sign In</span>
                    <strong>
                      {customer.portalLastLoginAt
                        ? new Date(customer.portalLastLoginAt).toLocaleString('en-GB')
                        : 'Never'}
                    </strong>
                  </div>
                </div>

                {showPortalForm && canUpdateCustomer ? (
                  <form className="portal-entity-form portal-inline-form" onSubmit={onSetPortalPassword}>
                    <label>
                      <span>New Portal Password (min 8 characters)</span>
                      <input
                        type="text"
                        autoComplete="off"
                        minLength={8}
                        value={portalPassword}
                        onChange={(event) => setPortalPassword(event.target.value)}
                        placeholder="Give this to the customer securely"
                        required
                      />
                    </label>
                    <button type="submit" className="portal-primary-btn" disabled={mutating}>
                      {mutating ? 'Saving...' : 'Set Password & Enable'}
                    </button>
                  </form>
                ) : null}

                {canUpdateCustomer && customer.portalEnabled ? (
                  <div className="portal-inline-actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="portal-inline-btn is-danger"
                      onClick={() => void onTogglePortalAccess(false)}
                      disabled={mutating}
                    >
                      Revoke Access
                    </button>
                  </div>
                ) : null}
              </article>

              <article className="portal-card" id="next-of-kin">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                  <h2 style={{ margin: 0 }}>Next of Kin</h2>
                  {canUpdateCustomer ? (
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => {
                        setNextOfKinForms(toNextOfKinFormList(customer.nextOfKinJson));
                        setEditingNextOfKin((prev) => !prev);
                      }}
                    >
                      {editingNextOfKin ? 'Close' : nextOfKinList.length ? 'Edit' : 'Add'}
                    </button>
                  ) : null}
                </div>

                <p className="portal-kin-total">
                  Allocated next-of-kin ownership share:{' '}
                  <strong>
                    {(editingNextOfKin
                      ? totalNextOfKinOwnership(nextOfKinForms.filter((entry) => entry.name.trim()))
                      : kinOwnershipTotal
                    ).toFixed(1)}
                    %
                  </strong>
                </p>

                {editingNextOfKin && canUpdateCustomer ? (
                  <form className="portal-entity-form" onSubmit={onSaveNextOfKin}>
                    {nextOfKinForms.map((entry, index) => (
                      <div key={`kin-edit-${index}`} className="portal-kin-card">
                        <div className="portal-card-header-row">
                          <strong>Next of kin {index + 1}</strong>
                          {nextOfKinForms.length > 1 ? (
                            <button
                              type="button"
                              className="portal-inline-btn is-danger"
                              onClick={() =>
                                setNextOfKinForms((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                              }
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                        <div className="portal-entity-grid-2">
                          <label>
                            <span>Name</span>
                            <input
                              value={entry.name}
                              onChange={(event) =>
                                setNextOfKinForms((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, name: event.target.value } : item,
                                  ),
                                )
                              }
                              required={index === 0 || Boolean(entry.name || entry.phone || entry.email)}
                            />
                          </label>
                          <label>
                            <span>Ownership %</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={entry.ownershipPercentage}
                              onChange={(event) =>
                                setNextOfKinForms((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, ownershipPercentage: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                        <div className="portal-entity-grid-3">
                          <label>
                            <span>Relationship</span>
                            <input
                              value={entry.relationship}
                              onChange={(event) =>
                                setNextOfKinForms((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, relationship: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>Phone</span>
                            <input
                              value={entry.phone}
                              onChange={(event) =>
                                setNextOfKinForms((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, phone: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            <span>Email</span>
                            <input
                              type="email"
                              value={entry.email}
                              onChange={(event) =>
                                setNextOfKinForms((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, email: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                    <div className="portal-inline-actions">
                      <button
                        type="button"
                        className="portal-inline-btn"
                        onClick={() => setNextOfKinForms((prev) => [...prev, emptyNextOfKinForm('0')])}
                      >
                        Add Next of Kin
                      </button>
                      <button type="submit" className="portal-primary-btn" disabled={mutating}>
                        {mutating ? 'Saving...' : 'Save Next of Kin'}
                      </button>
                      <button type="button" className="portal-ghost-btn" onClick={() => setEditingNextOfKin(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : nextOfKinList.length > 0 ? (
                  <div className="portal-list-stack">
                    {nextOfKinList.map((entry, index) => (
                      <div key={`${entry.name}-${index}`} className="portal-kin-card">
                        <div className="portal-kin-card-header">
                          <div>
                            <strong>{entry.name}</strong>
                            <p>{entry.relationship || 'Relationship not set'}</p>
                          </div>
                          <span className="portal-kin-badge">
                            {Number(entry.ownershipPercentage || 0).toFixed(1)}% ownership
                          </span>
                        </div>
                        <div className="portal-kin-meta">
                          <div>
                            <span>Phone</span>
                            <p>{entry.phone || '—'}</p>
                          </div>
                          <div>
                            <span>Email</span>
                            <p>{entry.email || '—'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="portal-empty-state">No next of kin recorded for this customer.</div>
                )}
              </article>
            </div>

            <div className="portal-section-grid">
              <article className="portal-card">
                <h2>Owned Units</h2>
                <div className="portal-list-stack">
                  {matchedOwnerships.length === 0 ? (
                    <div className="portal-empty-state">This customer is not linked to any units.</div>
                  ) : (
                    matchedOwnerships.map((ownership) => {
                      const unit = unitMap.get(ownership.unitId);
                      return (
                        <div key={ownership.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>
                                {unit ? (
                                  <Link href={`/portal/units/${unit.id}`}>{unit.unitNumber}</Link>
                                ) : (
                                  ownership.unitId
                                )}
                              </strong>
                              <p>
                                {unit ? `${unit.status} • Floor ${unit.floorNumber}` : 'Unit record'}
                                {unit?.bedrooms != null ? ` • ${unit.bedrooms} bed` : ''}
                              </p>
                            </div>
                            <span>{ownership.isPrimaryOwner ? 'PRIMARY' : 'CO-OWNER'}</span>
                            <span>{Number(ownership.ownershipPercentage).toFixed(1)}%</span>
                          </div>
                          {unit ? (
                            <div className="portal-action-row">
                              <Link href={`/portal/units/${unit.id}`} className="portal-inline-btn">
                                Open Unit
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </article>

              <article className="portal-card">
                <h2>Sales Contracts</h2>
                <div className="portal-list-stack">
                  {matchedContracts.length === 0 ? (
                    <div className="portal-empty-state">No contracts where this customer is the primary buyer.</div>
                  ) : (
                    matchedContracts.map((contract) => {
                      const unit = unitMap.get(contract.unitId);
                      return (
                        <div key={contract.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>{contract.contractNumber}</strong>
                              <p>
                                Unit:{' '}
                                {unit ? (
                                  <Link href={`/portal/units/${unit.id}`}>{unit.unitNumber}</Link>
                                ) : (
                                  contract.unitId
                                )}
                              </p>
                            </div>
                            <span>{contract.contractStatus}</span>
                            <span>
                              {contract.currency} {Number(contract.totalAgreedPrice).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </article>
            </div>

            <article className="portal-card">
              <div className="portal-card-header-row">
                <h2 style={{ margin: 0 }}>Documents</h2>
                {canUpdateCustomer ? (
                  <Link href={`/portal/customers/${customer.id}/edit`} className="portal-inline-btn">
                    Manage Documents
                  </Link>
                ) : null}
              </div>
              <div className="portal-list-stack">
                {documents.length === 0 ? (
                  <div className="portal-empty-state">No documents attached for this customer.</div>
                ) : (
                  documents.map((doc) => (
                    <div key={doc.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>
                            <a href={doc.url} target="_blank" rel="noreferrer">
                              {doc.fileName}
                            </a>
                          </strong>
                          <p>
                            Uploaded {new Date(doc.uploadedAt).toLocaleDateString('en-GB')}
                            {doc.notes ? ` • ${doc.notes}` : ''}
                          </p>
                        </div>
                        <span>{doc.documentType.replaceAll('_', ' ')}</span>
                        <span>
                          <a href={doc.url} target="_blank" rel="noreferrer" className="portal-inline-btn">
                            Open
                          </a>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="portal-card">
              <h2>Tenancies (as Tenant)</h2>
              <div className="portal-list-stack">
                {tenancies.length === 0 ? (
                  <div className="portal-empty-state">This customer has no rental tenancies.</div>
                ) : (
                  tenancies.map((tenancy) => {
                    const unit = unitMap.get(tenancy.unitId);
                    return (
                      <div key={tenancy.id} className="portal-record">
                        <div className="portal-list-row">
                          <div>
                            <strong>
                              {unit ? (
                                <Link href={`/portal/units/${unit.id}`}>{unit.unitNumber}</Link>
                              ) : (
                                tenancy.unitId
                              )}
                            </strong>
                            <p>
                              {new Date(tenancy.leaseStart).toLocaleDateString('en-GB')} →{' '}
                              {tenancy.leaseEnd
                                ? new Date(tenancy.leaseEnd).toLocaleDateString('en-GB')
                                : 'Open'}{' '}
                              • {tenancy.currency} {Number(tenancy.monthlyRent).toLocaleString()}/mo
                            </p>
                          </div>
                          <span>{tenancy.status}</span>
                          <span>{tenancy.currency}</span>
                        </div>
                        {unit ? (
                          <div className="portal-action-row">
                            <Link href={`/portal/units/${unit.id}`} className="portal-inline-btn">
                              Open Unit
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </article>
          </div>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
