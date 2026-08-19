"use client";

import Link from 'next/link';
import { PasswordInput } from '../../components/password-input';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';

type AuthRole = {
  id: string;
  name: string;
  permissions: string[];
};

type AuthProfile = {
  id: string;
  email: string;
  name?: string;
  role: string | null;
  roles: AuthRole[];
  permissions: string[];
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

function toggleSelection(values: string[], value: string) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export default function UserFormClient({
  mode,
  userId,
}: {
  mode: 'create' | 'edit';
  userId?: string;
}) {
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

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
        ? await apiRequest<{ items: RoleRecord[] }>('/roles?take=500', { method: 'GET' }, authToken).then(
            (page) => page.items,
          )
        : [];

      setProfile(nextProfile);
      setRoles(nextRoles);

      if (mode === 'edit' && userId) {
        const user = await apiRequest<AuthProfile>(`/users/${userId}`, { method: 'GET' }, authToken);
        setName(user.name || '');
        setEmail(user.email || '');
        setRoleIds(user.roles.map((role) => role.id));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load user form.');
    } finally {
      setLoading(false);
    }
  }, [mode, userId]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash === '#password') {
      document.getElementById('password')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading]);

  const canSubmit =
    mode === 'create' ? hasPermission(profile, 'user.create') : hasPermission(profile, 'user.update');
  const canReset = hasPermission(profile, 'user.update');

  const roleLabel = useMemo(() => {
    if (!profile) return 'Unassigned';
    if (profile.roles?.length) return profile.roles.map((role) => role.name).join(', ');
    return profile.role || 'Unassigned';
  }, [profile]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canSubmit) return;

    if (mode === 'create') {
      if (password.length < 8) {
        setErrorMessage('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Password confirmation does not match.');
        return;
      }
    }

    setSaving(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      if (mode === 'create') {
        await apiRequest(
          '/users',
          {
            method: 'POST',
            body: JSON.stringify({
              name: name.trim(),
              email: email.trim().toLowerCase(),
              password,
              roleIds,
            }),
          },
          token,
        );
        setFeedback('User created.');
        router.push('/portal/users');
      } else if (userId) {
        await apiRequest(
          `/users/${userId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              name: name.trim(),
              email: email.trim().toLowerCase(),
              roleIds,
            }),
          },
          token,
        );
        setFeedback('User updated.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save user.');
    } finally {
      setSaving(false);
    }
  }

  async function onResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canReset || !userId) return;

    if (resetPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters.');
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setErrorMessage('New password confirmation does not match.');
      return;
    }

    setResetting(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      await apiRequest(
        `/users/${userId}/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify({ password: resetPassword }),
        },
        token,
      );
      setResetPassword('');
      setResetConfirmPassword('');
      setFeedback('Password reset successfully.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to reset password.');
    } finally {
      setResetting(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading user form...</article>
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

  if (!canSubmit) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main is-authenticated">
          <section className="lp-container portal-auth-section">
            <PortalShell
              active="users"
              pageTitle={mode === 'create' ? 'New User' : 'Edit User'}
              email={profile.email}
              roleLabel={roleLabel}
              permissionCount={profile.permissions?.length || 0}
              canReadRbac={hasPermission(profile, 'user.read')}
              canReadUsers={hasPermission(profile, 'user.read')}
              onLogout={onLogout}
            >
              <article className="portal-card portal-role-banner">
                You do not have permission to {mode === 'create' ? 'create' : 'update'} users.
              </article>
              <Link href="/portal/users" className="portal-ghost-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                Back to Users
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
            active="users"
            pageTitle={mode === 'create' ? 'New User' : 'Edit User'}
            pageSubtitle={
              mode === 'create'
                ? 'Create a portal account, set an initial password, and assign roles.'
                : 'Update profile details, roles, or reset the user password.'
            }
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
          >

            <form className="portal-stack-grid" onSubmit={onSubmit}>
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Profile</h2>
                  <Link href="/portal/users" className="portal-inline-btn">
                    Cancel
                  </Link>
                </div>
                <div className="portal-entity-form">
                  <label>
                    <span>Full Name</span>
                    <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
                  </label>
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </label>

                  {mode === 'create' ? (
                    <div className="portal-entity-grid-2">
                      <label>
                        <span>Password</span>
                        <PasswordInput
                          autoComplete="new-password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          minLength={8}
                          required
                        />
                      </label>
                      <label>
                        <span>Confirm Password</span>
                        <PasswordInput
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          minLength={8}
                          required
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </article>

              <article className="portal-card">
                <h2>Roles</h2>
                <p className="portal-muted" style={{ marginBottom: 12 }}>
                  Assign one or more roles. Permissions are derived from selected roles.
                </p>
                <div className="portal-selection-grid portal-selection-grid-roles">
                  {roles.length === 0 ? (
                    <div className="portal-empty-state">No roles available. Create roles in RBAC first.</div>
                  ) : (
                    roles.map((role) => (
                      <label key={role.id} className="portal-selection-chip">
                        <input
                          type="checkbox"
                          checked={roleIds.includes(role.id)}
                          onChange={() => setRoleIds((prev) => toggleSelection(prev, role.id))}
                        />
                        <span>{role.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </article>

              <div className="portal-inline-actions">
                <button type="submit" className="portal-primary-btn" disabled={saving}>
                  {saving ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}
                </button>
                <Link href="/portal/users" className="portal-ghost-btn">
                  Back to Users
                </Link>
              </div>
            </form>

            {mode === 'edit' && canReset ? (
              <article className="portal-card" id="password">
                <h2>Reset Password</h2>
                <p className="portal-muted" style={{ marginBottom: 12 }}>
                  Set a new password for this user. They will use it on the next sign-in.
                </p>
                <form className="portal-entity-form" onSubmit={onResetPassword}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>New Password</span>
                      <PasswordInput
                        autoComplete="new-password"
                        value={resetPassword}
                        onChange={(event) => setResetPassword(event.target.value)}
                        minLength={8}
                        required
                      />
                    </label>
                    <label>
                      <span>Confirm New Password</span>
                      <PasswordInput
                        autoComplete="new-password"
                        value={resetConfirmPassword}
                        onChange={(event) => setResetConfirmPassword(event.target.value)}
                        minLength={8}
                        required
                      />
                    </label>
                  </div>
                  <button type="submit" className="portal-primary-btn" disabled={resetting}>
                    {resetting ? 'Resetting...' : 'Reset Password'}
                  </button>
                </form>
              </article>
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
