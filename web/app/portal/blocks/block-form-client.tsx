"use client";

/**
 * Create or edit a project block on its own screen.
 *
 * Block creation used to be a card wedged into the Operations tab, alongside
 * unit assignment and ownership. Blocks are a step in the setup chain --
 * project, then blocks, then units -- and giving them their own screen makes
 * that sequence navigable, and leaves room for editing, which was not possible
 * at all before: a block created with the wrong name or floor count could only
 * be deleted and recreated, which is not an option once units hang off it.
 *
 * One component serves both modes. The form is identical; only the request
 * method, the copy and where you land afterwards differ.
 */

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type ProjectBlock = {
  id: string;
  projectId: string;
  blockName: string;
  totalFloors: number;
  featuredImageUrl?: string | null;
  units?: Array<{ id: string }>;
};

type Project = { id: string; code: string; name: string };

type BlockForm = {
  projectId: string;
  blockName: string;
  totalFloors: string;
  featuredImageUrl: string;
};

export function BlockFormClient({ blockId }: { blockId?: string }) {
  const router = useRouter();
  const dialog = usePortalDialog();
  const isEdit = Boolean(blockId);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [block, setBlock] = useState<ProjectBlock | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [createdCount, setCreatedCount] = useState(0);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [form, setForm] = useState<BlockForm>({
    projectId: '',
    blockName: '',
    totalFloors: '',
    featuredImageUrl: '',
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

        const nextProjects = hasPermission(nextProfile, 'project.read')
          ? await apiRequest<Project[]>('/projects', { method: 'GET' }, authToken)
          : [];
        setProjects(nextProjects);

        if (blockId) {
          const existing = await apiRequest<ProjectBlock>(
            `/project-block/${blockId}`,
            { method: 'GET' },
            authToken,
          );
          setBlock(existing);
          setForm({
            projectId: existing.projectId,
            blockName: existing.blockName,
            totalFloors: String(existing.totalFloors ?? ''),
            featuredImageUrl: existing.featuredImageUrl || '',
          });
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load this block.');
      } finally {
        setLoading(false);
      }
    },
    [blockId],
  );

  useEffect(() => {
    if (!initialized) return;
    if (!token) {
      setLoading(false);
      return;
    }
    void load(token);
  }, [initialized, token, load]);

  const canCreate = hasPermission(profile, 'project-block.create');
  const canUpdate = hasPermission(profile, 'project-block.update');
  const canDelete = hasPermission(profile, 'project-block.delete');
  const allowed = isEdit ? canUpdate : canCreate;

  const projectLabel = useMemo(() => {
    const project = projects.find((entry) => entry.id === form.projectId);
    return project ? `${project.code} — ${project.name}` : '';
  }, [projects, form.projectId]);

  const unitCount = block?.units?.length ?? 0;

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  async function onPickImage(file: File | null) {
    if (!file || !token) return;
    setUploadingImage(true);
    try {
      const uploaded = await uploadMedia(file, token);
      setForm((prev) => ({ ...prev, featuredImageUrl: uploaded.url }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload the image.');
    } finally {
      setUploadingImage(false);
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
        blockName: form.blockName.trim(),
        totalFloors: Number(form.totalFloors || 0),
        featuredImageUrl: form.featuredImageUrl || undefined,
      };

      if (isEdit && blockId) {
        await apiRequest(
          `/project-block/${blockId}`,
          { method: 'PATCH', body: JSON.stringify(payload) },
          token,
        );
        setFeedback('Block updated.');
        router.push('/portal/blocks');
        return;
      }

      await apiRequest('/project-block', { method: 'POST', body: JSON.stringify(payload) }, token);
      setCreatedCount((count) => count + 1);
      setFeedback(`Block ${payload.blockName} created.`);
      // Keep the project selected: blocks are almost always added several at a
      // time to the same development.
      setForm((prev) => ({
        projectId: prev.projectId,
        blockName: '',
        totalFloors: '',
        featuredImageUrl: '',
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save the block.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!token || !blockId || !canDelete) return;

    // Deleting a block with units attached would orphan or cascade them, so
    // name the count rather than asking a generic "are you sure".
    const confirmed = await dialog.confirm({
      title: 'Delete Block',
      message:
        unitCount > 0
          ? `This block has ${unitCount} unit${unitCount === 1 ? '' : 's'}. Deleting it affects them too. Continue?`
          : 'Delete this block? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      await apiRequest(`/project-block/${blockId}`, { method: 'DELETE' }, token);
      router.push('/portal/blocks');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete the block.');
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
            active="blocks"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle={isEdit ? 'Edit Block' : 'Add Block'}
            pageSubtitle={
              isEdit
                ? 'Rename a block or correct its floor count.'
                : 'Blocks sit between a project and its units. Every unit belongs to one.'
            }
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={onLogout}
          >

            {!allowed ? (
              <article className="portal-card portal-role-banner">
                This account cannot {isEdit ? 'edit' : 'create'} blocks. Ask an administrator for the
                project-block.{isEdit ? 'update' : 'create'} permission.
              </article>
            ) : null}

            {!isEdit && projects.length === 0 ? (
              <article className="portal-card portal-role-banner">
                There are no projects yet, and a block has to belong to one.{' '}
                <Link href="/portal/projects/new">Create a project first</Link>.
              </article>
            ) : null}

            <article className="portal-card" data-tour="blocks.form">
              <div className="portal-card-header-row">
                <div>
                  <p className="portal-kicker">{isEdit ? 'Edit' : 'New'}</p>
                  <h2 style={{ margin: '4px 0 0' }}>
                    {isEdit ? `Block ${block?.blockName ?? ''}` : 'Add a block'}
                  </h2>
                  {isEdit && projectLabel ? (
                    <p className="portal-muted" style={{ margin: '6px 0 0' }}>
                      {projectLabel} · {unitCount} unit{unitCount === 1 ? '' : 's'}
                    </p>
                  ) : null}
                </div>
                <Link href="/portal/blocks" className="portal-ghost-btn">
                  All blocks
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
                  <span>Block name</span>
                  <input
                    value={form.blockName}
                    onChange={(event) => setForm((prev) => ({ ...prev, blockName: event.target.value }))}
                    placeholder="A"
                    required
                    disabled={!allowed}
                  />
                </label>

                <label>
                  <span>Total floors</span>
                  <input
                    type="number"
                    min="0"
                    value={form.totalFloors}
                    onChange={(event) => setForm((prev) => ({ ...prev, totalFloors: event.target.value }))}
                    placeholder="12"
                    required
                    disabled={!allowed}
                  />
                </label>

                <label>
                  <span>Block image</span>
                  <p className="portal-muted" style={{ margin: '0 0 8px' }}>
                    Shown as the thumbnail in block and unit lists. Without one, the project&rsquo;s
                    image is used.
                  </p>
                  <div className="portal-inline-actions">
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={!allowed || uploadingImage}
                    >
                      {uploadingImage
                        ? 'Uploading...'
                        : form.featuredImageUrl
                          ? 'Replace Image'
                          : 'Upload Image'}
                    </button>
                    <button
                      type="button"
                      className="portal-inline-btn"
                      onClick={() => setPickerOpen(true)}
                      disabled={!allowed}
                    >
                      Choose Existing
                    </button>
                    {form.featuredImageUrl ? (
                      <button
                        type="button"
                        className="portal-inline-btn is-danger"
                        onClick={() => setForm((prev) => ({ ...prev, featuredImageUrl: '' }))}
                        disabled={!allowed}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {form.featuredImageUrl ? (
                    <img
                      src={form.featuredImageUrl}
                      alt="Block"
                      style={{ marginTop: 10, maxWidth: 220, display: 'block' }}
                    />
                  ) : null}
                  <ImagePicker
                    open={pickerOpen}
                    token={token}
                    onClose={() => setPickerOpen(false)}
                    onSelect={([url]) => setForm((prev) => ({ ...prev, featuredImageUrl: url }))}
                    usedUrls={form.featuredImageUrl ? [form.featuredImageUrl] : []}
                    title="Choose a block image"
                  />
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      void onPickImage(event.target.files?.[0] || null);
                      event.target.value = '';
                    }}
                  />
                </label>

                <div className="portal-inline-actions">
                  <button type="submit" className="portal-primary-btn" disabled={saving || !allowed}>
                    {saving ? 'Saving...' : isEdit ? 'Save Block' : 'Create Block'}
                  </button>
                  {isEdit && canDelete ? (
                    <button
                      type="button"
                      className="portal-ghost-btn is-danger"
                      onClick={() => void onDelete()}
                      disabled={saving}
                    >
                      Delete Block
                    </button>
                  ) : null}
                  <Link href="/portal/blocks" className="portal-ghost-btn">
                    Cancel
                  </Link>
                </div>
              </form>

              {!isEdit && createdCount > 0 ? (
                <p className="portal-muted" style={{ marginTop: 12 }}>
                  {createdCount} block{createdCount === 1 ? '' : 's'} created this session. The project stays
                  selected so you can keep adding.
                </p>
              ) : null}
            </article>

            {!isEdit ? (
              <article className="portal-card">
                <h2 style={{ marginTop: 0 }}>What comes next</h2>
                <p className="portal-muted" style={{ marginBottom: 0 }}>
                  Once the blocks exist, add units to them from{' '}
                  <Link href="/portal/units/new">Add units</Link>. The unit form asks which block each unit
                  belongs to, so the blocks have to come first.
                </p>
              </article>
            ) : null}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
