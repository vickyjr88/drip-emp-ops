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

type CategoryAttribute = { id: string; key: string; label: string; options: string[]; sortOrder: number };

type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  isActive: boolean;
  _count?: { products: number; children: number };
  attributes?: CategoryAttribute[];
};

const BLANK = { name: '', description: '', parentId: '', isActive: true };
const BLANK_ATTRIBUTE = { label: '', optionsText: '' };

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
  /** Which category's attribute panel is open, or null when every one is
   *  collapsed -- a shop has a handful of categories, so this is inline
   *  rather than a separate page, matching the create/edit form above. */
  const [attributesOpenFor, setAttributesOpenFor] = useState<string | null>(null);
  const [attributeForm, setAttributeForm] = useState(BLANK_ATTRIBUTE);
  const [savingAttribute, setSavingAttribute] = useState(false);

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
        isActive: form.isActive,
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

  /** "EUR 36, EUR 37, EUR 38" -> ["EUR 36", "EUR 37", "EUR 38"], trimmed and
   *  with blanks (a stray trailing comma) dropped. */
  function parseOptions(text: string): string[] {
    return text.split(',').map((option) => option.trim()).filter(Boolean);
  }

  async function onAddAttribute(categoryId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const options = parseOptions(attributeForm.optionsText);
    if (options.length === 0) {
      setErrorMessage('List at least one option, separated by commas.');
      return;
    }
    setSavingAttribute(true);
    try {
      await apiRequest(`/product-categories/${categoryId}/attributes`, {
        method: 'POST',
        body: JSON.stringify({
          key: attributeForm.label.trim().toLowerCase().replace(/\s+/g, '_'),
          label: attributeForm.label.trim(),
          options,
        }),
      }, token);
      notifications.success(`${attributeForm.label} added.`);
      setAttributeForm(BLANK_ATTRIBUTE);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSavingAttribute(false);
    }
  }

  async function onRemoveAttribute(categoryId: string, attribute: CategoryAttribute) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Remove Attribute',
      message: `Remove "${attribute.label}" from this category? Products already using it keep their existing values -- this only stops it being offered when staff add a new product.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/product-categories/${categoryId}/attributes/${attribute.id}`, { method: 'DELETE' }, token);
      notifications.success(`${attribute.label} removed.`);
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
                  <label className="portal-check">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                    />
                    <span>Visible on the storefront</span>
                  </label>
                  <small className="portal-muted">
                    Untick to hide this category (and everything filed under it) from the shop, its filters, the
                    sitemap and the product feeds -- staff can still add products to it while it's off.
                  </small>
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
                          <span className={`portal-chip${category.isActive ? '' : ' is-muted'}`} style={{ marginLeft: 8 }}>
                            {category.isActive ? 'Visible' : 'Hidden'}
                          </span>
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
                                  isActive: category.isActive,
                                });
                              }}
                            >
                              Edit
                            </button>
                          ) : null}
                          {canUpdate ? (
                            <button
                              type="button"
                              className="portal-inline-btn"
                              onClick={() => {
                                setAttributesOpenFor((prev) => (prev === category.id ? null : category.id));
                                setAttributeForm(BLANK_ATTRIBUTE);
                              }}
                            >
                              {attributesOpenFor === category.id ? 'Close' : 'Attributes'}
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

                      {attributesOpenFor === category.id ? (
                        <div className="portal-record-detail">
                          <p className="portal-muted">
                            What distinguishes a variant in this category -- e.g. &ldquo;Size&rdquo; with EUR options
                            for shoes. A category with none needs no variant attribute at all: the catalogue form
                            creates one plain variant for it instead of offering a size picker.
                          </p>
                          {category.attributes && category.attributes.length > 0 ? (
                            <div className="portal-list-stack">
                              {category.attributes.map((attribute) => (
                                <div key={attribute.id} className="portal-list-row">
                                  <div>
                                    <strong>{attribute.label}</strong>
                                    <p className="portal-muted">{attribute.options.join(', ')}</p>
                                  </div>
                                  {canUpdate ? (
                                    <button
                                      type="button"
                                      className="portal-inline-btn is-danger"
                                      onClick={() => void onRemoveAttribute(category.id, attribute)}
                                    >
                                      Remove
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="portal-empty-state">No attribute yet -- products here get one plain variant.</p>
                          )}

                          {canUpdate ? (
                            <form
                              className="portal-entity-form"
                              style={{ marginTop: 16 }}
                              onSubmit={(event) => void onAddAttribute(category.id, event)}
                            >
                              <div className="portal-entity-grid-2">
                                <label>
                                  <span>Attribute name</span>
                                  <input
                                    value={attributeForm.label}
                                    placeholder="Size"
                                    onChange={(event) => setAttributeForm((prev) => ({ ...prev, label: event.target.value }))}
                                    required
                                  />
                                </label>
                                <label>
                                  <span>Options (comma-separated)</span>
                                  <input
                                    value={attributeForm.optionsText}
                                    placeholder="EUR 36, EUR 37, EUR 38, EUR 39, EUR 40"
                                    onChange={(event) => setAttributeForm((prev) => ({ ...prev, optionsText: event.target.value }))}
                                    required
                                  />
                                </label>
                              </div>
                              <button type="submit" className="portal-primary-btn" disabled={savingAttribute}>
                                {savingAttribute ? 'Saving...' : 'Add Attribute'}
                              </button>
                            </form>
                          ) : null}
                        </div>
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
