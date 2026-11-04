"use client";

/**
 * Media library: every image on the site in one place. Upload new ones, find existing ones by name, and crop.
 *
 * Cropping replaces the image itself: it keeps its address, so everything already using it shows the cropped picture
 * and nothing breaks. The previous version is kept and can be restored here. The same library feeds the "Choose
 * existing" picker wherever an image is set (products, page content, blog covers).
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { CropDialog } from '../components/crop-dialog';
import { MediaItem, MediaLibraryPage, formatBytes, freshUrl } from '../components/media-types';
import { usePortalDialog } from '../components/portal-dialog';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, hasPermission, loadProfile, roleLabelFor, uploadMedia,
} from '../accounting/lib';

export default function MediaPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [images, setImages] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [listing, setListing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cropping, setCropping] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const loadPage = useCallback(
    async (authToken: string, after?: string) => {
      setListing(true);
      try {
        const params = new URLSearchParams({ limit: '60' });
        if (after) params.set('cursor', after);
        if (search) params.set('search', search);
        const data = await apiRequest<MediaLibraryPage>(`/media/library?${params}`, { method: 'GET' }, authToken);
        setImages((prev) => (after ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
        setTotal(data.total);
      } catch (error) {
        setErrorMessage(error);
      } finally {
        setListing(false);
      }
    },
    [search, setErrorMessage],
  );

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void (async () => {
      try {
        setProfile(await loadProfile(token));
      } catch (error) {
        setErrorMessage(error);
      } finally {
        setLoading(false);
      }
    })();
  }, [initialized, token, setErrorMessage]);

  useEffect(() => {
    if (token && profile) void loadPage(token);
  }, [token, profile, loadPage]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const upload = async (files: File[]) => {
    const pictures = files.filter((file) => file.type.startsWith('image/'));
    if (!token || pictures.length === 0) {
      if (files.length) setErrorMessage('Only image files can be added to the media library.');
      return;
    }
    setUploading({ done: 0, total: pictures.length });
    const added: MediaItem[] = [];
    try {
      for (const file of pictures) {
        const result = await uploadMedia(file, token);
        added.push({
          id: result.id ?? result.objectKey,
          objectKey: result.objectKey,
          url: result.url,
          fileName: result.fileName,
          contentType: result.contentType,
          sizeBytes: result.sizeBytes ?? file.size,
          width: result.width,
          height: result.height,
          uploadedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          hasPreviousVersion: false,
        });
        setUploading({ done: added.length, total: pictures.length });
      }
      setFeedback(`${added.length} image${added.length === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      if (added.length) {
        setImages((prev) => [...added, ...prev]);
        setTotal((prev) => prev + added.length);
        setSelectedId(added[0].id);
      }
      setUploading(null);
    }
  };

  const selected = images.find((image) => image.id === selectedId) ?? null;

  /** The image after a crop or restore: same place in the library, same address, new picture. */
  const replaceItem = (updated: MediaItem) => {
    setImages((prev) => prev.map((image) => (image.id === updated.id ? updated : image)));
  };

  const onCropped = (updated: MediaItem) => {
    setCropping(null);
    replaceItem(updated);
    setFeedback('Image cropped. Everywhere it is used now shows the cropped picture.');
  };

  const makeSquare = async (item: MediaItem) => {
    if (!token) return;
    const ok = await dialog.confirm({
      title: 'Make this image square?',
      message: 'It is cropped to a centred square and replaces the image everywhere it is used. You can restore the previous version afterwards.',
      confirmLabel: 'Make square',
    });
    if (!ok) return;
    try {
      onCropped(await apiRequest<MediaItem>('/media/crop', { method: 'POST', body: JSON.stringify({ assetId: item.id, square: true }) }, token));
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const restore = async (item: MediaItem) => {
    if (!token) return;
    const ok = await dialog.confirm({
      title: 'Restore the previous version?',
      message: 'The last crop is undone and the picture goes back to how it was, everywhere it is used.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    try {
      replaceItem(await apiRequest<MediaItem>('/media/restore', { method: 'POST', body: JSON.stringify({ assetId: item.id }) }, token));
      setFeedback('Previous version restored.');
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const copyLink = async (item: MediaItem) => {
    try {
      await navigator.clipboard.writeText(item.url);
      setFeedback('Image link copied.');
    } catch {
      setErrorMessage('Could not copy the link. Select it and copy it by hand.');
    }
  };

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading media library...</article>
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
            active="media"
            pageSubtitle="Every image on the site. Upload, find and crop here, then reuse them from any image field."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void loadPage(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <article
              className={`portal-card portal-media-drop${dragging ? ' is-dragging' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void upload(Array.from(event.dataTransfer.files));
              }}
            >
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Media library</h2>
                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                    {total} image{total === 1 ? '' : 's'}. Drop pictures anywhere in this box to upload them.
                  </p>
                </div>
                <div className="portal-action-row">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      event.target.value = '';
                      void upload(files);
                    }}
                  />
                  <button type="button" className="portal-primary-btn" disabled={uploading !== null} onClick={() => fileInput.current?.click()}>
                    {uploading ? `Uploading ${uploading.done} of ${uploading.total}…` : 'Upload images'}
                  </button>
                </div>
              </div>

              <div className="list-toolbar">
                <input
                  type="search"
                  placeholder="Search by file name…"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  aria-label="Search images by file name"
                />
              </div>

              <div className="portal-media-layout">
                <div>
                  {!listing && images.length === 0 ? (
                    <div className="portal-empty-state">
                      {search ? 'No image matches that name.' : 'No images yet. Upload one to start the library.'}
                    </div>
                  ) : (
                    <div className="portal-media-grid">
                      {images.map((image) => (
                        <button
                          key={image.id}
                          type="button"
                          className={`portal-media-tile${image.id === selectedId ? ' is-selected' : ''}`}
                          onClick={() => setSelectedId(image.id)}
                          aria-pressed={image.id === selectedId}
                          title={image.fileName}
                        >
                          <img src={freshUrl(image)} alt={image.fileName} loading="lazy" />
                          {image.hasPreviousVersion ? <span className="portal-image-picker-badge">Cropped</span> : null}
                          <span className="portal-media-caption">{image.fileName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {listing ? <p className="portal-muted">Loading images…</p> : null}
                  {cursor && !listing ? (
                    <button type="button" className="portal-inline-btn" onClick={() => token && void loadPage(token, cursor)}>
                      Load more
                    </button>
                  ) : null}
                </div>

                <aside className="portal-media-detail" aria-label="Image details">
                  {selected ? (
                    <>
                      <img className="portal-media-preview" src={freshUrl(selected)} alt={selected.fileName} />
                      <h3 style={{ margin: '12px 0 4px', wordBreak: 'break-word' }}>{selected.fileName}</h3>
                      <p className="portal-muted" style={{ margin: 0 }}>
                        {selected.width && selected.height ? `${selected.width} × ${selected.height} px · ` : ''}
                        {formatBytes(selected.sizeBytes)} · {formatDateTime(selected.uploadedAt)}
                      </p>
                      {selected.hasPreviousVersion ? (
                        <p className="portal-muted" style={{ margin: '8px 0 0' }}>This image has been cropped.</p>
                      ) : null}
                      <div className="portal-action-row" style={{ marginTop: 12 }}>
                        <button type="button" className="portal-primary-btn" onClick={() => setCropping(selected)}>
                          Crop
                        </button>
                        <button type="button" className="portal-primary-btn" onClick={() => void makeSquare(selected)}>
                          Make square
                        </button>
                      </div>
                      <div className="portal-action-row" style={{ marginTop: 8 }}>
                        {selected.hasPreviousVersion ? (
                          <button type="button" className="portal-ghost-btn" onClick={() => void restore(selected)}>
                            Restore previous version
                          </button>
                        ) : null}
                        <button type="button" className="portal-ghost-btn" onClick={() => void copyLink(selected)}>
                          Copy link
                        </button>
                        <a className="portal-ghost-btn" href={selected.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      </div>
                      <p className="portal-muted" style={{ marginTop: 12, fontSize: 13 }}>
                        Cropping replaces this image everywhere it is used, and keeps the earlier version so you can restore it.
                      </p>
                    </>
                  ) : (
                    <p className="portal-muted">Select an image to see its details and crop it.</p>
                  )}
                </aside>
              </div>
            </article>

            {cropping ? <CropDialog image={cropping} token={token} onClose={() => setCropping(null)} onCropped={onCropped} /> : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
