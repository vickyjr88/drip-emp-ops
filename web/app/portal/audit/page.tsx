"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useErrorState } from '../components/notifications';
import { TourLauncher } from '../tours/tour-launcher';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../accounting/lib';

type ActorType = 'STAFF' | 'CUSTOMER' | 'ANONYMOUS' | 'SYSTEM';
type Outcome = 'SUCCESS' | 'FAILURE';

type AuditEntry = {
  id: string;
  actorType: ActorType;
  actorId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  method: string;
  path: string;
  statusCode?: number | null;
  outcome: Outcome;
  requestBody?: unknown;
  errorMessage?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  durationMs?: number | null;
  createdAt: string;
};

type AuditPage = { items: AuditEntry[]; total: number; skip: number; take: number };

type AuditStats = {
  total: number;
  last7Days: number;
  failuresLast7Days: number;
  byActorType: Array<{ actorType: ActorType; count: number }>;
};

const PAGE_SIZE = 50;

const ACTOR_LABELS: Record<ActorType, string> = {
  STAFF: 'Staff',
  CUSTOMER: 'Customer',
  ANONYMOUS: 'Signed out',
  SYSTEM: 'System',
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function humanizeResource(resource: string) {
  return resource.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Plain-language summary so the list reads without decoding REST verbs. */
function describeEntry(entry: AuditEntry) {
  const actor = entry.actorName || entry.actorEmail || ACTOR_LABELS[entry.actorType];
  const verb =
    entry.action === 'CREATE'
      ? 'created'
      : entry.action === 'UPDATE'
        ? 'updated'
        : entry.action === 'DELETE'
          ? 'deleted'
          : entry.action.toLowerCase();
  return `${actor} ${verb} ${humanizeResource(entry.resource).toLowerCase()}`;
}

export default function AuditLogPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();

  const [page, setPage] = useState<AuditPage | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [resources, setResources] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    search: '',
    resource: '',
    action: '',
    actorType: '',
    outcome: '',
    from: '',
    to: '',
  });
  const [skip, setSkip] = useState(0);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(
    async (authToken: string, nextSkip: number, activeFilters: typeof filters) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const nextProfile = await loadProfile(authToken);
        setProfile(nextProfile);

        if (!hasPermission(nextProfile, 'audit-log.read')) {
          setPage(null);
          return;
        }

        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(activeFilters)) {
          if (value) params.set(key, value);
        }
        params.set('skip', String(nextSkip));
        params.set('take', String(PAGE_SIZE));

        const [nextPage, nextStats, nextResources] = await Promise.all([
          apiRequest<AuditPage>(`/audit-logs?${params}`, { method: 'GET' }, authToken),
          apiRequest<AuditStats>('/audit-logs/stats', { method: 'GET' }, authToken),
          apiRequest<string[]>('/audit-logs/resources', { method: 'GET' }, authToken),
        ]);
        setPage(nextPage);
        setStats(nextStats);
        setResources(nextResources);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load the audit log.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token, skip, filters);
    // filters are applied explicitly via onApplyFilters, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, token, skip, load]);

  const canRead = hasPermission(profile, 'audit-log.read');
  const roleLabel = useMemo(() => roleLabelFor(profile), [profile]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  function onApplyFilters() {
    if (!token) return;
    setSkip(0);
    void load(token, 0, filters);
  }

  function onResetFilters() {
    const cleared = { search: '', resource: '', action: '', actorType: '', outcome: '', from: '', to: '' };
    setFilters(cleared);
    setSkip(0);
    if (token) void load(token, 0, cleared);
  }

  if (!initialized || (loading && !page)) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-auth-section" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading audit log...</article>
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

  const total = page?.total ?? 0;
  const showingFrom = total === 0 ? 0 : skip + 1;
  const showingTo = Math.min(skip + PAGE_SIZE, total);

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="audit"
            pageSubtitle="Every change made through the system, and who made it."
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={hasPermission(profile, 'role.read')}
            onLogout={onLogout}
            onRefresh={() => token && void load(token, skip, filters)}
          >

            {!canRead ? (
              <article className="portal-card portal-role-banner">
                You do not have permission to view the audit log.
              </article>
            ) : (
              <>
                {stats ? (
                  <div className="portal-stats-grid">
                    <article className="portal-card portal-stat-card">
                      <span>Total Entries</span>
                      <strong>{stats.total.toLocaleString()}</strong>
                    </article>
                    <article className="portal-card portal-stat-card">
                      <span>Last 7 Days</span>
                      <strong>{stats.last7Days.toLocaleString()}</strong>
                    </article>
                    <article className="portal-card portal-stat-card">
                      <span>Failed Attempts (7d)</span>
                      <strong>{stats.failuresLast7Days.toLocaleString()}</strong>
                    </article>
                    <article className="portal-card portal-stat-card">
                      <span>Staff Actions</span>
                      <strong>
                        {(
                          stats.byActorType.find((row) => row.actorType === 'STAFF')?.count || 0
                        ).toLocaleString()}
                      </strong>
                    </article>
                  </div>
                ) : null}

                <article className="portal-card" data-tour="audit.filters">
                  <h2 style={{ marginTop: 0 }}>Filters</h2>
                  <div className="portal-entity-form">
                    <div className="portal-entity-grid-3">
                      <label>
                        <span>Search (person, resource, path)</span>
                        <input
                          value={filters.search}
                          onChange={(event) =>
                            setFilters((prev) => ({ ...prev, search: event.target.value }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') onApplyFilters();
                          }}
                          placeholder="e.g. admin@dirrir.com"
                        />
                      </label>
                      <label>
                        <span>Resource</span>
                        <select
                          value={filters.resource}
                          onChange={(event) =>
                            setFilters((prev) => ({ ...prev, resource: event.target.value }))
                          }
                        >
                          <option value="">All resources</option>
                          {resources.map((resource) => (
                            <option key={resource} value={resource}>
                              {humanizeResource(resource)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Action</span>
                        <select
                          value={filters.action}
                          onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value }))}
                        >
                          <option value="">All actions</option>
                          <option value="CREATE">Created</option>
                          <option value="UPDATE">Updated</option>
                          <option value="DELETE">Deleted</option>
                        </select>
                      </label>
                    </div>
                    <div className="portal-entity-grid-3">
                      <label>
                        <span>Actor</span>
                        <select
                          value={filters.actorType}
                          onChange={(event) =>
                            setFilters((prev) => ({ ...prev, actorType: event.target.value }))
                          }
                        >
                          <option value="">Everyone</option>
                          <option value="STAFF">Staff</option>
                          <option value="CUSTOMER">Customers</option>
                          <option value="ANONYMOUS">Signed out</option>
                        </select>
                      </label>
                      <label>
                        <span>From</span>
                        <input
                          type="date"
                          value={filters.from}
                          onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
                        />
                      </label>
                      <label>
                        <span>To</span>
                        <input
                          type="date"
                          value={filters.to}
                          onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="portal-check-row">
                      <label className="portal-check">
                        <input
                          type="checkbox"
                          checked={filters.outcome === 'FAILURE'}
                          onChange={(event) =>
                            setFilters((prev) => ({ ...prev, outcome: event.target.checked ? 'FAILURE' : '' }))
                          }
                        />
                        <span>Only failed attempts</span>
                      </label>
                    </div>
                    <div className="portal-inline-actions">
                      <button type="button" className="portal-primary-btn" onClick={onApplyFilters}>
                        Apply Filters
                      </button>
                      <button type="button" className="portal-ghost-btn" onClick={onResetFilters}>
                        Reset
                      </button>
                    </div>
                  </div>
                </article>

                <article className="portal-card" data-tour="audit.activity">
                  <div className="portal-card-header-row">
                    <h2 style={{ margin: 0 }}>Activity</h2><TourLauncher tour="audit-trail" />
                    <span className="portal-muted">
                      {total === 0 ? 'No entries' : `Showing ${showingFrom}–${showingTo} of ${total.toLocaleString()}`}
                    </span>
                  </div>

                  <div className="portal-list-stack">
                    {!page?.items.length ? (
                      <div className="portal-empty-state">
                        No activity matches these filters.
                      </div>
                    ) : (
                      page.items.map((entry) => (
                        <div key={entry.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>
                                {describeEntry(entry)}
                                {entry.outcome === 'FAILURE' ? ' — blocked' : ''}
                              </strong>
                              <p>
                                {formatTimestamp(entry.createdAt)}
                                {entry.actorEmail ? ` • ${entry.actorEmail}` : ''}
                                {' • '}
                                {ACTOR_LABELS[entry.actorType]}
                              </p>
                              <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                {entry.method} {entry.path}
                                {entry.statusCode ? ` • ${entry.statusCode}` : ''}
                                {entry.durationMs != null ? ` • ${entry.durationMs}ms` : ''}
                              </p>
                              {entry.errorMessage ? (
                                <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                                  {entry.errorMessage}
                                </p>
                              ) : null}
                            </div>
                            <span>{entry.action}</span>
                            <span>{entry.outcome}</span>
                          </div>
                          <div className="portal-action-row">
                            <button
                              type="button"
                              className="portal-inline-btn"
                              onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                            >
                              {expandedId === entry.id ? 'Hide Details' : 'View Details'}
                            </button>
                          </div>

                          {expandedId === entry.id ? (
                            <div style={{ marginTop: 10 }}>
                              <div className="portal-info-list">
                                <div className="portal-info-row">
                                  <span>Record ID</span>
                                  <strong>{entry.resourceId || '—'}</strong>
                                </div>
                                <div className="portal-info-row">
                                  <span>IP Address</span>
                                  <strong>{entry.ipAddress || '—'}</strong>
                                </div>
                                <div className="portal-info-row">
                                  <span>Device</span>
                                  <strong style={{ fontWeight: 400, fontSize: 13 }}>
                                    {entry.userAgent || '—'}
                                  </strong>
                                </div>
                              </div>
                              {entry.requestBody ? (
                                <>
                                  <p className="portal-muted" style={{ margin: '10px 0 4px' }}>
                                    Submitted data (passwords and tokens are never stored)
                                  </p>
                                  <pre
                                    style={{
                                      margin: 0,
                                      padding: 12,
                                      overflowX: 'auto',
                                      fontSize: 12,
                                      lineHeight: 1.5,
                                      border: '1px solid var(--eef-border)',
                                      background: '#fafafa',
                                    }}
                                  >
                                    {JSON.stringify(entry.requestBody, null, 2)}
                                  </pre>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>

                  {total > PAGE_SIZE ? (
                    <div className="portal-inline-actions" style={{ marginTop: 14 }}>
                      <button
                        type="button"
                        className="portal-inline-btn"
                        disabled={skip === 0 || loading}
                        onClick={() => setSkip(Math.max(skip - PAGE_SIZE, 0))}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        className="portal-inline-btn"
                        disabled={skip + PAGE_SIZE >= total || loading}
                        onClick={() => setSkip(skip + PAGE_SIZE)}
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </article>
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
