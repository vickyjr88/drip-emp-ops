"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { ListExport } from '../components/list-export';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { TourLauncher } from '../tours/tour-launcher';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { usePortalDialog } from '../components/portal-dialog';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  formatDate,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../accounting/lib';

type Project = { id: string; code: string; name: string };

type Employee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  projectId?: string | null;
  contractType: 'PERMANENT' | 'FIXED_TERM' | 'CASUAL' | 'INTERN';
  payType: 'MONTHLY' | 'DAILY';
  payRate: string | number;
  currency: string;
  startDate: string;
  endDate?: string | null;
  status: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED';
  nationalId?: string | null;
  kraPin?: string | null;
  nssfNumber?: string | null;
  shifNumber?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  notes?: string | null;
};

type LeaveType = {
  id: string;
  name: string;
  code: string;
  annualDays: string | number;
  carriesOver: boolean;
  isPaid: boolean;
  isActive: boolean;
};

type LeaveBalance = {
  id: string;
  year: number;
  entitledDays: string | number;
  broughtForward: string | number;
  takenDays: string | number;
  adjustmentDays: string | number;
  adjustmentNote?: string | null;
  available: number;
  leaveType: LeaveType;
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string };
};

type LeaveRequest = {
  id: string;
  startDate: string;
  endDate: string;
  days: string | number;
  reason?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewedBy?: string | null;
  reviewNote?: string | null;
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string; department?: string | null };
  leaveType: { id: string; name: string; code: string; isPaid: boolean };
};

type Stats = {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  byPayType: Array<{ payType: string; count: number }>;
  monthlySalaryCost: number;
};

type HrTab = 'employees' | 'leave' | 'balances';

const CONTRACT_TYPES = ['PERMANENT', 'FIXED_TERM', 'CASUAL', 'INTERN'];
const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'];

function emptyEmployeeForm() {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    nationalId: '',
    kraPin: '',
    nssfNumber: '',
    shifNumber: '',
    jobTitle: '',
    department: '',
    projectId: '',
    contractType: 'PERMANENT',
    payType: 'MONTHLY',
    payRate: '',
    bankName: '',
    bankAccountNumber: '',
    startDate: '',
    status: 'ACTIVE',
    notes: '',
  };
}

