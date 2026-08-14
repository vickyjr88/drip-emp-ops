"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import { formatSqft, sqftInputToSqm, sqmToSqftInput } from '../../../lib/area';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { CsvUnitUploader } from '../../components/csv-unit-uploader';
import { ImagePicker } from '../../components/image-picker';
import {
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  hasPermission,
  loadProfile,
  roleLabelFor,
  uploadMedia,
} from '../../accounting/lib';

type Block = { id: string; blockName: string; totalFloors: number };
type Project = { id: string; code: string; name: string; blocks?: Block[] };

type UnitForm = {
  blockId: string;
  unitNumber: string;
  floorNumber: string;
  sizeSqm: string;
  priceKes: string;
  priceUsd: string;
  status: 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'RENTED' | 'BLOCKED';
  bedrooms: string;
  parkingSlots: string;
  hasBalcony: boolean;
  hasStore: boolean;
  floorPlanId: string;
  bathrooms: string;
  featuredImageUrl: string;
  galleryImages: string[];
  floorPlanUrl: string;
};

function emptyUnitForm(): UnitForm {
  return {
    blockId: '',
    unitNumber: '',
    floorNumber: '',
    sizeSqm: '',
    priceKes: '',
    priceUsd: '',
    status: 'AVAILABLE',
    bedrooms: '0',
    parkingSlots: '0',
    hasBalcony: false,
    hasStore: false,
    floorPlanId: '',
    bathrooms: '0',
    featuredImageUrl: '',
    galleryImages: [],
    floorPlanUrl: '',
  };
}

