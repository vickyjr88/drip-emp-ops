"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EliteLayout } from '../../../../components/elite-layout';
import { PortalShell } from '../../../components/portal-shell';

type AuthRole = {
  id: string;
  name: string;
  permissions: string[];
};

type AuthProfile = {
  id: string;
  email: string;
  role: string | null;
  roles?: AuthRole[];
  permissions?: string[];
};

type Unit = {
  id: string;
  blockId: string;
  unitNumber: string;
  floorNumber: number;
  sizeSqm: string | number;
  priceKes: string | number;
  priceUsd: string | number;
  status: 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'RENTED' | 'BLOCKED';
  bedrooms: number;
  parkingSlots: number;
  hasBalcony: boolean;
  hasStore: boolean;
  featuredImageUrl?: string | null;
  galleryImages?: string[] | null;
  floorPlanUrl?: string | null;
};

type UnitFormState = {
  unitNumber: string;
  floorNumber: string;
  sizeSqm: string;
  priceKes: string;
  priceUsd: string;
  status: Unit['status'];
  bedrooms: string;
  parkingSlots: string;
  hasBalcony: boolean;
  hasStore: boolean;
  featuredImageUrl: string;
  galleryImages: string[];
  floorPlanUrl: string;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const TOKEN_KEY = 'drl_access_token';

async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error((await response.text()) || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function uploadMedia(file: File, token: string) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_BASE_URL}/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) {
    throw new Error((await response.text()) || 'Upload failed');
  }
  return (await response.json()) as { objectKey: string; url: string };
}

function hasPermission(profile: AuthProfile | null | undefined, permission: string) {
  if (!profile) return false;
  if (profile.role === 'ADMIN' || profile.roles?.some((role) => role.name === 'ADMIN')) return true;
  return Boolean(profile.permissions?.includes(permission));
}

