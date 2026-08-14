"use client";

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
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

type Amenity = {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  category?: string | null;
  createdAt: string;
};

type AmenityForm = {
  name: string;
  description: string;
  icon: string;
  category: string;
};

function makeAmenityForm(amenity?: Amenity | null): AmenityForm {
  return {
    name: amenity?.name || '',
    description: amenity?.description || '',
    icon: amenity?.icon || '',
    category: amenity?.category || '',
  };
}

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

export default function AmenitiesPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<AmenityForm>(makeAmenityForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AmenityForm>(makeAmenityForm());

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

      const nextAmenities = hasPermission(nextProfile, 'amenity.read')
        ? await apiRequest<Amenity[]>('/amenities', { method: 'GET' }, authToken)
        : [];
      setAmenities(nextAmenities);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load amenities.');
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

  const canCreate = hasPermission(profile, 'amenity.create');
  const canUpdate = hasPermission(profile, 'amenity.update');
  const canDelete = hasPermission(profile, 'amenity.delete');

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

  async function onCreateAmenity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreate) return;
    await runMutation(async () => {
      await apiRequest(
        '/amenities',
        {
          method: 'POST',
          body: JSON.stringify({
            name: createForm.name,
            description: createForm.description || undefined,
            icon: createForm.icon || undefined,
            category: createForm.category || undefined,
          }),
        },
        token,
      );
      setShowCreateForm(false);
      setCreateForm(makeAmenityForm());
    }, 'Amenity created.');
  }

  async function onUpdateAmenity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdate || !editingId) return;
    await runMutation(async () => {
      await apiRequest(
        `/amenities/${editingId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editForm.name,
            description: editForm.description || undefined,
            icon: editForm.icon || undefined,
            category: editForm.category || undefined,
          }),
        },
        token,
      );
      setEditingId(null);
      setEditForm(makeAmenityForm());
    }, 'Amenity updated.');
  }

  async function onDeleteAmenity(amenity: Amenity) {
    if (!token || !canDelete) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Amenity',
      message: `Delete "${amenity.name}"? Only possible if it isn't attached to any project or unit.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/amenities/${amenity.id}`, { method: 'DELETE' }, token);
    }, 'Amenity deleted.');
  }

  const categories = Array.from(new Set(amenities.map((amenity) => amenity.category).filter(Boolean))) as string[];
  const visibleAmenities = categoryFilter ? amenities.filter((amenity) => amenity.category === categoryFilter) : amenities;

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading amenities...</article>
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
            active="units"
            pageTitle="Amenities"
            pageSubtitle="Manage the catalog of amenities that can be attached to projects and units."
            email={profile.email}
            roleLabel={profile.role || 'Unassigned'}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={false}
            onLogout={onLogout}
          >
            <div className="portal-action-row" style={{ marginBottom: 16, alignItems: 'center' }}>
              <Link href="/portal/units" className="portal-ghost-btn">
                Back to Units
              </Link>
            </div>

            {feedback ? <article className="portal-card portal-feedback">{feedback}</article> : null}
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <article className="portal-card">
              <div className="portal-card-header-row">
                <h2 style={{ margin: 0 }}>Amenity Catalog</h2>
                {canCreate ? (
                  <button type="button" className="portal-inline-btn" onClick={() => setShowCreateForm((prev) => !prev)}>
                    {showCreateForm ? 'Close' : 'New Amenity'}
                  </button>
                ) : null}
              </div>

              {showCreateForm && canCreate ? (
                <form className="portal-entity-form portal-detail-form" onSubmit={onCreateAmenity}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Name</span>
                      <input value={createForm.name} onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))} required />
                    </label>
                    <label>
                      <span>Category (optional)</span>
                      <input
                        value={createForm.category}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, category: event.target.value }))}
                        placeholder="e.g. Recreation, Security, Convenience"
                      />
                    </label>
                  </div>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Icon (optional — emoji or identifier)</span>
                      <input value={createForm.icon} onChange={(event) => setCreateForm((prev) => ({ ...prev, icon: event.target.value }))} placeholder="🏊" />
                    </label>
                    <label>
                      <span>Description (optional)</span>
                      <input
                        value={createForm.description}
                        onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
                      />
                    </label>
                  </div>
                  <button type="submit" className="portal-primary-btn" disabled={mutating}>
                    {mutating ? 'Saving...' : 'Create Amenity'}
                  </button>
                </form>
              ) : null}

              {categories.length > 0 ? (
                <div className="portal-action-row" style={{ marginBottom: 16 }}>
                  <button type="button" className={`portal-inline-btn${categoryFilter === '' ? ' is-active' : ''}`} onClick={() => setCategoryFilter('')}>
                    All
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className={`portal-inline-btn${categoryFilter === category ? ' is-active' : ''}`}
                      onClick={() => setCategoryFilter(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="portal-list-stack">
                {visibleAmenities.length === 0 ? (
                  <div className="portal-empty-state">No amenities in the catalog yet.</div>
                ) : (
                  visibleAmenities.map((amenity) => (
                    <div key={amenity.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>
                            {amenity.icon ? `${amenity.icon} ` : ''}
                            {amenity.name}
                          </strong>
                          {amenity.description ? <p>{amenity.description}</p> : null}
                        </div>
                        <span>{amenity.category || '—'}</span>
                      </div>
                      <div className="portal-action-row">
                        {canUpdate ? (
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => {
                              setEditingId(amenity.id);
                              setEditForm(makeAmenityForm(amenity));
                            }}
                          >
                            Edit
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDeleteAmenity(amenity)}>
                            Delete
                          </button>
                        ) : null}
                      </div>

                      {editingId === amenity.id && canUpdate ? (
                        <form className="portal-entity-form portal-inline-form" onSubmit={onUpdateAmenity}>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Name</span>
                              <input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} required />
                            </label>
                            <label>
                              <span>Category</span>
                              <input value={editForm.category} onChange={(event) => setEditForm((prev) => ({ ...prev, category: event.target.value }))} />
                            </label>
                          </div>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Icon</span>
                              <input value={editForm.icon} onChange={(event) => setEditForm((prev) => ({ ...prev, icon: event.target.value }))} />
                            </label>
                            <label>
                              <span>Description</span>
                              <input value={editForm.description} onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))} />
                            </label>
                          </div>
                          <div className="portal-inline-actions">
                            <button type="submit" className="portal-primary-btn" disabled={mutating}>
                              Save
                            </button>
                            <button type="button" className="portal-ghost-btn" onClick={() => setEditingId(null)}>
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
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
