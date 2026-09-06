"use client";

/**
 * Blog posts: sizing guides, care tips, style advice on the public /blog.
 *
 * Create and edit are inline, matching Categories -- a shop publishes a
 * handful of posts a month, not hundreds, so a separate form page would be
 * more navigation than the task is worth. Body is sanitised HTML rather than
 * markdown (no markdown parser exists anywhere in this codebase), edited as
 * raw HTML in a textarea the same way LegalPage's prose field works.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { useErrorState, useFeedbackState, useNotifications } from '../components/notifications';
import { usePortalDialog } from '../components/portal-dialog';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor,
  hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverImageUrl: string | null;
  author: string;
  publishedAt: string | null;
  createdAt: string;
};

type Paged<T> = { items: T[]; total: number; skip: number; take: number };

const BLANK = { title: '', slug: '', excerpt: '', body: '', coverImageUrl: '', author: 'Drip Emporium' };

/** "best-sneakers-in-kenya", from "Best Sneakers in Kenya!" -- generated so
 *  staff don't have to hand-craft a URL segment, matching Categories' slug
 *  generation for the same reason. */
function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export default function BlogPage() {
  const dialog = usePortalDialog();
  const notifications = useNotifications();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [form, setForm] = useState(BLANK);
  const [slugTouched, setSlugTouched] = useState(false);
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
      const page = await apiRequest<Paged<BlogPost>>('/blog-posts?take=200', { method: 'GET' }, authToken);
      setPosts(page.items);
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

  const canCreate = hasPermission(profile, 'blog-post.create');
  const canUpdate = hasPermission(profile, 'blog-post.update');
  const canDelete = hasPermission(profile, 'blog-post.delete');

  function startEdit(post: BlogPost) {
    setEditingId(post.id);
    setSlugTouched(true); // an existing slug should never silently change while editing
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      body: post.body,
      coverImageUrl: post.coverImageUrl || '',
      author: post.author,
    });
  }

  function resetForm() {
    setEditingId(null);
    setSlugTouched(false);
    setForm(BLANK);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>, publish?: boolean) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const body = JSON.stringify({
        title: form.title.trim(),
        slug: form.slug.trim().toLowerCase(),
        excerpt: form.excerpt.trim(),
        body: form.body,
        coverImageUrl: form.coverImageUrl.trim() || undefined,
        author: form.author.trim() || undefined,
        ...(publish !== undefined ? { publish } : {}),
      });
      if (editingId) {
        await apiRequest(`/blog-posts/${editingId}`, { method: 'PATCH', body }, token);
        setFeedback(`${form.title} updated.`);
      } else {
        await apiRequest('/blog-posts', { method: 'POST', body }, token);
        setFeedback(`${form.title} saved as a draft.`);
      }
      resetForm();
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSaving(false);
    }
  }

  async function onTogglePublish(post: BlogPost) {
    if (!token) return;
    try {
      await apiRequest(`/blog-posts/${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ publish: !post.publishedAt }),
      }, token);
      notifications.success(post.publishedAt ? `${post.title} unpublished.` : `${post.title} published.`);
      await load(token);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function onDelete(post: BlogPost) {
    if (!token) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Post',
      message: `Delete "${post.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/blog-posts/${post.id}`, { method: 'DELETE' }, token);
      notifications.success(`${post.title} deleted.`);
      if (editingId === post.id) resetForm();
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
            <article className="portal-card portal-loading">Loading blog posts...</article>
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
            active="blog"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Blog"
            pageSubtitle="Sizing guides, care tips and style advice on the public /blog."
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
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit Post' : 'New Post'}</h2>
                <p className="portal-muted">
                  Saving here never publishes on its own — use Publish below or on the list once you&rsquo;re happy with it.
                </p>
                <form className="portal-entity-form" onSubmit={(event) => void onSubmit(event)}>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Title</span>
                      <input
                        value={form.title}
                        placeholder="Sneaker Size Guide: How to Get Your Fit Right"
                        onChange={(event) => {
                          const title = event.target.value;
                          setForm((prev) => ({
                            ...prev,
                            title,
                            slug: slugTouched ? prev.slug : slugify(title),
                          }));
                        }}
                        required
                      />
                    </label>
                    <label>
                      <span>URL slug</span>
                      <input
                        value={form.slug}
                        placeholder="sneaker-size-guide"
                        onChange={(event) => { setSlugTouched(true); setForm((prev) => ({ ...prev, slug: event.target.value })); }}
                        required
                      />
                      <small className="portal-muted">Becomes /blog/{form.slug || '...'}</small>
                    </label>
                  </div>
                  <label>
                    <span>Excerpt</span>
                    <textarea
                      rows={2}
                      value={form.excerpt}
                      placeholder="Shown on the blog listing and used as the share/meta description."
                      onChange={(event) => setForm((prev) => ({ ...prev, excerpt: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    <span>Body (HTML)</span>
                    <textarea
                      rows={16}
                      className="portal-prose-input"
                      value={form.body}
                      placeholder={'<p>Opening paragraph...</p><h2>A section heading</h2><p>More detail...</p>'}
                      onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
                      required
                    />
                    <small className="portal-muted">
                      Sanitised HTML, not markdown — use &lt;p&gt;, &lt;h2&gt;, &lt;ul&gt;/&lt;li&gt; and &lt;a href&gt; tags.
                    </small>
                  </label>
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Cover image URL</span>
                      <input
                        value={form.coverImageUrl}
                        placeholder="https://..."
                        onChange={(event) => setForm((prev) => ({ ...prev, coverImageUrl: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Author</span>
                      <input
                        value={form.author}
                        onChange={(event) => setForm((prev) => ({ ...prev, author: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="portal-inline-actions">
                    <button type="submit" className="portal-ghost-btn" disabled={saving}>
                      {saving ? 'Saving...' : 'Save Draft'}
                    </button>
                    <button
                      type="button"
                      className="portal-primary-btn"
                      disabled={saving}
                      onClick={(event) => void onSubmit(event as unknown as FormEvent<HTMLFormElement>, true)}
                    >
                      {saving ? 'Saving...' : editingId ? 'Save & Publish' : 'Publish'}
                    </button>
                    {editingId ? (
                      <button type="button" className="portal-ghost-btn" onClick={resetForm}>
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </form>
              </article>
            ) : null}

            <article className="portal-card">
              <h2 style={{ marginTop: 0 }}>All Posts</h2>
              <div className="portal-list-stack">
                {posts.length === 0 ? (
                  <div className="portal-empty-state">
                    No posts yet. Add the first one above.
                  </div>
                ) : (
                  posts.map((post) => (
                    <div key={post.id} className="portal-record">
                      <div className="portal-list-row">
                        <div>
                          <strong>{post.title}</strong>
                          <span className={`portal-chip${post.publishedAt ? '' : ' is-muted'}`} style={{ marginLeft: 8 }}>
                            {post.publishedAt ? 'Published' : 'Draft'}
                          </span>
                          <p className="portal-muted">
                            <code>/blog/{post.slug}</code> · by {post.author}
                          </p>
                          <p>{post.excerpt}</p>
                        </div>
                        <div className="portal-action-row">
                          {post.publishedAt ? (
                            <Link href={`/blog/${post.slug}`} target="_blank" className="portal-inline-btn">
                              View
                            </Link>
                          ) : null}
                          {canUpdate ? (
                            <button type="button" className="portal-inline-btn" onClick={() => startEdit(post)}>
                              Edit
                            </button>
                          ) : null}
                          {canUpdate ? (
                            <button type="button" className="portal-inline-btn" onClick={() => void onTogglePublish(post)}>
                              {post.publishedAt ? 'Unpublish' : 'Publish'}
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => void onDelete(post)}>
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