function stripGallery(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function makeForm(unit?: Unit | null): UnitFormState {
  const gallery = stripGallery(unit?.galleryImages);
  const featured = unit?.featuredImageUrl || '';
  const galleryWithFeatured = featured && !gallery.includes(featured) ? [featured, ...gallery] : gallery;

  return {
    unitNumber: unit?.unitNumber || '',
    floorNumber: unit ? String(unit.floorNumber) : '',
    sizeSqm: unit ? String(unit.sizeSqm) : '',
    priceKes: unit ? String(unit.priceKes) : '',
    priceUsd: unit ? String(unit.priceUsd) : '',
    status: unit?.status || 'AVAILABLE',
    bedrooms: unit ? String(unit.bedrooms) : '0',
    parkingSlots: unit ? String(unit.parkingSlots) : '0',
    hasBalcony: unit?.hasBalcony || false,
    hasStore: unit?.hasStore || false,
    featuredImageUrl: featured || galleryWithFeatured[0] || '',
    galleryImages: galleryWithFeatured,
    floorPlanUrl: unit?.floorPlanUrl || '',
  };
}

export default function UnitEditClient({ unitId }: { unitId: string }) {
  const router = useRouter();
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const floorPlanInputRef = useRef<HTMLInputElement | null>(null);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFloorPlan, setUploadingFloorPlan] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [form, setForm] = useState<UnitFormState>(makeForm());

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);
      const unit = await apiRequest<Unit>(`/units/${unitId}`, { method: 'GET' }, authToken);
      setProfile(nextProfile);
      setForm(makeForm(unit));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load unit.');
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const canUpdate = hasPermission(profile, 'unit.update');
  const roleLabel = useMemo(() => {
    if (!profile) return 'Unassigned';
    if (profile.roles?.length) return profile.roles.map((role) => role.name).join(', ');
    return profile.role || 'Unassigned';
  }, [profile]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  async function addImageFiles(fileList: FileList | File[]) {
    if (!token) return;
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      setErrorMessage('Please drop image files only.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    try {
      const uploaded = await Promise.all(files.map((file) => uploadMedia(file, token)));
      const urls = uploaded.map((item) => item.url).filter(Boolean);
      if (!urls.length) return;

      setForm((prev) => {
        const galleryImages = [...prev.galleryImages, ...urls];
        const featuredImageUrl = prev.featuredImageUrl || urls[0];
        return { ...prev, galleryImages, featuredImageUrl };
      });
      setFeedback(`${urls.length} image${urls.length === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload images.');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) {
      void addImageFiles(event.dataTransfer.files);
    }
  }

  function removeImage(url: string) {
    setForm((prev) => {
      const galleryImages = prev.galleryImages.filter((image) => image !== url);
      const featuredImageUrl = prev.featuredImageUrl === url ? galleryImages[0] || '' : prev.featuredImageUrl;
      return { ...prev, galleryImages, featuredImageUrl };
    });
  }

  function setFeatured(url: string) {
    setForm((prev) => {
      const galleryImages = prev.galleryImages.includes(url) ? prev.galleryImages : [url, ...prev.galleryImages];
      return { ...prev, featuredImageUrl: url, galleryImages };
    });
    setFeedback('Featured photo updated.');
  }

  async function onFloorPlanSelected(file: File) {
    if (!token) return;
    setUploadingFloorPlan(true);
    setErrorMessage(null);
    try {
      const uploaded = await uploadMedia(file, token);
      setForm((prev) => ({ ...prev, floorPlanUrl: uploaded.url }));
      setFeedback('Floor plan uploaded.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload floor plan.');
    } finally {
      setUploadingFloorPlan(false);
    }
  }

  function removeFloorPlan() {
    setForm((prev) => ({ ...prev, floorPlanUrl: '' }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdate) return;

    setSaving(true);
    setErrorMessage(null);
    setFeedback(null);

    try {
      const galleryImages = [...form.galleryImages];
      if (form.featuredImageUrl && !galleryImages.includes(form.featuredImageUrl)) {
        galleryImages.unshift(form.featuredImageUrl);
      }

      await apiRequest(
        `/units/${unitId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            unitNumber: form.unitNumber.trim(),
            floorNumber: Number(form.floorNumber),
            sizeSqm: form.sizeSqm,
            priceKes: form.priceKes,
            priceUsd: form.priceUsd,
            status: form.status,
            bedrooms: Number(form.bedrooms || 0),
            parkingSlots: Number(form.parkingSlots || 0),
            hasBalcony: form.hasBalcony,
            hasStore: form.hasStore,
            featuredImageUrl: form.featuredImageUrl || undefined,
            galleryImages,
            floorPlanUrl: form.floorPlanUrl || undefined,
          }),
        },
        token,
      );

      setFeedback('Unit updated.');
      router.push(`/portal/units/${unitId}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save unit.');
    } finally {
      setSaving(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading unit editor...</article>
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

  if (!canUpdate) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main is-authenticated">
          <section className="lp-container portal-auth-section">
            <PortalShell
              active="units"
              pageTitle="Edit Unit"
              email={profile.email}
              roleLabel={roleLabel}
              permissionCount={profile.permissions?.length || 0}
              canReadRbac={hasPermission(profile, 'role.read')}
              onLogout={onLogout}
            >
              <article className="portal-card portal-role-banner">
                You do not have permission to update units.
              </article>
              <Link
                href={`/portal/units/${unitId}`}
                className="portal-ghost-btn"
                style={{ display: 'inline-flex', width: 'fit-content' }}
              >
                Back to Unit
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
            active="units"
            pageTitle="Edit Unit"
            pageSubtitle="Update unit details, upload the floor plan, and manage gallery photos. Nominate one photo as featured."
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={
              hasPermission(profile, 'role.read') ||
              hasPermission(profile, 'permission.read') ||
              hasPermission(profile, 'user.read')
            }
            onLogout={onLogout}
          >
            {feedback ? <article className="portal-card portal-feedback">{feedback}</article> : null}
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            <form className="portal-stack-grid" onSubmit={onSubmit}>
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>Unit Details</h2>
                  <Link href={`/portal/units/${unitId}`} className="portal-inline-btn">
                    Cancel
                  </Link>
                </div>

                <div className="portal-entity-form">
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Unit Number</span>
                      <input
                        value={form.unitNumber}
                        onChange={(event) => setForm((prev) => ({ ...prev, unitNumber: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Floor Number</span>
                      <input
                        type="number"
                        value={form.floorNumber}
                        onChange={(event) => setForm((prev) => ({ ...prev, floorNumber: event.target.value }))}
                        required
                      />
                    </label>
                  </div>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Size (sqm)</span>
                      <input
                        value={form.sizeSqm}
                        onChange={(event) => setForm((prev) => ({ ...prev, sizeSqm: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Price (KES)</span>
                      <input
                        value={form.priceKes}
                        onChange={(event) => setForm((prev) => ({ ...prev, priceKes: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Price (USD)</span>
                      <input
                        value={form.priceUsd}
                        onChange={(event) => setForm((prev) => ({ ...prev, priceUsd: event.target.value }))}
                        required
                      />
                    </label>
                  </div>
                  <div className="portal-entity-grid-3">
                    <label>
                      <span>Status</span>
                      <select
                        value={form.status}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, status: event.target.value as Unit['status'] }))
                        }
                      >
                        <option value="AVAILABLE">AVAILABLE</option>
                        <option value="RESERVED">RESERVED</option>
                        <option value="SOLD">SOLD</option>
                        <option value="RENTED">RENTED</option>
                        <option value="BLOCKED">BLOCKED</option>
                      </select>
                    </label>
                    <label>
                      <span>Bedrooms</span>
                      <input
                        type="number"
                        min={0}
                        value={form.bedrooms}
                        onChange={(event) => setForm((prev) => ({ ...prev, bedrooms: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Parking Slots</span>
                      <input
                        type="number"
                        min={0}
                        value={form.parkingSlots}
                        onChange={(event) => setForm((prev) => ({ ...prev, parkingSlots: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="portal-check-row">
                    <label className="portal-check">
                      <input
                        type="checkbox"
                        checked={form.hasBalcony}
                        onChange={(event) => setForm((prev) => ({ ...prev, hasBalcony: event.target.checked }))}
                      />
                      <span>Balcony</span>
                    </label>
                    <label className="portal-check">
                      <input
                        type="checkbox"
                        checked={form.hasStore}
                        onChange={(event) => setForm((prev) => ({ ...prev, hasStore: event.target.checked }))}
                      />
                      <span>Store</span>
                    </label>
                  </div>
                </div>
              </article>

              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Floor Plan</h2>
                    <p className="portal-muted">Upload a floor plan image or PDF for this unit.</p>
                  </div>
                  <button
                    type="button"
                    className="portal-inline-btn"
                    disabled={uploadingFloorPlan}
                    onClick={() => floorPlanInputRef.current?.click()}
                  >
                    {uploadingFloorPlan ? 'Uploading...' : form.floorPlanUrl ? 'Replace Floor Plan' : 'Upload Floor Plan'}
                  </button>
                </div>

                {form.floorPlanUrl ? (
                  <div className="portal-featured-preview">
                    <div className="portal-featured-preview-label">Current floor plan</div>
                    {/\.(png|jpe?g|webp|gif)$/i.test(form.floorPlanUrl) ? (
                      <img src={form.floorPlanUrl} alt="Unit floor plan" />
                    ) : (
                      <p style={{ margin: 0 }}>
                        <a href={form.floorPlanUrl} target="_blank" rel="noreferrer">
                          Open floor plan document
                        </a>
                      </p>
                    )}
                    <div className="portal-gallery-item-actions">
                      <button type="button" className="portal-inline-btn is-danger" onClick={removeFloorPlan}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="portal-empty-state">No floor plan uploaded yet.</div>
                )}

                <input
                  ref={floorPlanInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  hidden
                  onChange={(event) => {
                    if (event.target.files?.length) {
                      void onFloorPlanSelected(event.target.files[0]);
                      event.target.value = '';
                    }
                  }}
                />
              </article>

              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Unit Photos</h2>
                    <p className="portal-muted">
                      Drag and drop multiple images, then mark one as featured for listings and unit cards.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="portal-inline-btn"
                    disabled={uploading}
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    {uploading ? 'Uploading...' : 'Browse Images'}
                  </button>
                </div>

                {form.featuredImageUrl ? (
                  <div className="portal-featured-preview">
                    <div className="portal-featured-preview-label">Current featured photo</div>
                    <img src={form.featuredImageUrl} alt="Featured unit" />
                  </div>
                ) : null}

                <div
                  className={`portal-dropzone${dragging ? ' is-dragging' : ''}${uploading ? ' is-disabled' : ''}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (!uploading) setDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!uploading) setDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setDragging(false);
                  }}
                  onDrop={(event) => {
                    if (uploading) return;
                    onDrop(event);
                  }}
                  onClick={() => {
                    if (!uploading) galleryInputRef.current?.click();
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (!uploading) galleryInputRef.current?.click();
                    }
                  }}
                >
                  <strong>{uploading ? 'Uploading images…' : 'Drag & drop unit photos here'}</strong>
                  <p>PNG, JPG, or WebP. You can select multiple files. Click any photo below to set it as featured.</p>
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      if (event.target.files?.length) {
                        void addImageFiles(event.target.files);
                        event.target.value = '';
                      }
                    }}
                  />
                </div>

                <div className="portal-project-gallery-grid" style={{ marginTop: 16 }}>
                  {form.galleryImages.length === 0 ? (
                    <div className="portal-empty-state">No photos uploaded yet.</div>
                  ) : (
                    form.galleryImages.map((image, index) => {
                      const isFeatured = form.featuredImageUrl === image;
                      return (
                        <div
                          key={`${image}-${index}`}
                          className={`portal-project-gallery-item${isFeatured ? ' is-featured' : ''}`}
                        >
                          <button
                            type="button"
                            className="portal-gallery-image-btn"
                            onClick={() => setFeatured(image)}
                            title="Set as featured"
                          >
                            <img src={image} alt={`Unit photo ${index + 1}`} className="portal-project-gallery-thumb" />
                          </button>
                          <div className="portal-gallery-item-actions">
                            {isFeatured ? (
                              <span className="portal-featured-badge">Featured</span>
                            ) : (
                              <button type="button" className="portal-inline-btn" onClick={() => setFeatured(image)}>
                                Set Featured
                              </button>
                            )}
                            <button type="button" className="portal-inline-btn is-danger" onClick={() => removeImage(image)}>
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </article>

              <div className="portal-inline-actions">
                <button type="submit" className="portal-primary-btn" disabled={saving || uploading || uploadingFloorPlan}>
                  {saving ? 'Saving...' : uploading || uploadingFloorPlan ? 'Wait for uploads...' : 'Save Unit'}
                </button>
                <Link href={`/portal/units/${unitId}`} className="portal-ghost-btn">
                  Back to Unit
                </Link>
              </div>
            </form>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
