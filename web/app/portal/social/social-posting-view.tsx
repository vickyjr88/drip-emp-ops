"use client";

/**
 * The marketing engine: products posted to Facebook, Instagram, Threads, X and TikTok on their own, at set times, three a day by default.
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

type Channel = 'FACEBOOK' | 'THREADS' | 'INSTAGRAM' | 'X' | 'TIKTOK';
type ChannelStatus = { configured: boolean; enabled: boolean; nextPostAt: string | null; posted: number; failed: number; skipped: number; removed: number };
type TikTokMode = 'INBOX' | 'DIRECT';
type Status = {
  allowed: boolean; times: string[]; cooldownDays: number; updatedBy: string;
  facebook: ChannelStatus;
  threads: ChannelStatus & { tokenExpiresAt: string | null; tokenError: string | null };
  instagram: ChannelStatus & { account: string | null; problem: string | null };
  x: ChannelStatus;
  tiktok: ChannelStatus & { clientConfigured: boolean; mode: TikTokMode; account: string | null; connectedAt: string | null; refreshExpiresAt: string | null; error: string | null };
};
type SettingsPatch = { facebookEnabled?: boolean; threadsEnabled?: boolean; instagramEnabled?: boolean; xEnabled?: boolean; tiktokEnabled?: boolean; tiktokMode?: TikTokMode; times?: string[] };
type Post = {
  id: string; channel: Channel; slotKey: string; productName: string | null; productSlug: string | null; caption: string | null; imageUrl: string | null;
  status: string; detail: string | null; externalId: string | null; permalink: string | null; postedAt: string | null; triggeredBy: string; createdAt: string;
};
type Preview = { product: { id: string; name: string; slug: string; imageUrl: string; brand: string | null } | null; caption: string | null };
type Previews = { previews: Record<Channel, Preview> };

const CHANNELS: Channel[] = ['FACEBOOK', 'INSTAGRAM', 'THREADS', 'X', 'TIKTOK'];
const CHANNEL_LABEL: Record<Channel, string> = { FACEBOOK: 'Facebook Page', THREADS: 'Threads', INSTAGRAM: 'Instagram', X: 'X', TIKTOK: 'TikTok' };
const CHANNEL_SHORT: Record<Channel, string> = { FACEBOOK: 'Facebook', THREADS: 'Threads', INSTAGRAM: 'Instagram', X: 'X', TIKTOK: 'TikTok' };
const STATUS_KEY = { FACEBOOK: 'facebook', THREADS: 'threads', INSTAGRAM: 'instagram', X: 'x', TIKTOK: 'tiktok' } as const;
const ENABLE_KEY = { FACEBOOK: 'facebookEnabled', THREADS: 'threadsEnabled', INSTAGRAM: 'instagramEnabled', X: 'xEnabled', TIKTOK: 'tiktokEnabled' } as const;

/** X charges for each post made through its API, and about thirteen times more when the post has a link (which these always do). */
const X_COST_PER_POST_USD = 0.2;

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
  const [preview, setPreview] = useState<Previews | null>(null);
  const [busy, setBusy] = useState<'save' | 'preview' | 'post' | 'toggle' | 'connect' | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const dialog = usePortalDialog();

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    setToken(saved);
    setInitialized(true);
    if (saved) void loadProfile(saved).then(setProfile).catch(() => setProfile(null));
  }, []);

  // TikTok sends the browser back here after its sign-in, with the outcome in the address.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected') === 'tiktok') setFeedback('TikTok is connected. Choose how it should post, then start posting.');
    else if (q.get('connect_error')) setErrorMessage(`TikTok was not connected: ${q.get('connect_error')}`);
    if (q.get('connected') || q.get('connect_error')) window.history.replaceState(null, '', window.location.pathname);
  }, [setFeedback, setErrorMessage]);

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

  async function save(patch: SettingsPatch, kind: 'save' | 'toggle', message: string) {
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

  async function onToggle(channel: Channel, on: boolean) {
    if (!status) return;
    if (on) {
      const perMonth = status.times.length * 30;
      const extra: Record<Channel, string> = {
        FACEBOOK: '',
        THREADS: '',
        INSTAGRAM: ' Instagram does not let this system delete a post: a bad one has to be deleted in the Instagram app.',
        X: ` X charges for every post, about $${X_COST_PER_POST_USD.toFixed(2)} each with a link: roughly $${(perMonth * X_COST_PER_POST_USD).toFixed(0)} a month at ${status.times.length} a day, taken from the credit you have bought in the X developer console. When the credit runs out the posts fail until you add more.`,
        TIKTOK: status.tiktok.mode === 'INBOX'
          ? ' Each post is sent to the TikTok inbox of the connected account: someone has to open TikTok and finish it. TikTok does not let this system delete a post.'
          : ' Each post is published publicly on TikTok at once. TikTok does not let this system delete a post.',
      };
      const ok = await dialog.confirm({
        title: `Start posting to ${CHANNEL_LABEL[channel]} automatically?`,
        message: `From the next set time (${status.times.join(', ')} Nairobi time) a product that is in stock is posted to ${CHANNEL_LABEL[channel]} with no one checking it first, up to ${status.times.length} a day. ${channel === 'TIKTOK' && status.tiktok.mode === 'INBOX' ? '' : 'Every post is public. '}You can pause it here at any time.${extra[channel]}`,
        confirmLabel: 'Start posting',
      });
      if (!ok) return;
    }
    await save({ [ENABLE_KEY[channel]]: on } as SettingsPatch, 'toggle', `${CHANNEL_SHORT[channel]}: automatic posting is ${on ? 'on' : 'paused'}.`);
  }

  async function onConnectTikTok() {
    setBusy('connect');
    try {
      const out = await apiRequest<{ url?: string; error?: string }>('/social-posting/connect/tiktok', { method: 'GET' }, token!);
      if (out.url) { window.location.href = out.url; return; }
      setErrorMessage(out.error || 'TikTok could not be reached.');
    } catch (error) {
      setErrorMessage(errorText(error));
    }
    setBusy(null);
  }

  async function onDisconnectTikTok() {
    const ok = await dialog.confirm({ title: 'Disconnect TikTok?', message: 'Automatic posting to TikTok stops and the saved TikTok login is forgotten. You can connect again at any time.', confirmLabel: 'Disconnect', danger: true });
    if (!ok) return;
    try {
      setStatus(await apiRequest<Status>('/social-posting/connect/tiktok', { method: 'DELETE' }, token!));
      setFeedback('TikTok is disconnected.');
    } catch (error) {
      setErrorMessage(errorText(error));
    }
  }

  async function onTikTokMode(mode: TikTokMode) {
    if (mode === 'DIRECT') {
      const ok = await dialog.confirm({
        title: 'Publish TikTok posts directly?',
        message: 'TikTok only allows this after it has audited the app. Until then every direct post fails with an error. Direct posts go public immediately, with no chance to edit them first.',
        confirmLabel: 'Publish directly',
      });
      if (!ok) return;
    }
    await save({ tiktokMode: mode }, 'save', mode === 'INBOX' ? 'TikTok posts go to the TikTok inbox to finish.' : 'TikTok posts are published directly.');
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
      setPreview(await apiRequest<Previews>('/social-posting/preview', { method: 'GET' }, token!));
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function onPostNow(channel: Channel) {
    const shown = preview?.previews?.[channel]?.product ?? null;
    const ok = await dialog.confirm({
      title: `Post to ${CHANNEL_LABEL[channel]} now?`,
      message: shown
        ? `“${shown.name}” will be posted publicly right now, as shown in the preview.`
        : 'The engine will choose the next product and post it publicly right now.',
      confirmLabel: 'Post now',
    });
    if (!ok) return;
    setBusy('post');
    try {
      const result = await apiRequest<{ status: string; detail?: string | null; productName?: string | null }>('/social-posting/post-now', { method: 'POST', body: JSON.stringify({ channel, ...(shown ? { productId: shown.id } : {}) }) }, token!);
      if (result.status === 'POSTED') setFeedback(`Posted to ${CHANNEL_SHORT[channel]}${result.productName ? `: ${result.productName}` : ''}.`);
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
    const ok = await dialog.confirm({ title: 'Take this post down?', message: `“${post.productName ?? 'This post'}” will be deleted from ${CHANNEL_LABEL[post.channel] ?? 'its channel'}, with its likes and comments.`, confirmLabel: 'Take down' });
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
            pageSubtitle="Products posted to Facebook, Instagram, Threads, X and TikTok automatically."
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
                  <h2 style={{ margin: 0 }}>Automatic posting</h2>
                  <p className="portal-muted">
                    At each time below a product that is in stock, has a photo and has not been posted lately goes out: the photo, price, sizes
                    available, how to buy (a link on Facebook, Threads and X; the address and WhatsApp number on Instagram and TikTok, where links cannot be clicked) and the shop&apos;s
                    location. Visits from the links show in Insights by channel, and comments on Facebook posts get the private Messenger reply. Nothing is checked by a
                    person first, so each channel stays off until you turn it on.
                  </p>
                  {!status.allowed ? <p className="portal-error">Posting is switched off on the server (SOCIAL_POSTING=false), whatever is set here.</p> : null}

                  {CHANNELS.map((channel) => {
                    const c: ChannelStatus = status[STATUS_KEY[channel]];
                    const live = c.enabled && c.configured && status.allowed;
                    const tt = status.tiktok;
                    return (
                      <div key={channel} style={{ borderTop: '1px solid var(--eef-border)', paddingTop: 14, marginTop: 14 }}>
                        <div className="portal-card-header-row">
                          <strong>{CHANNEL_LABEL[channel]}</strong>
                          <span className={live ? 'portal-chip is-success' : 'portal-chip is-muted'}>
                            {!c.configured ? 'Not connected' : !status.allowed ? 'Switched off on the server' : c.enabled ? 'On' : 'Paused'}
                          </span>
                        </div>
                        {!c.configured ? (
                          <p className="portal-error" style={{ margin: '8px 0 0' }}>
                            {channel === 'FACEBOOK' ? 'The server has no Facebook Page connected (FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN).' : null}
                            {channel === 'THREADS' ? 'The server has no Threads login (THREADS_ACCESS_TOKEN). See docs/SOCIAL-POSTING.md for how to get one.' : null}
                            {channel === 'INSTAGRAM' ? 'Instagram posts through the Facebook Page connection, which is not set up yet (FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN). See docs/SOCIAL-POSTING.md.' : null}
                            {channel === 'X' ? 'The server has no X keys (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_TOKEN_SECRET). See docs/SOCIAL-POSTING.md for how to get them.' : null}
                            {channel === 'TIKTOK' && !tt.clientConfigured ? 'The server has no TikTok app (TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET). See docs/SOCIAL-POSTING.md for how to create one.' : null}
                            {channel === 'TIKTOK' && tt.clientConfigured ? 'No TikTok account is connected yet.' : null}
                          </p>
                        ) : null}
                        {channel === 'THREADS' && status.threads.configured ? (
                          <p className="portal-muted" style={{ margin: '8px 0 0' }}>
                            {status.threads.tokenExpiresAt ? `Threads login renews itself; good until ${formatDateTime(status.threads.tokenExpiresAt)}.` : 'Threads login: its end date is not known yet (checked every few minutes).'}
                            {status.threads.tokenError ? ` ${status.threads.tokenError}` : ''}
                          </p>
                        ) : null}
                        {channel === 'INSTAGRAM' && status.instagram.configured ? (
                          status.instagram.problem ? (
                            <p className="portal-error" style={{ margin: '8px 0 0' }}>{status.instagram.problem} The Facebook token must have the instagram_basic and instagram_content_publish permissions, and the Instagram account must be a Professional account linked to the Page.</p>
                          ) : (
                            <p className="portal-muted" style={{ margin: '8px 0 0' }}>
                              {status.instagram.account ? <>Posts to <strong>{status.instagram.account}</strong>. </> : null}
                              Instagram does not let this system delete a post; do that in the Instagram app.
                            </p>
                          )
                        ) : null}
                        {channel === 'X' && status.x.configured ? (
                          <p className="portal-muted" style={{ margin: '8px 0 0' }}>
                            X charges for every post, about ${X_COST_PER_POST_USD.toFixed(2)} each with a link: roughly ${(status.times.length * 30 * X_COST_PER_POST_USD).toFixed(0)} a month at {status.times.length} a day. It is paid from credit bought in the X developer console; when that runs out, posts fail until you add more.
                          </p>
                        ) : null}
                        {channel === 'TIKTOK' && tt.configured ? (
                          <div style={{ margin: '8px 0 0' }}>
                            <p className="portal-muted" style={{ margin: 0 }}>
                              Connected{tt.account ? <> as <strong>{tt.account}</strong></> : ''}{tt.refreshExpiresAt ? `; the connection lasts until ${formatDateTime(tt.refreshExpiresAt)} and renews each time it is used` : ''}.
                              TikTok does not let this system delete a post.
                            </p>
                            {tt.error ? <p className="portal-error" style={{ margin: '6px 0 0' }}>{tt.error}</p> : null}
                            <fieldset style={{ border: 0, padding: 0, margin: '10px 0 0' }} disabled={!canEdit}>
                              <legend style={{ fontWeight: 700, fontSize: 13 }}>How posts reach TikTok</legend>
                              <label className="portal-check" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '6px 0' }}>
                                <input type="radio" name="tiktok-mode" checked={tt.mode === 'INBOX'} onChange={() => void onTikTokMode('INBOX')} />
                                <span><strong>Send to the TikTok inbox</strong> (works now). Each post waits in the account&apos;s TikTok inbox; someone opens TikTok and presses post.</span>
                              </label>
                              <label className="portal-check" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '6px 0' }}>
                                <input type="radio" name="tiktok-mode" checked={tt.mode === 'DIRECT'} onChange={() => void onTikTokMode('DIRECT')} />
                                <span><strong>Publish directly</strong> (only after TikTok has audited the app). Posts go public on their own.</span>
                              </label>
                            </fieldset>
                          </div>
                        ) : null}
                        <p className="portal-muted" style={{ margin: '8px 0 0' }}>
                          {c.posted} posted, {c.failed} failed, {c.skipped} skipped{c.removed ? `, ${c.removed} taken down` : ''}.
                          {c.nextPostAt ? <> Next post: <strong>{formatDateTime(c.nextPostAt)}</strong>.</> : ''}
                        </p>
                        {canEdit ? (
                          <div className="portal-action-row" style={{ marginTop: 10 }}>
                            {channel === 'TIKTOK' && tt.clientConfigured ? (
                              <button type="button" className={tt.configured ? 'portal-inline-btn' : 'portal-primary-btn'} disabled={busy === 'connect'} onClick={() => void onConnectTikTok()}>
                                {busy === 'connect' ? 'Opening TikTok…' : tt.configured ? 'Connect a different account' : 'Connect TikTok'}
                              </button>
                            ) : null}
                            <button type="button" className={c.enabled ? 'portal-inline-btn' : 'portal-primary-btn'} disabled={busy === 'toggle' || !c.configured}
                              onClick={() => void onToggle(channel, !c.enabled)}>
                              {busy === 'toggle' ? 'Saving…' : c.enabled ? 'Pause posting' : 'Start posting'}
                            </button>
                            {channel === 'TIKTOK' && tt.configured ? <button type="button" className="portal-inline-btn" onClick={() => void onDisconnectTikTok()}>Disconnect</button> : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  <div style={{ marginTop: 18, borderTop: '1px solid var(--eef-border)', paddingTop: 14 }}>
                    <strong>Times (Nairobi), the same for every channel</strong>
                    <p className="portal-muted" style={{ margin: '2px 0 0' }}>A product is not posted again to the same channel for {status.cooldownDays} days.</p>
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
                  <h2 style={{ marginTop: 0 }}>See the next posts, or post now</h2>
                  <div className="portal-action-row">
                    <button type="button" className="portal-inline-btn" disabled={busy === 'preview'} onClick={() => void onPreview()}>{busy === 'preview' ? 'Choosing…' : 'Preview the next posts'}</button>
                  </div>
                  {preview ? CHANNELS.map((channel) => {
                    const p = preview.previews[channel];
                    const c: ChannelStatus = status[STATUS_KEY[channel]];
                    return (
                      <div key={channel} style={{ marginTop: 18 }}>
                        <strong>{CHANNEL_LABEL[channel]}</strong>
                        {p?.product ? (
                          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.product.imageUrl} alt={p.product.name} style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 8 }} />
                            <div style={{ flex: 1, minWidth: 240 }}>
                              <p className="portal-muted" style={{ margin: 0 }}>This is what would be posted. Nothing has been posted yet.</p>
                              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit', margin: '8px 0', padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.04)', fontSize: 14 }}>{p.caption}</pre>
                              {canPost ? (
                                <button type="button" className="portal-primary-btn" disabled={busy === 'post' || !c.configured || !status.allowed} onClick={() => void onPostNow(channel)}>
                                  {busy === 'post' ? 'Posting…' : `Post to ${CHANNEL_SHORT[channel]} now`}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : <p className="portal-muted" style={{ marginTop: 8 }}>No product is ready: none is in stock with a photo that has not been posted lately.</p>}
                      </div>
                    );
                  }) : (
                    <p className="portal-muted" style={{ marginBottom: 0 }}>Preview first, then post exactly what you saw.</p>
                  )}
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
                              <span className="portal-chip is-muted" style={{ marginLeft: 8 }}>{CHANNEL_SHORT[p.channel] ?? p.channel}</span>
                              <span className={s.cls} style={{ marginLeft: 8 }}>{s.label}</span>
                              <p className="portal-muted" style={{ margin: '2px 0 0' }}>
                                {formatDateTime(p.postedAt ?? p.createdAt)} · {p.triggeredBy === 'schedule' ? 'scheduled' : `by ${p.triggeredBy}`}{p.detail ? ` · ${p.detail}` : ''}
                              </p>
                              {p.status === 'POSTED' && p.externalId ? (
                                <p style={{ margin: '4px 0 0' }}>
                                  {p.permalink || p.channel === 'FACEBOOK'
                                    ? <a href={p.permalink || facebookUrl(p.externalId)} target="_blank" rel="noreferrer">View on {CHANNEL_SHORT[p.channel] ?? 'the channel'}</a>
                                    : <span className="portal-muted">Open {CHANNEL_SHORT[p.channel] ?? 'the channel'} to see it</span>}
                                  {canRemove && p.channel !== 'INSTAGRAM' && p.channel !== 'TIKTOK'
                                    ? <> · <button type="button" className="portal-inline-btn" onClick={() => void onRemove(p)}>Take down</button></>
                                    : <span className="portal-muted"> · To remove it, delete it in the {CHANNEL_SHORT[p.channel]} app</span>}
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