export default function HrPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [tab, setTab] = useState<HrTab>('employees');

  const [activeEmployees, setActiveEmployees] = useState<Employee[]>([]);
  const [employeeExportRows, setEmployeeExportRows] = useState<Employee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [year, setYear] = useState(new Date().getUTCFullYear());

  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm());

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState({
    employeeId: '',
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    reason: '',
  });

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

        const [nextActiveEmployees, nextTypes, nextRequests, nextBalances, nextProjects, nextStats] =
          await Promise.all([
            hasPermission(nextProfile, 'employee.read')
              ? apiRequest<ServerPage<Employee>>('/employees?take=500&status=ACTIVE', { method: 'GET' }, authToken).then(
                  (page) => page.items,
                )
              : Promise.resolve([]),
            hasPermission(nextProfile, 'leave-type.read')
              ? apiRequest<LeaveType[]>('/leave-types', { method: 'GET' }, authToken)
              : Promise.resolve([]),
            hasPermission(nextProfile, 'leave-request.read')
              ? apiRequest<LeaveRequest[]>('/leave-requests', { method: 'GET' }, authToken)
              : Promise.resolve([]),
            hasPermission(nextProfile, 'leave-balance.read')
              ? apiRequest<LeaveBalance[]>(`/leave-balances?year=${year}`, { method: 'GET' }, authToken)
              : Promise.resolve([]),
            hasPermission(nextProfile, 'project.read')
              ? apiRequest<Project[]>('/projects', { method: 'GET' }, authToken)
              : Promise.resolve([]),
            hasPermission(nextProfile, 'employee.read')
              ? apiRequest<Stats>('/employees/stats', { method: 'GET' }, authToken)
              : Promise.resolve(null),
          ]);

        setActiveEmployees(nextActiveEmployees);
        setLeaveTypes(nextTypes);
        setRequests(nextRequests);
        setBalances(nextBalances);
        setProjects(nextProjects);
        setStats(nextStats);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load staff records.');
      } finally {
        setLoading(false);
      }
    },
    [year],
  );

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const fetchEmployeesPage = useCallback(
    async (
      params: { skip: number; take: number; search: string } & { status: string },
    ): Promise<ServerPage<Employee>> => {
      if (!token || !profile || !hasPermission(profile, 'employee.read')) {
        return { items: [], total: 0, skip: params.skip, take: params.take };
      }
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      if (params.status) query.set('status', params.status);
      return apiRequest<ServerPage<Employee>>(`/employees?${query}`, { method: 'GET' }, token);
    },
    [token, profile],
  );

  const employeesPager = useServerPager<Employee, { status: string }>({
    fetchPage: (params) => fetchEmployeesPage(params),
    filters: { status: statusFilter },
    enabled: Boolean(token && profile && tab === 'employees'),
  });

  useEffect(() => {
    if (!token || !profile || !hasPermission(profile, 'employee.read')) return;
    const timer = setTimeout(() => {
      void fetchEmployeesPage({ skip: 0, take: 500, search: employeesPager.search, status: statusFilter }).then(
        (page) => setEmployeeExportRows(page.items),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [fetchEmployeesPage, employeesPager.search, statusFilter, token, profile]);

  const canReadEmployees = hasPermission(profile, 'employee.read');
  const canManageEmployees = hasPermission(profile, 'employee.create');
  const canRequestLeave = hasPermission(profile, 'leave-request.create');
  const canReviewLeave = hasPermission(profile, 'leave-request.update');
  const canOpenBalances = hasPermission(profile, 'leave-balance.create');
  const roleLabel = useMemo(() => roleLabelFor(profile), [profile]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'PENDING'),
    [requests],
  );

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  async function runMutation(action: () => Promise<void>, message: string) {
    if (!token) return;
    setMutating(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      await action();
      setFeedback(message);
      await load(token);
      employeesPager.reload();
    } catch (error) {
      const raw = error instanceof Error ? error.message : '';
      let text = raw || 'Operation failed.';
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.message) text = Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message;
      } catch {
        // Not JSON; keep the raw text.
      }
      setErrorMessage(text);
    } finally {
      setMutating(false);
    }
  }

  async function onSaveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const payload: Record<string, unknown> = {
      ...employeeForm,
      payRate: Number(employeeForm.payRate || 0),
      projectId: employeeForm.projectId || null,
    };
    for (const key of Object.keys(payload)) {
      if (payload[key] === '') delete payload[key];
    }

    await runMutation(async () => {
      if (editingId) {
        await apiRequest(`/employees/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
      } else {
        await apiRequest('/employees', { method: 'POST', body: JSON.stringify(payload) }, token);
      }
      setShowEmployeeForm(false);
      setEditingId(null);
      setEmployeeForm(emptyEmployeeForm());
    }, editingId ? 'Employee updated.' : 'Employee added.');
  }

  async function onOpenBalances() {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: `Open ${year} leave balances`,
      message:
        'This creates balances for every active employee and leave type, pro-rated for anyone who joined mid-year. Existing balances are left untouched.',
      confirmLabel: 'Open balances',
    });
    if (!confirmed) return;

    await runMutation(async () => {
      const result = await apiRequest<{ balancesCreated: number }>(
        '/leave-balances/open',
        { method: 'POST', body: JSON.stringify({ year }) },
        token,
      );
      setFeedback(`${result.balancesCreated} balances opened for ${year}.`);
    }, `Balances opened for ${year}.`);
  }

  async function onCreateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    await runMutation(async () => {
      await apiRequest('/leave-requests', { method: 'POST', body: JSON.stringify(requestForm) }, token);
      setShowRequestForm(false);
      setRequestForm({ employeeId: '', leaveTypeId: '', startDate: '', endDate: '', reason: '' });
    }, 'Leave requested.');
  }

  async function onReview(request: LeaveRequest, status: 'APPROVED' | 'REJECTED') {
    if (!token) return;
    if (status === 'APPROVED') {
      const confirmed = await dialog.confirm({
        title: 'Approve leave',
        message: `This deducts ${request.days} days from ${request.employee.firstName}'s ${request.leaveType.name} balance.`,
        confirmLabel: 'Approve',
      });
      if (!confirmed) return;
    }
    await runMutation(async () => {
      await apiRequest(
        `/leave-requests/${request.id}/review`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
        token,
      );
    }, status === 'APPROVED' ? 'Leave approved.' : 'Leave rejected.');
  }

  async function onCancelRequest(request: LeaveRequest) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Cancel leave',
      message:
        request.status === 'APPROVED'
          ? `This returns ${request.days} days to ${request.employee.firstName}'s balance.`
          : 'This withdraws the request.',
      confirmLabel: 'Cancel leave',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/leave-requests/${request.id}/cancel`, { method: 'PATCH' }, token);
    }, 'Leave cancelled.');
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-auth-section" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading staff records...</article>
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
              <a href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                Go to Portal Login
              </a>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  const active = stats?.byStatus.find((row) => row.status === 'ACTIVE')?.count || 0;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="hr"
            pageSubtitle="Staff records, leave entitlement and approvals."
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={hasPermission(profile, 'role.read')}
            onLogout={onLogout}
            onRefresh={() => token && void load(token)}
          >

            {!canReadEmployees ? (
              <article className="portal-card portal-role-banner">
                You do not have permission to view staff records.
              </article>
            ) : (
              <>
                <div className="portal-stats-grid">
                  <article className="portal-card portal-stat-card">
                    <span>Active Staff</span>
                    <strong>{active}</strong>
                  </article>
                  <article className="portal-card portal-stat-card">
                    <span>Total on Record</span>
                    <strong>{stats?.total ?? 0}</strong>
                  </article>
                  <article className="portal-card portal-stat-card">
                    <span>Monthly Salary Cost</span>
                    <strong>{formatMoney(stats?.monthlySalaryCost ?? 0)}</strong>
                  </article>
                  <article className="portal-card portal-stat-card">
                    <span>Leave Awaiting Approval</span>
                    <strong>{pendingRequests.length}</strong>
                  </article>
                </div>

                <div className="portal-action-row" style={{ justifyContent: 'flex-start' }}>
                  {(['employees', 'leave', 'balances'] as HrTab[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`portal-inline-btn${tab === key ? ' is-active' : ''}`}
                      onClick={() => setTab(key)}
                    >
                      {key === 'employees' ? 'Employees' : key === 'leave' ? 'Leave Requests' : 'Leave Balances'}
                    </button>
                  ))}
                </div>

                {tab === 'employees' ? (
                  <article className="portal-card" data-tour="hr.employees">
                    <div className="portal-card-header-row">
                      <h2 style={{ margin: 0 }}>Employees</h2><TourLauncher tour="staff-and-leave" />
                      {canManageEmployees ? (
                        <button
                          type="button"
                          className="portal-inline-btn"
                          onClick={() => {
                            setEditingId(null);
                            setEmployeeForm(emptyEmployeeForm());
                            setShowEmployeeForm((prev) => !prev);
                          }}
                        >
                          {showEmployeeForm ? 'Close' : 'Add Employee'}
                        </button>
                      ) : null}
                    </div>

                    {showEmployeeForm && canManageEmployees ? (
                      <form className="portal-entity-form portal-detail-form" onSubmit={onSaveEmployee}>
                        <div className="portal-entity-grid-2">
                          <label>
                            <span>First Name</span>
                            <input
                              value={employeeForm.firstName}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, firstName: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <label>
                            <span>Last Name</span>
                            <input
                              value={employeeForm.lastName}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, lastName: event.target.value }))
                              }
                              required
                            />
                          </label>
                        </div>
                        <div className="portal-entity-grid-3">
                          <label>
                            <span>Job Title</span>
                            <input
                              value={employeeForm.jobTitle}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, jobTitle: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Department</span>
                            <input
                              value={employeeForm.department}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, department: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Start Date</span>
                            <input
                              type="date"
                              value={employeeForm.startDate}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, startDate: event.target.value }))
                              }
                              required
                            />
                          </label>
                        </div>
                        <div className="portal-entity-grid-3">
                          <label>
                            <span>Contract</span>
                            <select
                              value={employeeForm.contractType}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, contractType: event.target.value }))
                              }
                            >
                              {CONTRACT_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {type.replaceAll('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Paid</span>
                            <select
                              value={employeeForm.payType}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, payType: event.target.value }))
                              }
                            >
                              <option value="MONTHLY">Monthly salary</option>
                              <option value="DAILY">Daily rate</option>
                            </select>
                          </label>
                          <label>
                            <span>{employeeForm.payType === 'DAILY' ? 'Daily Rate' : 'Monthly Salary'}</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={employeeForm.payRate}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, payRate: event.target.value }))
                              }
                            />
                          </label>
                        </div>
                        <div className="portal-entity-grid-3">
                          <label>
                            <span>Phone</span>
                            <input
                              value={employeeForm.phone}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, phone: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Email</span>
                            <input
                              type="email"
                              value={employeeForm.email}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, email: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Project (leave blank if shared)</span>
                            <select
                              value={employeeForm.projectId}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, projectId: event.target.value }))
                              }
                            >
                              <option value="">Shared across projects</option>
                              {projects.map((project) => (
                                <option key={project.id} value={project.id}>
                                  {project.code} — {project.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="portal-entity-grid-4">
                          <label>
                            <span>National ID</span>
                            <input
                              value={employeeForm.nationalId}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, nationalId: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>KRA PIN</span>
                            <input
                              value={employeeForm.kraPin}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, kraPin: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>NSSF No.</span>
                            <input
                              value={employeeForm.nssfNumber}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, nssfNumber: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>SHIF No.</span>
                            <input
                              value={employeeForm.shifNumber}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, shifNumber: event.target.value }))
                              }
                            />
                          </label>
                        </div>
                        <div className="portal-entity-grid-3">
                          <label>
                            <span>Bank</span>
                            <input
                              value={employeeForm.bankName}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, bankName: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Bank Account</span>
                            <input
                              value={employeeForm.bankAccountNumber}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, bankAccountNumber: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            <span>Status</span>
                            <select
                              value={employeeForm.status}
                              onChange={(event) =>
                                setEmployeeForm((prev) => ({ ...prev, status: event.target.value }))
                              }
                            >
                              {EMPLOYEE_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {status.replaceAll('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <button type="submit" className="portal-primary-btn" disabled={mutating}>
                          {mutating ? 'Saving...' : editingId ? 'Save Employee' : 'Add Employee'}
                        </button>
                      </form>
                    ) : null}

                    <div className="portal-entity-form" style={{ marginBottom: 14 }}>
                      <div className="portal-entity-grid-3">
                        <label>
                          <span>Status</span>
                          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                            <option value="">All statuses</option>
                            {EMPLOYEE_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status.replaceAll('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="list-toolbar">
                      <ServerListSearch pager={employeesPager} placeholder="Search staff…" />
                      <ListExport
                        rows={employeeExportRows}
                        config={{
                          fileName: 'employees',
                          dateOf: (row) => row.startDate,
                          dateLabel: 'Started',
                          columns: [
                            { header: 'Employee Number', value: (row) => row.employeeNumber },
                            { header: 'First Name', value: (row) => row.firstName },
                            { header: 'Last Name', value: (row) => row.lastName },
                            { header: 'Email', value: (row) => row.email || '' },
                            { header: 'Phone', value: (row) => row.phone || '' },
                            { header: 'Job Title', value: (row) => row.jobTitle || '' },
                            { header: 'Department', value: (row) => row.department || '' },
                            { header: 'Contract Type', value: (row) => row.contractType },
                            { header: 'Pay Type', value: (row) => row.payType },
                            { header: 'Pay Rate', value: (row) => Number(row.payRate) },
                            { header: 'Currency', value: (row) => row.currency },
                            { header: 'Started', value: (row) => formatDate(row.startDate) },
                          ],
                        }}
                      />
                    </div>
                    <div className="portal-list-stack">
                      {!employeesPager.loading && employeesPager.items.length === 0 ? (
                        <div className="portal-empty-state">No employees match.</div>
                      ) : (
                        employeesPager.items.map((employee) => (
                          <div key={employee.id} className="portal-record">
                            <div className="portal-list-row">
                              <div>
                                <strong>
                                  {employee.firstName} {employee.lastName}
                                  {employee.status !== 'ACTIVE' ? ` (${employee.status.replaceAll('_', ' ').toLowerCase()})` : ''}
                                </strong>
                                <p>
                                  {employee.employeeNumber}
                                  {employee.jobTitle ? ` • ${employee.jobTitle}` : ''}
                                  {employee.department ? ` • ${employee.department}` : ''}
                                </p>
                                <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                  {employee.contractType.replaceAll('_', ' ').toLowerCase()} • joined{' '}
                                  {formatDate(employee.startDate)}
                                  {employee.projectId
                                    ? ` • ${projects.find((p) => p.id === employee.projectId)?.code || 'project'}`
                                    : ' • shared'}
                                </p>
                              </div>
                              <span>{employee.payType === 'DAILY' ? 'Daily' : 'Monthly'}</span>
                              <span>
                                {formatMoney(employee.payRate)}
                                {employee.payType === 'DAILY' ? '/day' : '/mo'}
                              </span>
                            </div>
                            {canManageEmployees ? (
                              <div className="portal-action-row">
                                <button
                                  type="button"
                                  className="portal-inline-btn"
                                  onClick={() => {
                                    setEditingId(employee.id);
                                    setEmployeeForm({
                                      ...emptyEmployeeForm(),
                                      firstName: employee.firstName,
                                      lastName: employee.lastName,
                                      email: employee.email || '',
                                      phone: employee.phone || '',
                                      nationalId: employee.nationalId || '',
                                      kraPin: employee.kraPin || '',
                                      nssfNumber: employee.nssfNumber || '',
                                      shifNumber: employee.shifNumber || '',
                                      jobTitle: employee.jobTitle || '',
                                      department: employee.department || '',
                                      projectId: employee.projectId || '',
                                      contractType: employee.contractType,
                                      payType: employee.payType,
                                      payRate: String(employee.payRate),
                                      bankName: employee.bankName || '',
                                      bankAccountNumber: employee.bankAccountNumber || '',
                                      startDate: employee.startDate.slice(0, 10),
                                      status: employee.status,
                                      notes: employee.notes || '',
                                    });
                                    setShowEmployeeForm(true);
                                  }}
                                >
                                  Edit
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                    <ServerListPager pager={employeesPager} noun="employees" />
                  </article>
                ) : null}

                {tab === 'leave' ? (
                  <article className="portal-card" data-tour="hr.leave-requests">
                    <div className="portal-card-header-row">
                      <h2 style={{ margin: 0 }}>Leave Requests</h2>
                      {canRequestLeave ? (
                        <button
                          type="button"
                          className="portal-inline-btn"
                          onClick={() => setShowRequestForm((prev) => !prev)}
                        >
                          {showRequestForm ? 'Close' : 'Request Leave'}
                        </button>
                      ) : null}
                    </div>

                    {showRequestForm && canRequestLeave ? (
                      <form className="portal-entity-form portal-detail-form" onSubmit={onCreateRequest}>
                        <div className="portal-entity-grid-2">
                          <label>
                            <span>Employee</span>
                            <select
                              value={requestForm.employeeId}
                              onChange={(event) =>
                                setRequestForm((prev) => ({ ...prev, employeeId: event.target.value }))
                              }
                              required
                            >
                              <option value="">Select employee</option>
                              {activeEmployees.map((employee) => (
                                <option key={employee.id} value={employee.id}>
                                  {employee.firstName} {employee.lastName}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Leave Type</span>
                            <select
                              value={requestForm.leaveTypeId}
                              onChange={(event) =>
                                setRequestForm((prev) => ({ ...prev, leaveTypeId: event.target.value }))
                              }
                              required
                            >
                              <option value="">Select type</option>
                              {leaveTypes
                                .filter((type) => type.isActive)
                                .map((type) => (
                                  <option key={type.id} value={type.id}>
                                    {type.name} ({Number(type.annualDays)} days)
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                        <div className="portal-entity-grid-2">
                          <label>
                            <span>From</span>
                            <input
                              type="date"
                              value={requestForm.startDate}
                              onChange={(event) =>
                                setRequestForm((prev) => ({ ...prev, startDate: event.target.value }))
                              }
                              required
                            />
                          </label>
                          <label>
                            <span>To</span>
                            <input
                              type="date"
                              value={requestForm.endDate}
                              onChange={(event) =>
                                setRequestForm((prev) => ({ ...prev, endDate: event.target.value }))
                              }
                              required
                            />
                          </label>
                        </div>
                        <label>
                          <span>Reason</span>
                          <input
                            value={requestForm.reason}
                            onChange={(event) =>
                              setRequestForm((prev) => ({ ...prev, reason: event.target.value }))
                            }
                          />
                        </label>
                        <p className="portal-muted" style={{ margin: 0 }}>
                          Weekends are excluded automatically. The balance is only deducted once the request
                          is approved.
                        </p>
                        <button type="submit" className="portal-primary-btn" disabled={mutating}>
                          {mutating ? 'Saving...' : 'Submit Request'}
                        </button>
                      </form>
                    ) : null}

                    <div className="portal-list-stack">
                      {requests.length === 0 ? (
                        <div className="portal-empty-state">No leave requests yet.</div>
                      ) : (
                        requests.map((request) => (
                          <div key={request.id} className="portal-record">
                            <div className="portal-list-row">
                              <div>
                                <strong>
                                  {request.employee.firstName} {request.employee.lastName} —{' '}
                                  {request.leaveType.name}
                                </strong>
                                <p>
                                  {formatDate(request.startDate)} → {formatDate(request.endDate)} •{' '}
                                  {Number(request.days)} working day
                                  {Number(request.days) === 1 ? '' : 's'}
                                  {!request.leaveType.isPaid ? ' • unpaid' : ''}
                                </p>
                                {request.reason ? (
                                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                    {request.reason}
                                  </p>
                                ) : null}
                                {request.reviewNote ? (
                                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                    {request.reviewedBy}: {request.reviewNote}
                                  </p>
                                ) : null}
                              </div>
                              <span>{request.status}</span>
                            </div>
                            {canReviewLeave && request.status === 'PENDING' ? (
                              <div className="portal-action-row">
                                <button
                                  type="button"
                                  className="portal-inline-btn"
                                  disabled={mutating}
                                  onClick={() => void onReview(request, 'APPROVED')}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="portal-inline-btn is-danger"
                                  disabled={mutating}
                                  onClick={() => void onReview(request, 'REJECTED')}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : null}
                            {canReviewLeave && request.status === 'APPROVED' ? (
                              <div className="portal-action-row">
                                <button
                                  type="button"
                                  className="portal-inline-btn is-danger"
                                  disabled={mutating}
                                  onClick={() => void onCancelRequest(request)}
                                >
                                  Cancel Leave
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                ) : null}

                {tab === 'balances' ? (
                  <article className="portal-card" data-tour="hr.leave-balances">
                    <div className="portal-card-header-row">
                      <div>
                        <h2 style={{ margin: 0 }}>Leave Balances</h2>
                        <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                          Entitlement is pro-rated for anyone joining mid-year. Casual staff accrue only the
                          types marked for them.
                        </p>
                      </div>
                      {canOpenBalances ? (
                        <button
                          type="button"
                          className="portal-inline-btn"
                          disabled={mutating}
                          onClick={() => void onOpenBalances()}
                        >
                          Open {year} Balances
                        </button>
                      ) : null}
                    </div>

                    <div className="portal-entity-form" style={{ marginBottom: 14 }}>
                      <div className="portal-entity-grid-3">
                        <label>
                          <span>Year</span>
                          <input
                            type="number"
                            min={2000}
                            max={2100}
                            value={year}
                            onChange={(event) => setYear(Number(event.target.value))}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="portal-list-stack">
                      {balances.length === 0 ? (
                        <div className="portal-empty-state">
                          No balances for {year}. Use &ldquo;Open {year} Balances&rdquo; to create them.
                        </div>
                      ) : (
                        balances.map((balance) => (
                          <div key={balance.id} className="portal-list-row">
                            <div>
                              <strong>
                                {balance.employee.firstName} {balance.employee.lastName} —{' '}
                                {balance.leaveType.name}
                              </strong>
                              <p>
                                Entitled {Number(balance.entitledDays)}
                                {Number(balance.broughtForward) > 0
                                  ? ` + ${Number(balance.broughtForward)} carried`
                                  : ''}
                                {Number(balance.adjustmentDays) !== 0
                                  ? ` • adjusted ${Number(balance.adjustmentDays) > 0 ? '+' : ''}${Number(balance.adjustmentDays)}`
                                  : ''}{' '}
                                • taken {Number(balance.takenDays)}
                              </p>
                              {balance.adjustmentNote ? (
                                <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                  {balance.adjustmentNote}
                                </p>
                              ) : null}
                            </div>
                            <span>{balance.available} days left</span>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                ) : null}
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
