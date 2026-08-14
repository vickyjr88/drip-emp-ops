"use client";

/**
 * Create or edit a floor plan.
 *
 * A plan is a template: its figures are copied onto units when they are
 * created, and never pushed onto units that already exist. That is stated on
 * the form, because the alternative assumption -- that editing a plan updates
 * everything built to it -- is the one someone would reasonably make, and it
 * would be wrong in a way that matters once a unit has been sold on the
 * figures it was advertised with.
 */

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { sqftInputToSqm, sqmToSqftInput } from '../../lib/area';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { usePortalDialog } from '../components/portal-dialog';
import { ImagePicker } from '../components/image-picker';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  canReadRbacFor,
  hasPermission,
  loadProfile,
  roleLabelFor,
  uploadMedia,
} from '../accounting/lib';

type Project = { id: string; code: string; name: string };

type FloorPlan = {
  id: string;
  projectId: string;
  name: string;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: string | number;
  priceKes?: string | number | null;
  description?: string | null;
  imageUrls?: string[] | null;
  featuredImageUrl?: string | null;
  displayOrder?: number | null;
  _count?: { units: number };
};

type FormState = {
  projectId: string;
  name: string;
  bedrooms: string;
  bathrooms: string;
  sizeSqm: string;
  /** Stored metric value the form loaded with; see sqftInputToSqm. */
  originalSizeSqm?: string | number | null;
  priceKes: string;
  description: string;
  imageUrls: string[];
  featuredImageUrl: string;
  displayOrder: string;
};

