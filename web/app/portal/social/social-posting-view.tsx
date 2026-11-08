"use client";

/**
 * The marketing engine: products posted to the Facebook Page on their own, at set times, three a day by default.
 *
 * The server does the work (backend/src/social-posting). This screen is the control room: the switch, the times, what the next
 * post would look like, a button to post one now, and every post the engine has made, with a way to take one down. The engine is
 * off until it is switched on here, because every post is public.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { usePortalDialog } from '../components/portal-dialog';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { ServerPage } from '../components/server-pager';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Status = {
  allowed: boolean; configured: boolean; facebookEnabled: boolean; times: string[]; cooldownDays: number; updatedBy: string;
  nextPostAt: string | null; today: { slotKey: string; status: string }[]; posted: number; failed: number; skipped: number; removed: number;
};
type Post = {
  id: string; slotKey: string; productName: string | null; productSlug: string | null; caption: string | null; imageUrl: string | null;
  status: string; detail: string | null; externalId: string | null; postedAt: string | null; triggeredBy: string; createdAt: string;
};
type Preview = { product: { id: string; name: string; slug: string; imageUrl: string; brand: string | null } | null; caption: string | null };

const STATUS: Record<string, { label: string; cls: string }> = {
  POSTED: { label: 'Posted', cls: 'portal-chip is-success' },
  FAILED: { label: 'Failed', cls: 'portal-chip is-danger' },
  RETRY: { label: 'Retrying', cls: 'portal-chip' },
  PENDING: { label: 'Posting', cls: 'portal-chip' },
  SKIPPED: { label: 'Skipped', cls: 'portal-chip is-muted' },
  REMOVED: { label: 'Taken down', cls: 'portal-chip is-muted' },
};

const errorText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  try { const m = JSON.parse(raw)?.message; return Array.isArray(m) ? m.join(' ') : m || raw; } catch { return raw; }
};

const facebookUrl = (id: string) => `https://www.facebook.com/${id}`;

export function SocialPostingView() {
  const [initialized, setInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [times, setTimes] = useState<string[]>([]);
  const [draftTime, setDraftTime] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'save' | 'preview' | 'post' | 'toggle' | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const dialog = usePortalDialog();

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    setToken(saved);
    setInitialized(true);
    if (saved) void loadProfile(saved).then(setProfile).catch(() => setProfile(null));
  }, []);

  const load = useCallback(async (authToken: string) => {
    try {
      const [s, p] = await Promise.all([
        apiRequest<Status>('/social-posting/status', { method: 'GET' }, authToken),
        apiRequest<ServerPage<Post>>('/social-posting/posts?take=20', { method: 'GET' }, authToken).catch(() => null),
      ]);
      setStatus(s);
      setTimes(s.times);
      setPosts(p?.items ?? []);
    } catch (error) {
      setErrorMessage(error);
    }
  }, [setErrorMessage]);

  useEffect(() => { if (token) void load(token); }, [token, load]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  if (!initialized || (token && !profile)) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
          <article className="portal-card portal-loading">Loading...</article>
        </section></main>
      </EliteLayout>
    );
  }
  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
          <article className="portal-card">
            <h2>Authentication required</h2>
            <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>Go to Portal Login</Link>
          </article>
        </section></main>
      </EliteLayout>
    );
  }

  const canRead = hasPermission(profile, 'social-post.read');
  const canEdit = hasPermission(profile, 'social-setting.update');
  const canPost = hasPermission(profile, 'social-post.create');
  const canRemove = hasPermission(profile, 'social-post.delete');
  const timesChanged = Boolean(status) && JSON.stringify(times) !== JSON.stringify(status!.times);

  async function save(patch: { facebookEnabled?: boolean; times?: string[] }, kind: 'save' | 'toggle', message: string) {
    setBusy(kind);
    try {
      const next = await apiRequest<Status>('/social-posting/settings', { method: 'PUT', body: JSON.stringify(patch) }, token!);
      setStatus(next);
      setTimes(next.times);
      setFeedback(message);
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function onToggle(on: boolean) {
    if (!status) return;
    if (on) {
      const ok = await dialog.confirm({
        title: 'Start posting to the Page automatically?',
        message: `From the next set time (${status.times.join(', ')} Nairobi time) a product that is in stock is posted to the Facebook Page with no one checking it first, up to ${status.times.length} a day. Every post is public. You can pause it here at any time and take a post down from the list below.`,
        confirmLabel: 'Start posting',
      });
      if (!ok) return;
    }
    await save({ facebookEnabled: on }, 'toggle', on ? 'Automatic posting is on.' : 'Automatic posting is paused.');
  }

  function addTime(e: FormEvent) {
    e.preventDefault();
    const value = draftTime.trim();
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(value)) { setErrorMessage('Enter a time like 09:30.'); return; }
    const padded = value.length === 4 ? `0${value}` : value;
    if (!times.includes(padded)) setTimes([...times, padded].sort().slice(0, 6));
    setDraftTime('');
  }

  async function onPreview() {
    setBusy('preview');
    try {
      setPreview(await apiRequest<Preview>('/social-posting/preview', { method: 'GET' }, token!));
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function onPostNow() {
    const ok = await dialog.confirm({
      title: 'Post to the Facebook Page now?',
      message: preview?.product
        ? `“${preview.product.name}” will be posted publicly right now, as shown in the preview.`
        : 'The engine will choose the next product and post it publicly right now.',
      confirmLabel: 'Post now',
    });
    if (!ok) return;
    setBusy('post');
    try {
      const result = await apiRequest<{ status: string; detail?: string | null; productName?: string | null }>('/social-posting/post-now', { method: 'POST', body: JSON.stringify(preview?.product ? { productId: preview.product.id } : {}) }, token!);
      if (result.status === 'POSTED') setFeedback(`Posted${result.productName ? `: ${result.productName}` : ''}.`);
      else setErrorMessage(`Not posted: ${result.detail || result.status}`);
      setPreview(null);
      await load(token!);
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(post: Post) {
    const ok = await dialog.confirm({ title: 'Take this post down?', message: `“${post.productName ?? 'This post'}” will be deleted from the Facebook Page, with its likes and comments.`, confirmLabel: 'Take down' });
    if (!ok) return;
    try {
      const result = await apiRequest<{ removed: boolean; detail: string | null }>(`/social-posting/posts/${post.id}`, { method: 'DELETE' }, token!);
      if (result.removed) setFeedback('Taken down.'); else setErrorMessage(result.detail || 'Could not take it down.');
      await load(token!);
    } catch (error) {
      setErrorMessage(errorText(error));
    }
  }

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="social"
            pageTitle="Social Posting"
            pageSubtitle="Products posted to the Facebook Page automatically."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}
            {feedback ? <article className="portal-card portal-success">{feedback}</article> : null}
            {!canRead ? (
              <article className="portal-card"><p className="portal-muted" style={{ margin: 0 }}>Your role cannot see social posting.</p></article>
            ) : !status ? (
              <article className="portal-card portal-loading">Loading...</article>
            ) : (
              <>
                <article className="portal-card" style={{ marginBottom: 20 }}>
                  <div className="portal-card-header-row">
                    <h2 style={{ margin: 0 }}>Automatic posting</h2>
                    <span className={status.facebookEnabled && status.allowed && status.configured ? 'portal-chip is-success' : 'portal-chip is-muted'}>
                      {!status.configured ? 'Page not connected' : !status.allowed ? 'Switched off on the server' : status.facebookEnabled ? 'On' : 'Paused'}
                    </span>
                  </div>
                  <p className="portal-muted">
                    At each time below a product that is in stock, has a photo and has not been posted lately goes to the Facebook Page: the photo, price, sizes
                    available, a link to the product, our WhatsApp and the shop&apos;s location. Visits from these links show as Facebook in Insights, and comments
                    on them get the private Messenger reply. Nothing is checked by a person first, so it stays off until you turn it on.
                  </p>
                  {!status.configured ? <p className="portal-error">The server has no Facebook Page connected (FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN).</p> : null}
                  {!status.allowed ? <p className="portal-error">Posting is switched off on the server (SOCIAL_POSTING=false), whatever is set here.</p> : null}
                  {canEdit ? (
                    <div className="portal-action-row">
                      <button type="button" className={status.facebookEnabled ? 'portal-inline-btn' : 'portal-primary-btn'} disabled={busy === 'toggle' || !status.configured}
                        onClick={() => void onToggle(!status.facebookEnabled)}>
                        {busy === 'toggle' ? 'Saving…' : status.facebookEnabled ? 'Pause posting' : 'Start posting'}
                      </button>
                    </div>
                  ) : null}
                  {status.nextPostAt ? <p style={{ marginBottom: 0 }}>Next post: <strong>{formatDateTime(status.nextPostAt)}</strong></p> : null}
                  <p className="portal-muted" style={{ marginBottom: 0 }}>
                    {status.posted} posted, {status.failed} failed, {status.skipped} skipped{status.removed ? `, ${status.removed} taken down` : ''}. A product is not posted again for {status.cooldownDays} days.
                  </p>

                  <div style={{ marginTop: 16 }}>
                    <strong>Times (Nairobi)</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
                      {times.length === 0 ? <span className="portal-muted">None: nothing will be posted.</span> : times.map((t) => (
                        <span key={t} className="portal-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {t}
                          {canEdit ? <button type="button" aria-label={`Remove ${t}`} onClick={() => setTimes(times.filter((x) => x !== t))} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button> : null}
                        </span>
                      ))}
                    </div>
                    {canEdit ? (
                      <form onSubmit={addTime} className="portal-inline-form" style={{ maxWidth: 320 }}>
                        <input value={draftTime} onChange={(e) => setDraftTime(e.target.value)} placeholder="09:30" aria-label="Add a time" disabled={times.length >= 6} />
                        <button type="submit" className="portal-inline-btn" disabled={!draftTime.trim() || times.length >= 6}>Add</button>
                      </form>
                    ) : null}
                    {canEdit && timesChanged ? (
                      <div className="portal-action-row" style={{ marginTop: 12 }}>
                        <button type="button" className="portal-primary-btn" disabled={busy === 'save'} onClick={() => void save({ times }, 'save', 'Saved. The next post follows these times.')}>{busy === 'save' ? 'Saving…' : 'Save times'}</button>
                        <button type="button" className="portal-inline-btn" onClick={() => setTimes(status.times)}>Undo</button>
                      </div>
                    ) : null}
                  </div>
                </article>

                <article className="portal-card" style={{ marginBottom: 20 }}>
                  <h2 style={{ marginTop: 0 }}>See the next post, or post now</h2>
                  <div className="portal-action-row">
                    <button type="button" className="portal-inline-btn" disabled={busy === 'preview'} onClick={() => void onPreview()}>{busy === 'preview' ? 'Choosing…' : 'Preview the next post'}</button>
                    {canPost ? <button type="button" className="portal-primary-btn" disabled={busy === 'post' || !status.configured || !status.allowed} onClick={() => void onPostNow()}>{busy === 'post' ? 'Posting…' : 'Post now'}</button> : null}
                  </div>
                  {preview ? (
                    preview.product ? (
                      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={preview.product.imageUrl} alt={preview.product.name} style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 8 }} />
                        <div style={{ flex: 1, minWidth: 240 }}>
                          <p className="portal-muted" style={{ margin: 0 }}>This is what would be posted. Nothing has been posted yet.</p>
                          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '8px 0 0', padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.04)', fontSize: 14 }}>{preview.caption}</pre>
                        </div>
                      </div>
                    ) : <p className="portal-muted" style={{ marginTop: 12 }}>No product is ready: none is in stock with a photo that has not been posted lately.</p>
                  ) : null}
                </article>

                <article className="portal-card">
                  <h2 style={{ marginTop: 0 }}>Posts</h2>
                  {posts.length === 0 ? <p className="portal-muted">Nothing has been posted yet.</p> : (
                    <div className="portal-list-stack">
                      {posts.map((p) => {
                        const s = STATUS[p.status] ?? { label: p.status, cls: 'portal-chip' };
                        return (
                          <div key={p.id} className="portal-record" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            {p.imageUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.imageUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} /> : null}
                            <div style={{ flex: 1 }}>
                              <strong>{p.productName ?? 'No product'}</strong>
                              <span className={s.cls} style={{ marginLeft: 8 }}>{s.label}</span>
                              <p className="portal-muted" style={{ margin: '2px 0 0' }}>
                                {formatDateTime(p.postedAt ?? p.createdAt)} · {p.triggeredBy === 'schedule' ? 'scheduled' : `by ${p.triggeredBy}`}{p.detail ? ` · ${p.detail}` : ''}
                              </p>
                              {p.status === 'POSTED' && p.externalId ? (
                                <p style={{ margin: '4px 0 0' }}>
                                  <a href={facebookUrl(p.externalId)} target="_blank" rel="noreferrer">View on Facebook</a>
                                  {canRemove ? <> · <button type="button" className="portal-inline-btn" onClick={() => void onRemove(p)}>Take down</button></> : null}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