export default function NewUnitPage() {
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [uploading, setUploading] = useState(false);
  const [uploadingFloorPlan, setUploadingFloorPlan] = useState(false);
  const [dragging, setDragging] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  const [floorPlanPickerOpen, setFloorPlanPickerOpen] = useState(false);
  const floorPlanInputRef = useRef<HTMLInputElement | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [floorPlans, setFloorPlans] = useState<
    Array<{ id: string; projectId: string; name: string; bedrooms: number; bathrooms: number; sizeSqm: string | number; priceKes?: string | number | null; imageUrls?: string[] | null }>
  >([]);
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');
  const [form, setForm] = useState<UnitForm>(emptyUnitForm());
  // Kept after a save so a run of units in the same block stays quick.
  const [keepBlock, setKeepBlock] = useState(true);
  const [createdCount, setCreatedCount] = useState(0);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      if (hasPermission(nextProfile, 'project.read')) {
        setFloorPlans(
          hasPermission(nextProfile, 'floor-plan.read')
            ? await apiRequest<any[]>('/floor-plans', { method: 'GET' }, authToken)
            : [],
        );
        setProjects(
          await apiRequest<Project[]>('/projects?include=blocks', { method: 'GET' }, authToken),
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const canCreate = hasPermission(profile, 'unit.create');
  const roleLabel = useMemo(() => roleLabelFor(profile), [profile]);

  /**
   * Plans for whichever project the selected block belongs to. Offering every
   * plan in the system would let someone attach a Zenith layout to a Rabat
   * unit, which the copy would then silently apply.
   */
  const planOptions = useMemo(() => {
    if (!form.blockId) return [];
    const project = projects.find((entry) =>
      (entry.blocks || []).some((block) => block.id === form.blockId),
    );
    if (!project) return [];
    return floorPlans.filter((plan) => plan.projectId === project.id);
  }, [form.blockId, projects, floorPlans]);

  /**
   * Prefills the form from a plan, mirroring what the server does on create.
   * Doing it here as well means the figures are visible and adjustable before
   * saving, rather than appearing only after the unit exists.
   */
  function applyPlan(planId: string) {
    const plan = planOptions.find((entry) => entry.id === planId);
    setForm((prev) => ({
      ...prev,
      floorPlanId: planId,
      ...(plan
        ? {
            bedrooms: String(plan.bedrooms ?? prev.bedrooms),
            bathrooms: String(plan.bathrooms ?? prev.bathrooms),
            sizeSqm: plan.sizeSqm != null ? sqmToSqftInput(plan.sizeSqm) : prev.sizeSqm,
            priceKes: plan.priceKes != null ? String(plan.priceKes) : prev.priceKes,
            floorPlanUrl: plan.imageUrls?.[0] || prev.floorPlanUrl,
          }
        : {}),
    }));
  }

  const blockOptions = useMemo(
    () =>
      projects.flatMap((project) =>
        (project.blocks || []).map((block) => ({
          id: block.id,
          label: `${project.code} • Block ${block.blockName}`,
        })),
      ),
    [projects],
  );

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  function readApiError(error: unknown) {
    const raw = error instanceof Error ? error.message : '';
    try {
      const parsed = JSON.parse(raw);
      const message = parsed?.message;
      if (Array.isArray(message)) return message.join(', ');
      if (typeof message === 'string') return message;
    } catch {
      // Not JSON; fall through.
    }
    return raw || 'Could not create the unit.';
  }


  // Image handling mirrors the edit screen: photos were previously only
  // attachable after the unit existed, so adding a unit meant creating it,
  // then navigating to edit to give it a picture. Units without a photo do not
  // show usefully in listings, so this was a two-step job for what is one task.
  async function addImageFiles(fileList: FileList | File[]) {
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
      if (!urls.length) return;

      setForm((prev) => ({
        ...prev,
        galleryImages: [...prev.galleryImages, ...urls],
        // First photo uploaded becomes the featured one unless a choice was
        // already made, which is what people expect without being told.
        featuredImageUrl: prev.featuredImageUrl || urls[0],
      }));
      setFeedback(`${urls.length} image${urls.length === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload images.');
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    setForm((prev) => {
      const galleryImages = prev.galleryImages.filter((image) => image !== url);
      return {
        ...prev,
        galleryImages,
        featuredImageUrl:
          prev.featuredImageUrl === url ? galleryImages[0] || '' : prev.featuredImageUrl,
      };
    });
  }

  function setFeatured(url: string) {
    setForm((prev) => ({
      ...prev,
      featuredImageUrl: url,
      galleryImages: prev.galleryImages.includes(url) ? prev.galleryImages : [url, ...prev.galleryImages],
    }));
    setFeedback('Featured photo set.');
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
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload the floor plan.');
    } finally {
      setUploadingFloorPlan(false);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreate) return;

    setMutating(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      await apiRequest(
        '/units',
        {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            // The field is square feet; storage is metric.
            sizeSqm: sqftInputToSqm(form.sizeSqm),
            floorNumber: Number(form.floorNumber),
            bedrooms: Number(form.bedrooms),
            bathrooms: Number(form.bathrooms || 0),
            floorPlanId: form.floorPlanId || undefined,
            parkingSlots: Number(form.parkingSlots),
          }),
        },
        token,
      );
      setCreatedCount((count) => count + 1);
      setFeedback(`Unit ${form.unitNumber} created.`);
      // Blank the identifying fields but keep the block, so entering a floor of
      // similar units does not mean reselecting it every time.
      setForm((prev) => ({
        ...emptyUnitForm(),
        blockId: keepBlock ? prev.blockId : '',
      }));
    } catch (error) {
      setErrorMessage(readApiError(error));
    } finally {
      setMutating(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-auth-section" style={{ paddingTop: 72 }}>
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
          <section className="lp-container portal-auth-section" style={{ paddingTop: 72 }}>
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
            active="units"
            pageTitle="Add Units"
            pageSubtitle="Create a single unit or upload a spreadsheet of them."
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={hasPermission(profile, 'role.read')}
            onLogout={onLogout}
          >
            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <Link href="/portal/units" className="portal-ghost-btn">
                Back to Units
              </Link>
              {createdCount > 0 ? (
                <span className="portal-muted" style={{ alignSelf: 'center' }}>
                  {createdCount} unit{createdCount === 1 ? '' : 's'} created this session
                </span>
              ) : null}
            </div>


            {!canCreate ? (
              <article className="portal-card portal-role-banner">
                You do not have permission to create units.
              </article>
            ) : !blockOptions.length ? (
              <article className="portal-card">
                <div className="portal-empty-state">
                  Units belong to a block, and no blocks exist yet.{' '}
                  <Link href="/portal/projects">Add a block to a project</Link> first.
                </div>
              </article>
            ) : (
              <article className="portal-card">
                <div className="portal-card-header-row">
                  <h2 style={{ margin: 0 }}>{mode === 'manual' ? 'Single Unit' : 'Upload a Spreadsheet'}</h2>
                  <div className="portal-action-row">
                    <button
                      type="button"
                      className={`portal-inline-btn${mode === 'manual' ? ' is-active' : ''}`}
                      onClick={() => setMode('manual')}
                    >
                      Single Unit
                    </button>
                    <button
                      type="button"
                      className={`portal-inline-btn${mode === 'csv' ? ' is-active' : ''}`}
                      onClick={() => setMode('csv')}
                    >
                      Upload CSV
                    </button>
                  </div>
                </div>

                {mode === 'csv' ? (
                  <>
                    <p className="portal-muted" style={{ marginTop: 0 }}>
                      The template lists every column and which are required. Rows can name their own
                      block, or leave it blank and choose a default below.
                    </p>
                    <CsvUnitUploader
                      blocks={blockOptions.map((block) => ({ id: block.id, blockName: block.label }))}
                      floorPlans={floorPlans}
                      token={token}
                      isAdmin={canCreate}
                      onSuccess={async () => {
                        setFeedback('Units uploaded.');
                      }}
                      setMutationMessage={setFeedback}
                    />
                  </>
                ) : (
                  <form className="portal-entity-form" onSubmit={onCreate}>
                    <label>
                      <span>Block</span>
                      <select
                        value={form.blockId}
                        onChange={(event) => setForm((prev) => ({ ...prev, blockId: event.target.value }))}
                        required
                      >
                        <option value="">Select block</option>
                        {blockOptions.map((block) => (
                          <option key={block.id} value={block.id}>
                            {block.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>Floor plan</span>
                      <select
                        value={form.floorPlanId}
                        onChange={(event) => applyPlan(event.target.value)}
                        disabled={!form.blockId || planOptions.length === 0}
                      >
                        <option value="">
                          {!form.blockId
                            ? 'Choose a block first'
                            : planOptions.length === 0
                              ? 'No plans for this project'
                              : 'None — enter figures manually'}
                        </option>
                        {planOptions.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} · {plan.bedrooms === 0 ? 'Studio' : `${plan.bedrooms} bed`} ·{' '}
                            {formatSqft(plan.sizeSqm)}
                          </option>
                        ))}
                      </select>
                    </label>

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
                        <span>Size (sq ft)</span>
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
                            setForm((prev) => ({ ...prev, status: event.target.value as UnitForm['status'] }))
                          }
                        >
                          {['AVAILABLE', 'RESERVED', 'SOLD', 'RENTED', 'BLOCKED'].map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
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
                        <span>Has Balcony</span>
                      </label>
                      <label className="portal-check">
                        <input
                          type="checkbox"
                          checked={form.hasStore}
                          onChange={(event) => setForm((prev) => ({ ...prev, hasStore: event.target.checked }))}
                        />
                        <span>Has Store</span>
                      </label>
                      <label className="portal-check">
                        <input
                          type="checkbox"
                          checked={keepBlock}
                          onChange={(event) => setKeepBlock(event.target.checked)}
                        />
                        <span>Keep block for the next unit</span>
                      </label>
                    </div>

                    <div className="portal-media-section">
                      <div className="portal-card-header-row">
                        <div>
                          <h3 style={{ margin: 0 }}>Unit Photos</h3>
                          <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                            Optional. Drag images in, then click one to make it the featured photo
                            used on listings.
                          </p>
                        </div>
                        <div className="portal-inline-actions">
                          <button
                            type="button"
                            className="portal-inline-btn"
                            disabled={uploading}
                            onClick={() => galleryInputRef.current?.click()}
                          >
                            {uploading ? 'Uploading...' : 'Browse Images'}
                          </button>
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => setGalleryPickerOpen(true)}
                          >
                            Choose Existing
                          </button>
                        </div>
                        <ImagePicker
                          open={galleryPickerOpen}
                          token={token}
                          multiple
                          onClose={() => setGalleryPickerOpen(false)}
                          onSelect={(urls) =>
                            setForm((prev) => {
                              const added = urls.filter((url) => !prev.galleryImages.includes(url));
                              return {
                                ...prev,
                                galleryImages: [...prev.galleryImages, ...added],
                                featuredImageUrl:
                                  prev.featuredImageUrl || added[0] || prev.featuredImageUrl,
                              };
                            })
                          }
                          usedUrls={form.galleryImages}
                          title="Choose existing unit images"
                        />
                      </div>

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
                          event.preventDefault();
                          setDragging(false);
                          if (uploading) return;
                          if (event.dataTransfer.files?.length) {
                            void addImageFiles(event.dataTransfer.files);
                          }
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
                        <p>PNG, JPG or WebP. You can select several at once.</p>
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

                      {form.galleryImages.length > 0 ? (
                        <div className="portal-project-gallery-grid" style={{ marginTop: 16 }}>
                          {form.galleryImages.map((image, index) => {
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
                                  <img
                                    src={image}
                                    alt={`Unit photo ${index + 1}`}
                                    className="portal-project-gallery-thumb"
                                  />
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
                          })}
                        </div>
                      ) : null}
                    </div>

                    <div className="portal-media-section">
                      <div className="portal-card-header-row">
                        <div>
                          <h3 style={{ margin: 0 }}>Floor Plan</h3>
                          <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                            Optional. An image or PDF.
                          </p>
                        </div>
                        <div className="portal-inline-actions">
                          <button
                            type="button"
                            className="portal-inline-btn"
                            disabled={uploadingFloorPlan}
                            onClick={() => floorPlanInputRef.current?.click()}
                          >
                            {uploadingFloorPlan
                              ? 'Uploading...'
                              : form.floorPlanUrl
                                ? 'Replace Floor Plan'
                                : 'Upload Floor Plan'}
                          </button>
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => setFloorPlanPickerOpen(true)}
                          >
                            Choose Existing
                          </button>
                        </div>
                      </div>

                      <ImagePicker
                        open={floorPlanPickerOpen}
                        token={token}
                        onClose={() => setFloorPlanPickerOpen(false)}
                        onSelect={([url]) => setForm((prev) => ({ ...prev, floorPlanUrl: url }))}
                        usedUrls={form.floorPlanUrl ? [form.floorPlanUrl] : []}
                        title="Choose an existing drawing"
                      />

                      {form.floorPlanUrl ? (
                        <div className="portal-featured-preview">
                          <div className="portal-featured-preview-label">Attached floor plan</div>
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
                            <button
                              type="button"
                              className="portal-inline-btn is-danger"
                              onClick={() => setForm((prev) => ({ ...prev, floorPlanUrl: '' }))}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : null}

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
                    </div>

                    <div className="portal-inline-actions">
                      <button
                        type="submit"
                        className="portal-primary-btn"
                        disabled={mutating || uploading || uploadingFloorPlan}
                      >
                        {mutating
                          ? 'Saving...'
                          : uploading || uploadingFloorPlan
                            ? 'Wait for uploads...'
                            : 'Create Unit'}
                      </button>
                      <button
                        type="button"
                        className="portal-ghost-btn"
                        onClick={() => router.push('/portal/units')}
                      >
                        Done
                      </button>
                    </div>
                  </form>
                )}
              </article>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
