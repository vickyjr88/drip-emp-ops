"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type Project = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  location: string | null;
  featuredImageUrl?: string | null;
  galleryImages?: string[] | null;
  isArchived: boolean;
};

type ProjectFormState = {
  code: string;
  name: string;
  description: string;
  location: string;
  featuredImageUrl: string;
  galleryImages: string[];
  isArchived: boolean;
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

function makeForm(project?: Project | null): ProjectFormState {
  const gallery = stripGallery(project?.galleryImages);
  const featured = project?.featuredImageUrl || '';
  const galleryWithFeatured =
    featured && !gallery.includes(featured) ? [featured, ...gallery] : gallery;

  return {
    code: project?.code || '',
    name: project?.name || '',
    description: project?.description || '',
    location: project?.location || '',
    featuredImageUrl: featured || galleryWithFeatured[0] || '',
    galleryImages: galleryWithFeatured,
    isArchived: project?.isArchived || false,
  };
}

export default function ProjectEditClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [form, setForm] = useState<ProjectFormState>(makeForm());

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);
      const project = await apiRequest<Project>(`/projects/${projectId}`, { method: 'GET' }, authToken);
      setProfile(nextProfile);
      setForm(makeForm(project));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load project.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const canUpdate = hasPermission(profile, 'project.update');
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

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) {
      void addImageFiles(event.dataTransfer.files);
    }
  }

  function removeImage(url: string) {
    setForm((prev) => {
      const galleryImages = prev.galleryImages.filter((image) => image !== url);
      const featuredImageUrl =
        prev.featuredImageUrl === url ? galleryImages[0] || '' : prev.featuredImageUrl;
      return { ...prev, galleryImages, featuredImageUrl };
    });
  }

  function setFeatured(url: string) {
    setForm((prev) => {
      const galleryImages = prev.galleryImages.includes(url)
        ? prev.galleryImages
        : [url, ...prev.galleryImages];
      return { ...prev, featuredImageUrl: url, galleryImages };
    });
    setFeedback('Featured image updated.');
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
        `/projects/${projectId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            location: form.location.trim() || undefined,
            featuredImageUrl: form.featuredImageUrl || undefined,
            galleryImages,
            isArchived: form.isArchived,
          }),
        },
        token,
      );

      setFeedback('Project updated.');
      router.push(`/portal/projects/${projectId}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save project.');
    } finally {
      setSaving(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading project editor...</article>
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
              active="projects"
              pageTitle="Edit Project"
              email={profile.email}
              roleLabel={roleLabel}
              permissionCount={profile.permissions?.length || 0}
              canReadRbac={hasPermission(profile, 'role.read')}
              onLogout={onLogout}
            >
              <article className="portal-card portal-role-banner">
                You do not have permission to update projects.
              </article>
              <Link
                href={`/portal/projects/${projectId}`}
                className="portal-ghost-btn"
                style={{ display: 'inline-flex', width: 'fit-content' }}
              >
                Back to Project
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
            active="projects"
            pageTitle="Edit Project"
            pageSubtitle="Update project details and manage gallery images. Nominate one image as featured."
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
                  <h2 style={{ margin: 0 }}>Project Details</h2>
                  <Link href={`/portal/projects/${projectId}`} className="portal-inline-btn">
                    Cancel
                  </Link>
                </div>

                <div className="portal-entity-form">
                  <div className="portal-entity-grid-2">
                    <label>
                      <span>Code</span>
                      <input
                        value={form.code}
                        onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      <span>Name</span>
                      <input
                        value={form.name}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    <span>Description</span>
                    <textarea
                      rows={4}
                      value={form.description}
                      onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Location</span>
                    <input
                      value={form.location}
                      onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                    />
                  </label>
                  <label className="portal-check">
                    <input
                      type="checkbox"
                      checked={form.isArchived}
                      onChange={(event) => setForm((prev) => ({ ...prev, isArchived: event.target.checked }))}
                    />
                    <span>Archived</span>
                  </label>
                </div>
              </article>

              <article className="portal-card">
                <div className="portal-card-header-row">
                  <div>
                    <h2 style={{ margin: 0 }}>Project Images</h2>
                    <p className="portal-muted">
                      Drag and drop multiple images, then mark one as featured for listings and project cards.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="portal-inline-btn"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? 'Uploading...' : 'Browse Images'}
                  </button>
                </div>

                {form.featuredImageUrl ? (
                  <div className="portal-featured-preview">
                    <div className="portal-featured-preview-label">Current featured image</div>
                    <img src={form.featuredImageUrl} alt="Featured project" />
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
                    if (!uploading) fileInputRef.current?.click();
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (!uploading) fileInputRef.current?.click();
                    }
                  }}
                >
                  <strong>{uploading ? 'Uploading images…' : 'Drag & drop project images here'}</strong>
                  <p>PNG, JPG, or WebP. You can select multiple files. Click any image below to set it as featured.</p>
                  <input
                    ref={fileInputRef}
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
                    <div className="portal-empty-state">No images uploaded yet.</div>
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
                            <img src={image} alt={`Project image ${index + 1}`} className="portal-project-gallery-thumb" />
                          </button>
                          <div className="portal-gallery-item-actions">
                            {isFeatured ? (
                              <span className="portal-featured-badge">Featured</span>
                            ) : (
                              <button
                                type="button"
                                className="portal-inline-btn"
                                onClick={() => setFeatured(image)}
                              >
                                Set Featured
                              </button>
                            )}
                            <button
                              type="button"
                              className="portal-inline-btn is-danger"
                              onClick={() => removeImage(image)}
                            >
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
                <button type="submit" className="portal-primary-btn" disabled={saving || uploading}>
                  {saving ? 'Saving...' : uploading ? 'Wait for uploads...' : 'Save Project'}
                </button>
                <Link href={`/portal/projects/${projectId}`} className="portal-ghost-btn">
                  Back to Project
                </Link>
              </div>
            </form>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
