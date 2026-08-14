"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { ListExport } from '../components/list-export';
import { TourLauncher } from '../tours/tour-launcher';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { ListPager, ListSearch, useListControls } from '../components/list-controls';
import { usePortalDialog } from '../components/portal-dialog';

type AuthRole = { id: string; name: string; permissions: string[] };

type AuthProfile = {
  id: string;
  email: string;
  name?: string;
  role: string | null;
  roles?: AuthRole[];
  permissions?: string[];
};

type InquiryStatus = 'NEW' | 'IN_PROGRESS' | 'CLOSED';

type AgentRef = { id: string; name: string; email: string };

type Inquiry = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  status: InquiryStatus;
  notes?: string | null;
  createdAt: string;
  unit?: { id: string; unitNumber: string; floorNumber: number } | null;
  project?: { id: string; name: string; code: string; principalAgent?: AgentRef | null } | null;
  assignedAgent?: AgentRef | null;
};

type PortalUser = { id: string; name: string; email: string };

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const TOKEN_KEY = 'drl_access_token';

const STATUS_LABELS: Record<InquiryStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In Progress',
  CLOSED: 'Closed',
};

const STATUS_ORDER: InquiryStatus[] = ['NEW', 'IN_PROGRESS', 'CLOSED'];

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
  if (!profile) return false;
  if (profile.role === 'ADMIN' || profile.roles?.some((role) => role.name === 'ADMIN')) return true;
  return Boolean(profile.permissions?.includes(permission));
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function InquiriesPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);
      setProfile(nextProfile);

      const nextInquiries = hasPermission(nextProfile, 'inquiry.read')
        ? await apiRequest<Inquiry[]>('/inquiries', { method: 'GET' }, authToken)
        : [];
      setInquiries(nextInquiries);

      if (hasPermission(nextProfile, 'user.read')) {
        try {
          const nextUsers = await apiRequest<PortalUser[]>('/users', { method: 'GET' }, authToken);
          setUsers(Array.isArray(nextUsers) ? nextUsers : []);
        } catch {
          setUsers([]);
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load inquiries.');
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

  const canUpdate = hasPermission(profile, 'inquiry.update');
  const canDelete = hasPermission(profile, 'inquiry.delete');

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

  async function patchInquiry(id: string, body: Record<string, unknown>, message: string) {
    if (!token || !canUpdate) return;
    await runMutation(async () => {
      await apiRequest(`/inquiries/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token);
    }, message);
  }

  async function onDelete(inquiry: Inquiry) {
    if (!token || !canDelete) return;
    const confirmed = await dialog.confirm({
      title: 'Delete inquiry',
      message: `Delete the inquiry from ${inquiry.name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/inquiries/${inquiry.id}`, { method: 'DELETE' }, token);
    }, 'Inquiry deleted.');
  }

  const statusFiltered = statusFilter
    ? inquiries.filter((inquiry) => inquiry.status === statusFilter)
    : inquiries;
  const controls = useListControls(statusFiltered, (inquiry) => [
    inquiry.name,
    inquiry.email,
    inquiry.phone,
    inquiry.message,
    inquiry.project?.name,
    inquiry.unit?.unitNumber,
  ]);
  const visibleInquiries = controls.visible;

  const counts = STATUS_ORDER.reduce<Record<string, number>>((acc, status) => {
    acc[status] = inquiries.filter((inquiry) => inquiry.status === status).length;
    return acc;
  }, {});

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading inquiries...</article>
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
            active="inquiries"
            pageTitle="Inquiries"
            pageSubtitle="Contact requests raised from the public site, routed to the responsible agent."
            email={profile.email}
            roleLabel={profile.role || 'Unassigned'}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={false}
            onLogout={onLogout}
          >

            <article className="portal-card" data-tour="inquiries.inbox">
              <div className="portal-card-header-row">
                <h2 style={{ margin: 0 }}>Inquiry Inbox</h2><TourLauncher tour="inquiries-and-brokers" />
                <span className="portal-role">{inquiries.length} total</span>
              </div>

              <div className="portal-action-row" style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className={`portal-inline-btn${statusFilter === '' ? ' is-active' : ''}`}
                  onClick={() => setStatusFilter('')}
                >
                  All ({inquiries.length})
                </button>
                {STATUS_ORDER.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`portal-inline-btn${statusFilter === status ? ' is-active' : ''}`}
                    onClick={() => setStatusFilter(status)}
                  >
                    {STATUS_LABELS[status]} ({counts[status] || 0})
                  </button>
                ))}
              </div>

              <div className="list-toolbar">
                <ListSearch controls={controls} placeholder="Search name, email, project…" />
                <ListExport
                  rows={controls.filtered}
                  config={{
                    fileName: 'inquiries',
                    dateOf: (row) => row.createdAt,
                    dateLabel: 'Received',
                    columns: [
                      { header: 'Name', value: (row) => row.name },
                      { header: 'Email', value: (row) => row.email || '' },
                      { header: 'Phone', value: (row) => row.phone || '' },
                      { header: 'Project', value: (row) => row.project?.name || '' },
                      { header: 'Unit', value: (row) => row.unit?.unitNumber || '' },
                      { header: 'Status', value: (row) => row.status },
                      { header: 'Message', value: (row) => row.message },
                      { header: 'Received', value: (row) => formatDate(row.createdAt) },
                    ],
                  }}
                />
              </div>

              <div className="portal-list-stack">
                {visibleInquiries.length === 0 ? (
                  <div className="portal-empty-state">
                    {statusFilter ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} inquiries.` : 'No inquiries yet.'}
                  </div>
                ) : (
                  visibleInquiries.map((inquiry) => (
                    <div key={inquiry.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{inquiry.name}</strong>
                          <p>
                            {inquiry.project
                              ? `${inquiry.project.name}${inquiry.unit ? ` — Unit ${inquiry.unit.unitNumber}` : ''}`
                              : 'General inquiry'}
                          </p>
                          <p>
                            <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a>
                            {inquiry.phone ? ` · ${inquiry.phone}` : ''}
                          </p>
                        </div>
                        <span>{STATUS_LABELS[inquiry.status]}</span>
                      </div>

                      <div className="portal-list-row">
                        <div>
                          <p>
                            <strong>Assigned:</strong> {inquiry.assignedAgent?.name || 'Unassigned'}
                          </p>
                          <p>{formatDate(inquiry.createdAt)}</p>
                        </div>
                      </div>

                      <div className="portal-action-row">
                        <button
                          type="button"
                          className="portal-inline-btn"
                          onClick={() => setExpandedId((current) => (current === inquiry.id ? null : inquiry.id))}
                        >
                          {expandedId === inquiry.id ? 'Hide' : 'View'}
                        </button>
                        {canUpdate
                          ? STATUS_ORDER.filter((status) => status !== inquiry.status).map((status) => (
                              <button
                                key={status}
                                type="button"
                                className="portal-inline-btn"
                                disabled={mutating}
                                onClick={() =>
                                  void patchInquiry(inquiry.id, { status }, `Marked ${STATUS_LABELS[status].toLowerCase()}.`)
                                }
                              >
                                Mark {STATUS_LABELS[status]}
                              </button>
                            ))
                          : null}
                        {canDelete ? (
                          <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDelete(inquiry)}>
                            Delete
                          </button>
                        ) : null}
                      </div>

                      {expandedId === inquiry.id ? (
                        <div className="portal-inquiry-detail">
                          <div className="portal-inquiry-message">
                            <span className="portal-inquiry-detail-label">Message</span>
                            <p>{inquiry.message}</p>
                          </div>

                          {canUpdate ? (
                            <div className="portal-entity-form portal-inquiry-manage">
                              <label>
                                <span>Assigned agent</span>
                                <select
                                  value={inquiry.assignedAgent?.id || ''}
                                  disabled={mutating}
                                  onChange={(event) =>
                                    void patchInquiry(
                                      inquiry.id,
                                      { assignedAgentId: event.target.value || null },
                                      'Assignment updated.',
                                    )
                                  }
                                >
                                  <option value="">Unassigned</option>
                                  {users.map((user) => (
                                    <option key={user.id} value={user.id}>
                                      {user.name} ({user.email})
                                    </option>
                                  ))}
                                </select>
                                <small>Routes follow-up for this inquiry.</small>
                              </label>
                              <label>
                                <span>Internal notes</span>
                                <textarea
                                  rows={3}
                                  value={noteDrafts[inquiry.id] ?? inquiry.notes ?? ''}
                                  disabled={mutating}
                                  onChange={(event) =>
                                    setNoteDrafts((prev) => ({ ...prev, [inquiry.id]: event.target.value }))
                                  }
                                  onBlur={(event) => {
                                    const next = event.target.value;
                                    if (next !== (inquiry.notes ?? '')) {
                                      void patchInquiry(inquiry.id, { notes: next }, 'Notes saved.');
                                    }
                                  }}
                                  placeholder="Follow-up notes — saved when you click away."
                                />
                                <small>Visible to staff only. Saves on blur.</small>
                              </label>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
              <ListPager controls={controls} noun="inquiries" />
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
