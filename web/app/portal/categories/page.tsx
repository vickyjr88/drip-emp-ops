"use client";

/**
 * Product categories: the tree products are filed under.
 *
 * The API has had full CRUD since the beginning, but nothing called anything
 * except the list -- so the category dropdown on the catalogue form only ever
 * offered "Uncategorised", and filing a product meant editing the database by
 * hand. This is that missing screen.
 *
 * Create and edit are inline, as on Stores: a shop has a dozen categories, not
 * hundreds, and a separate form page would be more navigation than the task is
 * worth.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { useErrorState, useFeedbackState, useNotifications } from '../components/notifications';
import { usePortalDialog } from '../components/portal-dialog';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  _count?: { products: number; children: number };
};

const BLANK = { name: '', description: '', parentId: '' };

export default function CategoriesPage() {
  const dialog = usePortalDialog();
  const notifications = useNotifications();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      setCategories(await apiRequest<Category[]>('/product-categories', { method: 'GET' }, authToken));
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
  }, [setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void load(token);
  }, [initialized, token, load]);

  const canCreate = hasPermission(profile, 'product-category.create');
  const canUpdate = hasPermission(profile, 'product-category.update');
  const canDelete = hasPermission(profile, 'product-category.delete');

  const nameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name] as const)),
    [categories],
  );

  /**
   * Parents first, each followed by its children.
   *
   * The API returns a flat list sorted by name, which reads as nonsense for a
   * tree -- "Sneakers" sorts far from the "Footwear" it belongs to. Only one
   * level is nested here because that is all the shop uses; a deeper tree would
   * want a recursive walk.
   */
  const ordered = useMemo(() => {
    const roots = categories.filter((category) => !category.parentId);
    const childrenOf = (parentId: string) =>
      categories.filter((category) => category.parentId === parentId);
    const rows: Array<{ category: Category; depth: number }> = [];
    for (const root of roots) {
      rows.push({ category: root, depth: 0 });
      for (const child of childrenOf(root.id)) rows.push({ category: child, depth: 1 });
    }
    // A category whose parent was deleted would otherwise vanish from the list
    // while still existing, so anything unvisited is appended rather than lost.
    for (const category of categories) {
      if (!rows.some((row) => row.category.id === category.id)) {
        rows.push({ category, depth: 0 });
      }
    }
    return rows;
  }, [categories]);

  /** A category cannot be its own parent, nor a parent of its own parent. */
  const parentChoices = useMemo(
    () => categories.filter((category) => category.id !== editingId && !category.parentId),
    [categories, editingId],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const body = JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        // Empty select means "top level"; null clears an existing parent,
        // which undefined would leave untouched on a PATCH.
        parentId: form.parentId || (editingId ? null : undefined),
      });
      if (editingId) {
        await apiRequest(`/product-categories/${editingId}`, { method: 'PATCH', body }, token);
        setFeedback(`${form.name} updated.`);
      } else {
        await apiRequest('/product-categories', { method: 'POST', body }, token);
        setFeedback(`${form.name} added.`);
      }
      setForm(BLANK);
      setEditingId(null);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(category: Category) {
    if (!token) return;
    const products = category._count?.products ?? 0;
    const children = category._count?.children ?? 0;
    const confirmed = await dialog.confirm({
      title: 'Delete Category',
      message: products || children
        ? `${category.name} holds ${products} product(s) and ${children} sub-category(ies). The API will refuse to delete it — move those first.`
        : `Delete ${category.name}?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/product-categories/${category.id}`, { method: 'DELETE' }, token);
      notifications.success(`${category.name} deleted.`);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading categories...</article>
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
            active="categories"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Categories"
            pageSubtitle="How products are filed. A category is what the storefront browses by."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            {canCreate || canUpdate ? (
              <article className="portal-card" data-tour="categories.add">
                <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit Category' : 'Add Category'}</h2>
                <p className="portal-muted">
                  The URL segment is generated from the name, so &ldquo;Running Shoes&rdquo;
                  becomes <code>running-shoes</code>.
                </p>
                <form className="portal-entity-form" onSubmit={onSubmit}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Name</span>
                      <input
                        value={form.name}
                        placeholder="Sneakers"
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Parent category</span>
                      <select
                        value={form.parentId}
                        onChange={(event) => setForm((prev) => ({ ...prev, parentId: event.target.value }))}
                      >
                        <option value="">Top level</option>
                        {parentChoices.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                      <small className="portal-muted">
                        Optional, for &ldquo;Footwear &rsaquo; Sneakers&rdquo;.
                      </small>
                    </label>
                  </div>
                  <label>
                    <span>Description</span>
                    <input
                      value={form.description}
                      placeholder="Everyday trainers and court shoes"
                      onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </label>
                  <div className="portal-inline-actions">
                    <button type="submit" className="portal-primary-btn" disabled={saving}>
                      {saving ? 'Saving...' : editingId ? 'Save Category' : 'Add Category'}
                    </button>
                    {editingId ? (
                      <button
                        type="button"
                        className="portal-ghost-btn"
                        onClick={() => { setEditingId(null); setForm(BLANK); }}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </form>
              </article>
            ) : null}

            <article className="portal-card" data-tour="categories.list">
              <h2 style={{ marginTop: 0 }}>All Categories</h2>
              <div className="portal-list-stack">
                {ordered.length === 0 ? (
                  <div className="portal-empty-state">
                    No categories yet. Add the first one above — products stay uncategorised until there is one.
                  </div>
                ) : (
                  ordered.map(({ category, depth }) => (
                    <div key={category.id} className="portal-record">
                      <div className="portal-list-row" style={depth ? { paddingLeft: 24 } : undefined}>
                        <div>
                          <strong>
                            {depth ? '↳ ' : ''}{category.name}
                          </strong>
                          <p className="portal-muted">
                            <code>{category.slug}</code>
                            {category.parentId ? ` · in ${nameById.get(category.parentId) ?? 'unknown'}` : ''}
                          </p>
                          {category.description ? <p>{category.description}</p> : null}
                          <p>
                            {category._count?.products ?? 0} product(s)
                            {category._count?.children ? ` · ${category._count.children} sub-category(ies)` : ''}
                          </p>
                        </div>
                        <div className="portal-action-row">
                          {canUpdate ? (
                            <button
                              type="button"
                              className="portal-inline-btn"
                              onClick={() => {
                                setEditingId(category.id);
                                setForm({
                                  name: category.name,
                                  description: category.description || '',
                                  parentId: category.parentId || '',
                                });
                              }}
                            >
                              Edit
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              className="portal-inline-btn is-danger"
                              onClick={() => void onDelete(category)}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </div>
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
