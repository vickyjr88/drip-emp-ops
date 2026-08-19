"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { ListExport } from '../components/list-export';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { usePortalDialog } from '../components/portal-dialog';

type AuthRole = {
  id: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
  permissions: string[];
};

type AuthProfile = {
  id: string;
  email: string;
  name?: string;
  role: string | null;
  roles: AuthRole[];
  permissions: string[];
  createdAt?: string;
};

type RoleRecord = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
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
    throw new Error((await response.text()) || `Request failed (${response.status})`);
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

export default function UsersManagementClient() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [exportRows, setExportRows] = useState<AuthProfile[]>([]);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);
      const nextRoles = hasPermission(nextProfile, 'role.read')
        ? await apiRequest<RoleRecord[]>('/roles?take=500', { method: 'GET' }, authToken).then(
            (page: unknown) => (Array.isArray(page) ? page : (page as ServerPage<RoleRecord>).items),
          )
        : [];
      setProfile(nextProfile);
      setRoles(nextRoles);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load users.');
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

  const canCreate = hasPermission(profile, 'user.create');
  const canUpdate = hasPermission(profile, 'user.update');
  const canDelete = hasPermission(profile, 'user.delete');
  const canRead = hasPermission(profile, 'user.read');

  const fetchUsersPage = useCallback(
    async (params: { skip: number; take: number; search: string; roleId: string }): Promise<ServerPage<AuthProfile>> => {
      if (!token || !profile || !hasPermission(profile, 'user.read')) {
        return { items: [], total: 0, skip: params.skip, take: params.take };
      }
      const query = new URLSearchParams();
      query.set('skip', String(params.skip));
      query.set('take', String(params.take));
      if (params.search) query.set('search', params.search);
      if (params.roleId !== 'all') query.set('roleId', params.roleId);
      return apiRequest<ServerPage<AuthProfile>>(`/users?${query}`, { method: 'GET' }, token);
    },
    [token, profile],
  );

  const userPager = useServerPager<AuthProfile, { roleId: string }>({
    fetchPage: (params) => fetchUsersPage(params),
    filters: { roleId: roleFilter },
    enabled: Boolean(token && profile),
  });

  useEffect(() => {
    if (!token || !profile || !hasPermission(profile, 'user.read')) return;
    const timer = setTimeout(() => {
      void fetchUsersPage({ skip: 0, take: 500, search: userPager.search, roleId: roleFilter }).then((page) =>
        setExportRows(page.items),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [fetchUsersPage, userPager.search, roleFilter, token, profile]);

  const roleLabel = useMemo(() => {
    if (!profile) return 'Unassigned';
    if (profile.roles?.length) return profile.roles.map((role) => role.name).join(', ');
    return profile.role || 'Unassigned';
  }, [profile]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  async function onDeleteUser(id: string) {
    if (!token || !canDelete) return;
    if (id === profile?.id) {
      setErrorMessage('You cannot delete your own account while signed in.');
      return;
    }
    const confirmed = await dialog.confirm({
      title: 'Delete User',
      message: 'Delete this user? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    setMutating(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      await apiRequest(`/users/${id}`, { method: 'DELETE' }, token);
      setFeedback('User deleted.');
      userPager.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete user.');
    } finally {
      setMutating(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading users...</article>
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
            active="users"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            pageTitle="User Management"
            pageSubtitle="Create portal users, update profiles, assign roles, and reset passwords."
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={
              hasPermission(profile, 'role.read') ||
              hasPermission(profile, 'permission.read') ||
              hasPermission(profile, 'user.read')
            }
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={onLogout}
            onRefresh={() => token && void load(token)}
          >

            {!canRead ? (
              <article className="portal-card portal-role-banner">
                You do not have permission to view users.
              </article>
            ) : (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Users</h2>
                    <p className="portal-muted">
                      Showing {userPager.total} user{userPager.total === 1 ? '' : 's'}.
                    </p>
                  </div>
                  {canCreate ? (
                    <Link href="/portal/users/new" className="portal-primary-btn">
                      New User
                    </Link>
                  ) : null}
                </div>

                <div className="portal-filter-bar">
                  <ServerListSearch pager={userPager} placeholder="Name, email, or role" />
                  <label>
                    <span>Role</span>
                    <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                      <option value="all">All roles</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {userPager.search || roleFilter !== 'all' ? (
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => {
                        userPager.setSearch('');
                        setRoleFilter('all');
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                <div className="portal-list-stack" style={{ marginTop: 16 }}>
                  {!userPager.loading && userPager.items.length === 0 ? (
                    <div className="portal-empty-state">No users match your filters.</div>
                  ) : (
                    userPager.items.map((user) => (
                      <div key={user.id} className="portal-record">
                        <div className="portal-list-row portal-rbac-row">
                          <div>
                            <strong>
                              {user.name || user.email}
                              {user.id === profile.id ? ' (you)' : ''}
                            </strong>
                            <p>{user.email}</p>
                            {user.createdAt ? (
                              <p>Joined {new Date(user.createdAt).toLocaleDateString('en-GB')}</p>
                            ) : null}
                          </div>
                          <span>{user.roles.length} role{user.roles.length === 1 ? '' : 's'}</span>
                          <span>{user.permissions.length} perms</span>
                        </div>
                        <div className="portal-tag-cloud">
                          {user.roles.length ? (
                            user.roles.map((role) => (
                              <span key={role.id} className="portal-chip">
                                {role.name}
                              </span>
                            ))
                          ) : (
                            <span className="portal-muted">No roles assigned</span>
                          )}
                        </div>
                        <div className="portal-action-row">
                          {canUpdate ? (
                            <Link href={`/portal/users/${user.id}/edit`} className="portal-inline-btn">
                              Edit
                            </Link>
                          ) : null}
                          {canUpdate ? (
                            <Link href={`/portal/users/${user.id}/edit#password`} className="portal-inline-btn">
                              Reset Password
                            </Link>
                          ) : null}
                          {canDelete && user.id !== profile.id ? (
                            <button
                              type="button"
                              className="portal-inline-btn is-danger"
                              disabled={mutating}
                              onClick={() => void onDeleteUser(user.id)}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="list-export-row">
                  <ServerListPager pager={userPager} noun="users" />
                  <ListExport
                    rows={exportRows}
                    config={{
                      fileName: 'users',
                      columns: [
                        { header: 'Name', value: (row) => row.name || '' },
                        { header: 'Email', value: (row) => row.email },
                        { header: 'Roles', value: (row) => row.roles.map((role) => role.name).join('; ') },
                        { header: 'Permissions', value: (row) => row.permissions?.length ?? 0 },
                      ],
                    }}
                  />
                </div>
              </article>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