export function FloorPlanFormClient({ planId }: { planId?: string }) {
  const router = useRouter();
  const dialog = usePortalDialog();
  const isEdit = Boolean(planId);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Arriving from a project's editor via ?projectId= should land on that
  // project already chosen, rather than making the operator pick it again.
  const searchParams = useSearchParams();
  const presetProjectId = searchParams.get('projectId') || '';

  const [form, setForm] = useState<FormState>({
    projectId: presetProjectId,
    name: '',
    bedrooms: '0',
    bathrooms: '0',
    sizeSqm: '',
    priceKes: '',
    description: '',
    imageUrls: [],
    featuredImageUrl: '',
    displayOrder: '',
  });

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(
    async (authToken: string) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const nextProfile = await loadProfile(authToken);
        setProfile(nextProfile);

        setProjects(
          hasPermission(nextProfile, 'project.read')
            ? await apiRequest<Project[]>('/projects', { method: 'GET' }, authToken)
            : [],
        );

        if (planId) {
          const existing = await apiRequest<FloorPlan>(
            `/floor-plans/${planId}`,
            { method: 'GET' },
            authToken,
          );
          setPlan(existing);
          setForm({
            projectId: existing.projectId,
            name: existing.name,
            bedrooms: String(existing.bedrooms ?? 0),
            bathrooms: String(existing.bathrooms ?? 0),
            sizeSqm: sqmToSqftInput(existing.sizeSqm),
            originalSizeSqm: existing.sizeSqm ?? null,
            priceKes: existing.priceKes != null ? String(existing.priceKes) : '',
            description: existing.description || '',
            imageUrls: Array.isArray(existing.imageUrls) ? existing.imageUrls : [],
            featuredImageUrl: existing.featuredImageUrl || '',
            displayOrder: existing.displayOrder != null ? String(existing.displayOrder) : '',
          });
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load this floor plan.');
      } finally {
        setLoading(false);
      }
    },
    [planId],
  );

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const canCreate = hasPermission(profile, 'floor-plan.create');
  const canUpdate = hasPermission(profile, 'floor-plan.update');
  const canDelete = hasPermission(profile, 'floor-plan.delete');
  const allowed = isEdit ? canUpdate : canCreate;
  const unitCount = plan?._count?.units ?? 0;

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  async function addImages(fileList: FileList | File[]) {
    if (!token) return;
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      setErrorMessage('Please choose image files only.');
      return;
    }
    setUploading(true);
    setErrorMessage(null);
    try {
      const uploaded = await Promise.all(files.map((file) => uploadMedia(file, token)));
      const urls = uploaded.map((item) => item.url).filter(Boolean);
      setForm((prev) => ({ ...prev, imageUrls: [...prev.imageUrls, ...urls] }));
      setFeedback(`${urls.length} drawing${urls.length === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload the drawing.');
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !allowed) return;

    setSaving(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      const payload = {
        projectId: form.projectId,
        name: form.name.trim(),
        bedrooms: Number(form.bedrooms || 0),
        bathrooms: Number(form.bathrooms || 0),
        sizeSqm: sqftInputToSqm(form.sizeSqm, form.originalSizeSqm) ?? 0,
        ...(form.priceKes ? { priceKes: Number(form.priceKes) } : {}),
        ...(form.description ? { description: form.description } : {}),
        imageUrls: form.imageUrls,
        featuredImageUrl: form.featuredImageUrl || undefined,
        ...(form.displayOrder ? { displayOrder: Number(form.displayOrder) } : {}),
      };

      if (isEdit && planId) {
        await apiRequest(`/floor-plans/${planId}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
        router.push('/portal/floor-plans');
        return;
      }

      await apiRequest('/floor-plans', { method: 'POST', body: JSON.stringify(payload) }, token);
      setFeedback(`${payload.name} created.`);
      // Keep the project selected: plans are added several at a time to one
      // development.
      setForm((prev) => ({
        ...prev,
        name: '',
        sizeSqm: '',
        priceKes: '',
        description: '',
        imageUrls: [],
        featuredImageUrl: '',
        displayOrder: '',
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save the floor plan.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!token || !planId || !canDelete) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Floor Plan',
      // Units keep their copied figures, so this is less destructive than it
      // sounds -- say so rather than letting the count look alarming.
      message:
        unitCount > 0
          ? `${unitCount} unit${unitCount === 1 ? '' : 's'} reference this plan. They keep their own bedrooms, size and price; only the link and the drawing are lost. Continue?`
          : 'Delete this floor plan? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      await apiRequest(`/floor-plans/${planId}`, { method: 'DELETE' }, token);
      router.push('/portal/floor-plans');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete the floor plan.');
      setSaving(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading...</article>
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
            active="floorPlans"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle={isEdit ? 'Edit Floor Plan' : 'Add Floor Plan'}
            pageSubtitle="Layouts offered in a development. Units created from a plan copy its figures."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={onLogout}
          >

            {!allowed ? (
              <article className="portal-card portal-role-banner">
                This account cannot {isEdit ? 'edit' : 'create'} floor plans. Ask an administrator for
                the floor-plan.{isEdit ? 'update' : 'create'} permission.
              </article>
            ) : null}

            <article className="portal-card">
              <div className="portal-card-header-row">
                <div>
                  <p className="portal-kicker">{isEdit ? 'Edit' : 'New'}</p>
                  <h2 style={{ margin: '4px 0 0' }}>{isEdit ? plan?.name : 'Add a floor plan'}</h2>
                  <p className="portal-muted" style={{ margin: '6px 0 0' }}>
                    {isEdit && unitCount > 0
                      ? `${unitCount} unit${unitCount === 1 ? '' : 's'} were created from this plan. Editing it does not change them — they keep the figures they were created with.`
                      : 'Figures here are copied onto a unit when it is created from this plan. Later edits do not change existing units.'}
                  </p>
                </div>
                <Link href="/portal/floor-plans" className="portal-ghost-btn">
                  All plans
                </Link>
              </div>

              <form className="portal-entity-form" onSubmit={onSubmit}>
                <label>
                  <span>Project</span>
                  <select
                    value={form.projectId}
                    onChange={(event) => setForm((prev) => ({ ...prev, projectId: event.target.value }))}
                    required
                    disabled={!allowed}
                  >
                    <option value="">Select a project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.code} — {project.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Plan name</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Plan A — 2 Bedroom"
                    required
                    disabled={!allowed}
                  />
                </label>

                <div className="portal-entity-grid-3">
                  <label>
                    <span>Bedrooms</span>
                    <input
                      type="number"
                      min="0"
                      value={form.bedrooms}
                      onChange={(event) => setForm((prev) => ({ ...prev, bedrooms: event.target.value }))}
                      disabled={!allowed}
                    />
                  </label>
                  <label>
                    <span>Bathrooms</span>
                    <input
                      type="number"
                      min="0"
                      value={form.bathrooms}
                      onChange={(event) => setForm((prev) => ({ ...prev, bathrooms: event.target.value }))}
                      disabled={!allowed}
                    />
                  </label>
                  <label>
                    <span>Size (sq ft)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.sizeSqm}
                      onChange={(event) => setForm((prev) => ({ ...prev, sizeSqm: event.target.value }))}
                      required
                      disabled={!allowed}
                    />
                  </label>
                </div>

                <div className="portal-entity-grid-3">
                  <label>
                    <span>Indicative price (KES)</span>
                    <input
                      type="number"
                      min="0"
                      value={form.priceKes}
                      placeholder="Optional"
                      onChange={(event) => setForm((prev) => ({ ...prev, priceKes: event.target.value }))}
                      disabled={!allowed}
                    />
                  </label>
                  <label>
                    <span>Display order</span>
                    <input
                      type="number"
                      min="1"
                      value={form.displayOrder}
                      placeholder="Lowest first"
                      onChange={(event) => setForm((prev) => ({ ...prev, displayOrder: event.target.value }))}
                      disabled={!allowed}
                    />
                  </label>
                </div>

                <label>
                  <span>Description</span>
                  <textarea
                    rows={3}
                    value={form.description}
                    placeholder="How the layout works — circulation, light, which rooms open onto what."
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    disabled={!allowed}
                  />
                </label>

                <div className="portal-media-section">
                  <div className="portal-card-header-row">
                    <div>
                      <h3 style={{ margin: 0 }}>Drawings</h3>
                      <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                        The first drawing is shown on the listing page.
                      </p>
                    </div>
                    <div className="portal-inline-actions">
                      <button
                        type="button"
                        className="portal-inline-btn"
                        disabled={uploading || !allowed}
                        onClick={() => imageInputRef.current?.click()}
                      >
                        {uploading ? 'Uploading...' : 'Upload Drawing'}
                      </button>
                      <button
                        type="button"
                        className="portal-inline-btn"
                        disabled={!allowed}
                        onClick={() => setPickerOpen(true)}
                      >
                        Choose Existing
                      </button>
                    </div>
                  </div>

                  <ImagePicker
                    open={pickerOpen}
                    token={token}
                    multiple
                    onClose={() => setPickerOpen(false)}
                    onSelect={(urls) =>
                      setForm((prev) => ({
                        ...prev,
                        // Skip anything already attached, so picking a drawing
                        // twice cannot produce a duplicate tile.
                        imageUrls: [
                          ...prev.imageUrls,
                          ...urls.filter((url) => !prev.imageUrls.includes(url)),
                        ],
                      }))
                    }
                    usedUrls={form.imageUrls}
                    title="Choose existing drawings"
                  />

                  {form.imageUrls.length > 0 ? (
                    <div className="portal-project-gallery-grid" style={{ marginTop: 12 }}>
                      {form.imageUrls.map((url, index) => (
                        <div
                          key={`${url}-${index}`}
                          className={`portal-project-gallery-item${form.featuredImageUrl === url ? ' is-featured' : ''}`}
                        >
                          <img src={url} alt={`Drawing ${index + 1}`} className="portal-project-gallery-thumb" />
                          <div className="portal-gallery-item-actions">
                            {form.featuredImageUrl === url ? (
                              <span className="portal-featured-badge">Thumbnail</span>
                            ) : (
                              <button
                                type="button"
                                className="portal-inline-btn"
                                onClick={() =>
                                  setForm((prev) => ({ ...prev, featuredImageUrl: url }))
                                }
                              >
                                Use as Thumbnail
                              </button>
                            )}
                            <button
                              type="button"
                              className="portal-inline-btn is-danger"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  imageUrls: prev.imageUrls.filter((image) => image !== url),
                                  // Removing the chosen thumbnail must clear the
                                  // pointer, or it would reference a dead image.
                                  featuredImageUrl:
                                    prev.featuredImageUrl === url ? '' : prev.featuredImageUrl,
                                }))
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="portal-empty-state">No drawing uploaded yet.</div>
                  )}

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      if (event.target.files?.length) {
                        void addImages(event.target.files);
                        event.target.value = '';
                      }
                    }}
                  />
                </div>

                <div className="portal-inline-actions">
                  <button type="submit" className="portal-primary-btn" disabled={saving || uploading || !allowed}>
                    {saving ? 'Saving...' : uploading ? 'Wait for upload...' : isEdit ? 'Save Plan' : 'Create Plan'}
                  </button>
                  {isEdit && canDelete ? (
                    <button
                      type="button"
                      className="portal-ghost-btn is-danger"
                      onClick={() => void onDelete()}
                      disabled={saving}
                    >
                      Delete Plan
                    </button>
                  ) : null}
                  <Link href="/portal/floor-plans" className="portal-ghost-btn">
                    Cancel
                  </Link>
                </div>
              </form>
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
