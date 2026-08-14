"use client";

import Link from 'next/link';
import { useErrorState } from '../../../components/notifications';
import { PrintReportButton } from '../../../components/print-report';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../../../components/elite-layout';
import { PortalShell } from '../../../components/portal-shell';

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

type Unit = {
  id: string;
  blockId: string;
  unitNumber: string;
  floorNumber: number;
  sizeSqm: string | number;
  priceKes: string | number;
  priceUsd: string | number;
  status: string;
  bedrooms?: number;
};

type ProjectBlock = {
  id: string;
  projectId: string;
  blockName: string;
  totalFloors: number;
  units?: Unit[];
};

type Project = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  blocks?: ProjectBlock[];
};

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type UnitOwnership = {
  id: string;
  unitId: string;
  customerId: string;
  ownershipPercentage: string | number;
  isPrimaryOwner: boolean;
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

type CustomerPayment = {
  id: string;
  contractId: string;
  amountPaid: string | number;
  currency: string;
  paymentDate: string;
};

type Tenancy = {
  id: string;
  unitId: string;
  tenantId: string;
  status: string;
  monthlyRent: string | number;
  currency: string;
  leaseStart: string;
  leaseEnd?: string | null;
};

type RentalPayment = {
  id: string;
  tenancyId: string;
  category: string;
  amountPaid: string | number;
  currency: string;
  paymentDate: string;
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
    throw new Error((await response.text()) || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function hasPermission(profile: AuthProfile | null | undefined, permission: string) {
  if (!profile) return false;
  if (profile.role === 'ADMIN' || profile.roles?.some((role) => role.name === 'ADMIN')) return true;
  return Boolean(profile.permissions?.includes(permission));
}

function formatMoney(value: string | number, currency = 'KES') {
  const amount = Number(value || 0);
  if (Number.isNaN(amount)) return `${currency} 0.00`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function customerName(customer?: Customer | null) {
  if (!customer) return '—';
  return `${customer.firstName} ${customer.lastName}`;
}

function monthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProjectProgressClient({ projectId }: { projectId: string }) {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [ownerships, setOwnerships] = useState<UnitOwnership[]>([]);
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [rentalPayments, setRentalPayments] = useState<RentalPayment[]>([]);
  const [rentalFrom, setRentalFrom] = useState(monthStartIso);
  const [rentalTo, setRentalTo] = useState(todayIso);
  const [activeSection, setActiveSection] = useState<'sales' | 'rental'>('sales');

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);

      const [nextProject, nextCustomers, nextOwnerships, nextContracts, nextPayments, nextTenancies, nextRentalPayments] =
        await Promise.all([
          apiRequest<Project>(`/projects/${projectId}?include=blocks,blocks.units`, { method: 'GET' }, authToken),
          hasPermission(nextProfile, 'customer.read')
            ? apiRequest<Customer[]>('/customers?take=500', { method: 'GET' }, authToken)
            : Promise.resolve([]),
          hasPermission(nextProfile, 'unit-ownership.read')
            ? apiRequest<UnitOwnership[]>('/unit-ownerships?take=500', { method: 'GET' }, authToken)
            : Promise.resolve([]),
          hasPermission(nextProfile, 'sales-contract.read')
            ? apiRequest<SalesContract[]>('/sales-contracts?take=500', { method: 'GET' }, authToken)
            : Promise.resolve([]),
          hasPermission(nextProfile, 'customer-payment.read')
            ? apiRequest<CustomerPayment[]>('/customer-payments?take=500', { method: 'GET' }, authToken)
            : Promise.resolve([]),
          hasPermission(nextProfile, 'tenancy.read')
            ? apiRequest<Tenancy[]>('/tenancies?take=500', { method: 'GET' }, authToken)
            : Promise.resolve([]),
          hasPermission(nextProfile, 'rental-payment.read')
            ? apiRequest<RentalPayment[]>('/rental-payments?take=500', { method: 'GET' }, authToken)
            : Promise.resolve([]),
        ]);

      setProfile(nextProfile);
      setProject(nextProject);
      setCustomers(nextCustomers);
      setOwnerships(nextOwnerships);
      setContracts(nextContracts);
      setPayments(nextPayments);
      setTenancies(nextTenancies);
      setRentalPayments(nextRentalPayments);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load project progress.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

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

  const projectUnits = useMemo(() => {
    const units: Array<Unit & { blockName: string }> = [];
    for (const block of project?.blocks || []) {
      for (const unit of block.units || []) {
        units.push({ ...unit, blockName: block.blockName });
      }
    }
    return units.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));
  }, [project]);

  const projectUnitIds = useMemo(() => new Set(projectUnits.map((unit) => unit.id)), [projectUnits]);

  const paymentsByContract = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of payments) {
      map.set(payment.contractId, (map.get(payment.contractId) || 0) + Number(payment.amountPaid || 0));
    }
    return map;
  }, [payments]);

  const salesRows = useMemo(() => {
    return projectUnits.map((unit) => {
      const unitContracts = contracts.filter((contract) => contract.unitId === unit.id);
      const primaryContract =
        unitContracts.find((contract) => contract.contractStatus === 'ACTIVE') || unitContracts[0] || null;
      const primaryOwnership =
        ownerships.find((item) => item.unitId === unit.id && item.isPrimaryOwner) ||
        ownerships.find((item) => item.unitId === unit.id) ||
        null;

      const buyerId = primaryContract?.primaryCustomerId || primaryOwnership?.customerId || null;
      const buyer = buyerId ? customerMap.get(buyerId) : null;
      const agreed = primaryContract ? Number(primaryContract.totalAgreedPrice || 0) : Number(unit.priceKes || 0);
      const paid = primaryContract ? paymentsByContract.get(primaryContract.id) || 0 : 0;
      const percent = agreed > 0 ? Math.min((paid / agreed) * 100, 100) : paid > 0 ? 100 : 0;
      const balance = Math.max(agreed - paid, 0);

      return {
        unit,
        buyer,
        contract: primaryContract,
        ownership: primaryOwnership,
        agreed,
        paid,
        balance,
        percent,
        currency: primaryContract?.currency || 'KES',
      };
    });
  }, [projectUnits, contracts, ownerships, customerMap, paymentsByContract]);

  const salesSummary = useMemo(() => {
    const totalUnits = salesRows.length;
    const soldOrReserved = salesRows.filter((row) =>
      ['SOLD', 'RESERVED', 'RENTED'].includes(row.unit.status) || Boolean(row.contract || row.ownership),
    ).length;
    const withBuyer = salesRows.filter((row) => row.buyer).length;
    const totalAgreed = salesRows.reduce((sum, row) => sum + row.agreed, 0);
    const totalPaid = salesRows.reduce((sum, row) => sum + row.paid, 0);
    const totalBalance = Math.max(totalAgreed - totalPaid, 0);
    const avgPaidPercent = totalAgreed > 0 ? (totalPaid / totalAgreed) * 100 : 0;
    const fullyPaid = salesRows.filter((row) => row.agreed > 0 && row.percent >= 99.9).length;

    return {
      totalUnits,
      soldOrReserved,
      withBuyer,
      totalAgreed,
      totalPaid,
      totalBalance,
      avgPaidPercent,
      fullyPaid,
      inventoryValue: projectUnits.reduce((sum, unit) => sum + Number(unit.priceKes || 0), 0),
    };
  }, [salesRows, projectUnits]);

  const rentalRows = useMemo(() => {
    const from = new Date(rentalFrom);
    const to = new Date(rentalTo);
    to.setHours(23, 59, 59, 999);

    return projectUnits.map((unit) => {
      const unitTenancies = tenancies.filter((tenancy) => tenancy.unitId === unit.id);
      const activeTenancy =
        unitTenancies.find((tenancy) => tenancy.status === 'ACTIVE') || unitTenancies[0] || null;
      const tenant = activeTenancy ? customerMap.get(activeTenancy.tenantId) : null;
      const tenancyIds = new Set(unitTenancies.map((tenancy) => tenancy.id));

      const periodPayments = rentalPayments.filter((payment) => {
        if (!tenancyIds.has(payment.tenancyId)) return false;
        const date = new Date(payment.paymentDate);
        return date >= from && date <= to;
      });

      const rentCollected = periodPayments
        .filter((payment) => payment.category === 'RENT')
        .reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
      const utilitiesCollected = periodPayments
        .filter((payment) => payment.category !== 'RENT')
        .reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
      const totalCollected = rentCollected + utilitiesCollected;
      const byCategory = periodPayments.reduce<Record<string, number>>((acc, payment) => {
        acc[payment.category] = (acc[payment.category] || 0) + Number(payment.amountPaid || 0);
        return acc;
      }, {});

      return {
        unit,
        tenancy: activeTenancy,
        tenant,
        rentCollected,
        utilitiesCollected,
        totalCollected,
        paymentCount: periodPayments.length,
        byCategory,
        currency: activeTenancy?.currency || periodPayments[0]?.currency || 'KES',
      };
    });
  }, [projectUnits, tenancies, rentalPayments, customerMap, rentalFrom, rentalTo]);

  const rentalSummary = useMemo(() => {
    const occupied = rentalRows.filter((row) => row.tenancy?.status === 'ACTIVE').length;
    const rent = rentalRows.reduce((sum, row) => sum + row.rentCollected, 0);
    const utilities = rentalRows.reduce((sum, row) => sum + row.utilitiesCollected, 0);
    const total = rent + utilities;
    const monthlyRentRoll = rentalRows
      .filter((row) => row.tenancy?.status === 'ACTIVE')
      .reduce((sum, row) => sum + Number(row.tenancy?.monthlyRent || 0), 0);

    const byCategory = rentalRows.reduce<Record<string, number>>((acc, row) => {
      for (const [category, amount] of Object.entries(row.byCategory)) {
        acc[category] = (acc[category] || 0) + amount;
      }
      return acc;
    }, {});

    return {
      occupied,
      vacant: Math.max(rentalRows.length - occupied, 0),
      rent,
      utilities,
      total,
      monthlyRentRoll,
      byCategory,
    };
  }, [rentalRows]);

  const roleLabel = useMemo(() => {
    if (!profile) return 'Unassigned';
    if (profile.roles?.length) return profile.roles.map((role) => role.name).join(', ');
    return profile.role || 'Unassigned';
  }, [profile]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading project progress...</article>
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

  if (errorMessage || !project) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main is-authenticated">
          <section className="lp-container portal-auth-section">
            <PortalShell
              active="projects"
              pageTitle="Project Progress"
              email={profile.email}
              roleLabel={roleLabel}
              permissionCount={profile.permissions?.length || 0}
              canReadRbac={hasPermission(profile, 'role.read')}
              onLogout={onLogout}
            >
              <article className="portal-card portal-error-panel">
                {errorMessage || 'Project not found.'}
              </article>
              <Link href="/portal/projects" className="portal-ghost-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                Back to Projects
              </Link>
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
            active="projects"
            pageTitle={`${project.name} Progress`}
            pageSubtitle={`${project.code}${project.location ? ` • ${project.location}` : ''} — sales completion and rental income by unit`}
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={
              hasPermission(profile, 'role.read') ||
              hasPermission(profile, 'permission.read') ||
              hasPermission(profile, 'user.read')
            }
            onLogout={onLogout}
          >
            <div className="portal-detail-header" style={{ marginBottom: 0, paddingBottom: 0, border: 0 }}>
              <div className="portal-detail-meta">
                <span>{salesSummary.totalUnits} units</span>
                <span>{salesSummary.withBuyer} with buyers</span>
                <span>{rentalSummary.occupied} rented</span>
              </div>
              <div className="portal-detail-header-actions">
                <Link href={`/portal/projects/${project.id}`} className="portal-ghost-btn">
                  Back to Project
                </Link>
              </div>
            </div>

            <article className="portal-card">
              <div className="portal-card-header-row no-print">
                <PrintReportButton documentTitle="Project Progress Report" />
              </div>
              <h2>Aggregate Summary</h2>
              <div className="portal-payment-summary-grid portal-progress-summary-grid">
                <div>
                  <span>Inventory Value</span>
                  <strong>{formatMoney(salesSummary.inventoryValue)}</strong>
                </div>
                <div>
                  <span>Sales Agreed</span>
                  <strong>{formatMoney(salesSummary.totalAgreed)}</strong>
                </div>
                <div>
                  <span>Sales Collected</span>
                  <strong>{formatMoney(salesSummary.totalPaid)}</strong>
                </div>
                <div>
                  <span>Sales Balance</span>
                  <strong>{formatMoney(salesSummary.totalBalance)}</strong>
                </div>
                <div>
                  <span>Avg Payment Progress</span>
                  <strong>{salesSummary.avgPaidPercent.toFixed(1)}%</strong>
                </div>
                <div>
                  <span>Fully Paid Units</span>
                  <strong>
                    {salesSummary.fullyPaid}/{salesSummary.totalUnits}
                  </strong>
                </div>
                <div>
                  <span>Rental (Period)</span>
                  <strong>{formatMoney(rentalSummary.total)}</strong>
                </div>
                <div>
                  <span>Active Rent Roll / mo</span>
                  <strong>{formatMoney(rentalSummary.monthlyRentRoll)}</strong>
                </div>
              </div>
              <div className="portal-progress-track" aria-hidden>
                <div
                  className="portal-progress-fill"
                  style={{ width: `${Math.min(salesSummary.avgPaidPercent, 100)}%` }}
                />
              </div>
              <p className="portal-muted" style={{ marginTop: 12 }}>
                Sales progress is based on contract payments vs agreed price. Rental period totals use{' '}
                {rentalFrom} → {rentalTo}.
              </p>
            </article>

            <div className="portal-progress-tabs" role="tablist" aria-label="Progress views">
              <button
                type="button"
                className={activeSection === 'sales' ? 'is-active' : ''}
                onClick={() => setActiveSection('sales')}
              >
                Sale Progress & Buyers
              </button>
              <button
                type="button"
                className={activeSection === 'rental' ? 'is-active' : ''}
                onClick={() => setActiveSection('rental')}
              >
                Rental Income
              </button>
            </div>

            {activeSection === 'sales' ? (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Sale Progress by Unit</h2>
                    <p className="portal-muted">
                      Buyer, agreed price, collected amount, and payment percentage for each unit.
                    </p>
                  </div>
                </div>

                <div className="portal-table-wrap">
                  <table className="portal-data-table">
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Status</th>
                        <th>Buyer</th>
                        <th>Contract</th>
                        <th>Agreed</th>
                        <th>Paid</th>
                        <th>Balance</th>
                        <th>Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesRows.length === 0 ? (
                        <tr>
                          <td colSpan={8}>No units in this project.</td>
                        </tr>
                      ) : (
                        salesRows.map((row) => (
                          <tr key={row.unit.id}>
                            <td>
                              <Link href={`/portal/units/${row.unit.id}`}>
                                <strong>{row.unit.unitNumber}</strong>
                              </Link>
                              <div className="portal-table-sub">Block {row.unit.blockName} • Fl {row.unit.floorNumber}</div>
                            </td>
                            <td>{row.unit.status}</td>
                            <td>
                              {row.buyer ? (
                                <Link href={`/portal/customers/${row.buyer.id}`}>{customerName(row.buyer)}</Link>
                              ) : (
                                '—'
                              )}
                              {row.ownership ? (
                                <div className="portal-table-sub">
                                  {Number(row.ownership.ownershipPercentage).toFixed(0)}% ownership
                                </div>
                              ) : null}
                            </td>
                            <td>{row.contract?.contractNumber || '—'}</td>
                            <td>{formatMoney(row.agreed, row.currency)}</td>
                            <td>{formatMoney(row.paid, row.currency)}</td>
                            <td>{formatMoney(row.balance, row.currency)}</td>
                            <td>
                              <div className="portal-mini-progress">
                                <div className="portal-progress-track">
                                  <div className="portal-progress-fill" style={{ width: `${row.percent}%` }} />
                                </div>
                                <span>{row.percent.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            ) : (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Rental Income by Unit</h2>
                    <p className="portal-muted">Rent and utility collections in the selected period.</p>
                  </div>
                </div>

                <div className="portal-rental-toolbar">
                  <div className="portal-rental-dates">
                    <label>
                      <span>From</span>
                      <input type="date" value={rentalFrom} onChange={(event) => setRentalFrom(event.target.value)} />
                    </label>
                    <label>
                      <span>To</span>
                      <input type="date" value={rentalTo} onChange={(event) => setRentalTo(event.target.value)} />
                    </label>
                  </div>
                  <div className="portal-rental-period-stats">
                    <div>
                      <span>Rent</span>
                      <strong>{formatMoney(rentalSummary.rent)}</strong>
                    </div>
                    <div>
                      <span>Utilities</span>
                      <strong>{formatMoney(rentalSummary.utilities)}</strong>
                    </div>
                    <div>
                      <span>Occupied</span>
                      <strong>
                        {rentalSummary.occupied}/{rentalRows.length}
                      </strong>
                    </div>
                  </div>
                </div>

                {Object.keys(rentalSummary.byCategory).length > 0 ? (
                  <div className="portal-detail-tags" style={{ marginTop: 12, marginBottom: 8 }}>
                    {Object.entries(rentalSummary.byCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([category, amount]) => (
                        <span key={category}>
                          {category.replaceAll('_', ' ')}: {formatMoney(amount)}
                        </span>
                      ))}
                  </div>
                ) : null}

                <div className="portal-table-wrap">
                  <table className="portal-data-table">
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Tenant</th>
                        <th>Lease</th>
                        <th>Monthly Rent</th>
                        <th>Rent Collected</th>
                        <th>Utilities</th>
                        <th>Total Period</th>
                        <th>Txns</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rentalRows.length === 0 ? (
                        <tr>
                          <td colSpan={8}>No units in this project.</td>
                        </tr>
                      ) : (
                        rentalRows.map((row) => (
                          <tr key={row.unit.id}>
                            <td>
                              <Link href={`/portal/units/${row.unit.id}`}>
                                <strong>{row.unit.unitNumber}</strong>
                              </Link>
                              <div className="portal-table-sub">Block {row.unit.blockName}</div>
                            </td>
                            <td>
                              {row.tenant ? (
                                <Link href={`/portal/customers/${row.tenant.id}`}>{customerName(row.tenant)}</Link>
                              ) : (
                                'Vacant'
                              )}
                              <div className="portal-table-sub">{row.tenancy?.status || 'No tenancy'}</div>
                            </td>
                            <td>
                              {row.tenancy
                                ? `${new Date(row.tenancy.leaseStart).toLocaleDateString('en-GB')}${
                                    row.tenancy.leaseEnd
                                      ? ` → ${new Date(row.tenancy.leaseEnd).toLocaleDateString('en-GB')}`
                                      : ' → open'
                                  }`
                                : '—'}
                            </td>
                            <td>
                              {row.tenancy ? formatMoney(row.tenancy.monthlyRent, row.currency) : '—'}
                            </td>
                            <td>{formatMoney(row.rentCollected, row.currency)}</td>
                            <td>{formatMoney(row.utilitiesCollected, row.currency)}</td>
                            <td>
                              <strong>{formatMoney(row.totalCollected, row.currency)}</strong>
                            </td>
                            <td>{row.paymentCount}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
