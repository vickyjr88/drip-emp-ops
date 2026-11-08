"use client";

/**
 * WhatsApp Status kit. WhatsApp has no way to post a Status automatically, so each day the server prepares a few ready pictures
 * (the product, its price, the sizes in stock, how to order) and the text that goes with them. This screen is meant for a phone:
 * Share opens the phone's share sheet, where WhatsApp > My status takes the picture and the text in one go. Mark as posted
 * moves that product to the back of the line.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { API_BASE_URL, AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, hasPermission, loadProfile, roleLabelFor } from '../accounting/lib';

type Item = { id: string; status: string; productName: string | null; productSlug: string | null; postedAt: string | null; available: boolean; caption: string | null };

const errorText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  try { const m = JSON.parse(raw)?.message; return Array.isArray(m) ? m.join(' ') : m || raw; } catch { return raw; }
};
const fileName = (item: Item) => `status-${(item.productSlug || item.id).slice(0, 40)}.jpg`;

export function StatusKitView() {
  const [initialized, setInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [images, setImages] = useState<Record<string, { url: string; blob: Blob } | 'failed'>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const loading = useRef<Set<string>>(new Set());

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    setToken(saved);
    setInitialized(true);
    if (saved) void loadProfile(saved).then(setProfile).catch(() => setProfile(null));
  }, []);

  const load = useCallback(async (authToken: string) => {
    try {
      setItems(await apiRequest<Item[]>('/social-posting/status-kit', { method: 'GET' }, authToken));
    } catch (error) {
      setErrorMessage(errorText(error));
    }
  }, [setErrorMessage]);

  useEffect(() => { if (token) void load(token); }, [token, load]);

  // The pictures need the login to fetch, so they are fetched here and shown from memory.
  useEffect(() => {
    if (!token || !items) return;
    for (const item of items) {
      if (!item.available || images[item.id] || loading.current.has(item.id)) continue;
      loading.current.add(item.id);
      void fetch(`${API_BASE_URL}/social-posting/status-kit/${item.id}/image`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          const blob = await r.blob();
          setImages((prev) => ({ ...prev, [item.id]: { url: URL.createObjectURL(blob), blob } }));
        })
        .catch(() => setImages((prev) => ({ ...prev, [item.id]: 'failed' })))
        .finally(() => loading.current.delete(item.id));
    }
  }, [items, token, images]);

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
  const canEdit = hasPermission(profile, 'social-post.update');

  async function share(item: Item) {
    const image = images[item.id];
    if (!image || image === 'failed') return;
    const file = new File([image.blob], fileName(item), { type: 'image/jpeg' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    try {
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: item.caption || undefined });
      } else {
        download(item);
        setFeedback('This browser cannot share pictures straight to WhatsApp, so it was downloaded. Open WhatsApp > Status and add it from your gallery.');
      }
    } catch (error) {
      // The person closed the share sheet: nothing went wrong.
      if ((error as Error)?.name !== 'AbortError') setErrorMessage(errorText(error));
    }
  }

  function download(item: Item) {
    const image = images[item.id];
    if (!image || image === 'failed') return;
    const a = document.createElement('a');
    a.href = image.url;
    a.download = fileName(item);
    a.click();
  }

  async function copy(item: Item) {
    try {
      await navigator.clipboard.writeText(item.caption || '');
      setFeedback('Text copied.');
    } catch {
      setErrorMessage('Could not copy. Press and hold the text to copy it.');
    }
  }

  async function act(item: Item, action: 'swap' | 'posted') {
    setBusy(`${action}-${item.id}`);
    try {
      setItems(await apiRequest<Item[]>(`/social-posting/status-kit/${item.id}/${action}`, { method: 'POST' }, token!));
      setFeedback(action === 'posted' ? 'Marked as posted. It will not be offered again soon.' : 'Swapped for the next product.');
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
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
            active="statusKit"
            pageTitle="WhatsApp Status"
            pageSubtitle="Today's Status pictures, ready to post from your phone."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}
            {feedback ? <article className="portal-card portal-success">{feedback}</article> : null}
            {!canRead ? (
              <article className="portal-card"><p className="portal-muted" style={{ margin: 0 }}>Your role cannot see the Status kit.</p></article>
            ) : (
              <>
                <article className="portal-card" style={{ marginBottom: 20 }}>
                  <h2 style={{ marginTop: 0 }}>How to post</h2>
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    <li>Open this page on the phone that has the shop&apos;s WhatsApp.</li>
                    <li>Tap <strong>Share to WhatsApp</strong> under a picture, then choose <strong>My status</strong>. The text comes with it; you can edit it.</li>
                    <li>Tap <strong>Mark as posted</strong> so that product is not offered again soon.</li>
                  </ol>
                  <p className="portal-muted" style={{ marginBottom: 0 }}>
                    WhatsApp does not let any system post a Status for you, so this is as automatic as it gets: the products, pictures and text are chosen
                    and made each day. People who reply to a Status land in the shop&apos;s chat.
                  </p>
                </article>

                {!items ? (
                  <article className="portal-card portal-loading">Preparing today&apos;s pictures...</article>
                ) : items.length === 0 ? (
                  <article className="portal-card"><p className="portal-muted" style={{ margin: 0 }}>No product is ready: none is in stock with a photo.</p></article>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 16 }}>
                    {items.map((item) => {
                      const image = images[item.id];
                      const posted = item.status === 'POSTED';
                      return (
                        <article key={item.id} className="portal-card" style={{ minWidth: 0 }}>
                          <div className="portal-card-header-row">
                            <strong>{item.productName ?? 'Product'}</strong>
                            <span className={posted ? 'portal-chip is-success' : 'portal-chip is-muted'}>{posted ? 'Posted' : 'To post'}</span>
                          </div>
                          {!item.available ? (
                            <p className="portal-error" style={{ margin: '8px 0' }}>This product is no longer in stock with a photo. Swap it for another.</p>
                          ) : image && image !== 'failed' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={image.url} alt={item.productName ?? 'Status picture'} style={{ width: '100%', maxWidth: 360, height: 'auto', maxHeight: 'none', borderRadius: 10, margin: '12px 0', display: 'block' }} />
                          ) : image === 'failed' ? (
                            <p className="portal-error" style={{ margin: '8px 0' }}>The picture could not be made. Try again, or swap the product.</p>
                          ) : (
                            <div className="portal-loading" style={{ width: '100%', maxWidth: 360, aspectRatio: '9 / 16', borderRadius: 10, margin: '12px 0' }}>Making the picture...</div>
                          )}
                          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit', margin: '0 0 12px', padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.04)', fontSize: 13 }}>{item.caption}</pre>
                          <div className="portal-action-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                            <button type="button" className="portal-primary-btn" disabled={!image || image === 'failed'} onClick={() => void share(item)}>Share to WhatsApp</button>
                            <button type="button" className="portal-inline-btn" disabled={!image || image === 'failed'} onClick={() => download(item)}>Download</button>
                            <button type="button" className="portal-inline-btn" onClick={() => void copy(item)}>Copy text</button>
                          </div>
                          {canEdit ? (
                            <div className="portal-action-row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                              {!posted ? <button type="button" className="portal-inline-btn" disabled={busy === `posted-${item.id}`} onClick={() => void act(item, 'posted')}>Mark as posted</button> : null}
                              {!posted ? <button type="button" className="portal-inline-btn" disabled={busy === `swap-${item.id}`} onClick={() => void act(item, 'swap')}>Swap product</button> : null}
                            </div>
                          ) : null}
                          {posted && item.postedAt ? <p className="portal-muted" style={{ margin: '8px 0 0' }}>Posted {formatDateTime(item.postedAt)}</p> : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
