"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../../../components/notifications';
import { ImagePicker } from '../../../components/image-picker';
import { PrintReportButton } from '../../../components/print-report';
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EliteLayout } from '../../../../components/elite-layout';
import { PortalShell } from '../../../components/portal-shell';
import { usePortalDialog } from '../../../components/portal-dialog';

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

type ConstructionStage =
  | 'PLANNING'
  | 'FOUNDATION'
  | 'STRUCTURE'
  | 'ROOFING'
  | 'FINISHING'
  | 'HANDOVER';

const STAGES: ConstructionStage[] = ['PLANNING', 'FOUNDATION', 'STRUCTURE', 'ROOFING', 'FINISHING', 'HANDOVER'];

type InspectionOutcome = 'PASSED' | 'FAILED' | 'NEEDS_FOLLOW_UP';

type Project = {
  id: string;
  code: string;
  name: string;
  location: string | null;
};

type ProjectBlock = {
  id: string;
  projectId: string;
  blockName: string;
  totalFloors: number;
};

type ConstructionStatus = {
  id: string;
  blockId: string;
  currentStage: ConstructionStage;
  progressPercent: number;
  notes?: string | null;
  updatedAt: string;
  updatedBy: string;
};

type ConstructionStageLog = {
  id: string;
  blockId: string;
  stage: ConstructionStage;
  progressPercent: number;
  notes?: string | null;
  photoUrls?: string[] | null;
  recordedAt: string;
  recordedBy: string;
};

type SitePhoto = {
  id: string;
  blockId: string;
  stage?: ConstructionStage | null;
  url: string;
  caption?: string | null;
  uploadedAt: string;
  uploadedBy: string;
};

type SiteInspection = {
  id: string;
  blockId: string;
  stage: ConstructionStage;
  inspectorName: string;
  inspectionDate: string;
  outcome: InspectionOutcome;
  findings?: string | null;
  photoUrls?: string[] | null;
  createdAt: string;
  createdBy: string;
};

type StatusForm = {
  currentStage: ConstructionStage;
  progressPercent: string;
  notes: string;
};

type LogEditForm = {
  stage: ConstructionStage;
  progressPercent: string;
  notes: string;
  photoUrls: string[];
};

type InspectionForm = {
  stage: ConstructionStage;
  inspectorName: string;
  inspectionDate: string;
  outcome: InspectionOutcome;
  findings: string;
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

function stageLabel(stage: ConstructionStage) {
  return stage.charAt(0) + stage.slice(1).toLowerCase();
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

function outcomeClass(outcome: InspectionOutcome) {
  if (outcome === 'PASSED') return 'portal-chip is-success';
  if (outcome === 'FAILED') return 'portal-chip is-danger';
  return 'portal-chip';
}

function makeStatusForm(status?: ConstructionStatus | null): StatusForm {
  return {
    currentStage: status?.currentStage || 'PLANNING',
    progressPercent: status ? String(status.progressPercent) : '0',
    notes: status?.notes || '',
  };
}

function makeLogEditForm(log?: ConstructionStageLog | null): LogEditForm {
  return {
    stage: log?.stage || 'PLANNING',
    progressPercent: log ? String(log.progressPercent) : '0',
    notes: log?.notes || '',
    photoUrls: log?.photoUrls ? [...log.photoUrls] : [],
  };
}

function makeInspectionForm(stage: ConstructionStage): InspectionForm {
  return {
    stage,
    inspectorName: '',
    inspectionDate: new Date().toISOString().slice(0, 10),
    outcome: 'PASSED',
    findings: '',
  };
}

export default function ProjectConstructionClient({ projectId }: { projectId: string }) {
  const dialog = usePortalDialog();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const progressPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingProgressPhotos, setUploadingProgressPhotos] = useState(false);
  const [progressPhotoUrls, setProgressPhotoUrls] = useState<string[]>([]);
  const [progressPickerOpen, setProgressPickerOpen] = useState(false);
  const [logEditPickerOpen, setLogEditPickerOpen] = useState(false);
  const [sitePhotoPickerOpen, setSitePhotoPickerOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [blocks, setBlocks] = useState<ProjectBlock[]>([]);
  const [statuses, setStatuses] = useState<ConstructionStatus[]>([]);
  const [stageLogs, setStageLogs] = useState<ConstructionStageLog[]>([]);
  const [sitePhotos, setSitePhotos] = useState<SitePhoto[]>([]);
  const [inspections, setInspections] = useState<SiteInspection[]>([]);

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [statusForm, setStatusForm] = useState<StatusForm>(makeStatusForm());
  const [inspectionForm, setInspectionForm] = useState<InspectionForm>(makeInspectionForm('PLANNING'));
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [photoStageFilter, setPhotoStageFilter] = useState<ConstructionStage | 'ALL'>('ALL');
  const [uploadStage, setUploadStage] = useState<ConstructionStage>('PLANNING');

  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [logEditForm, setLogEditForm] = useState<LogEditForm>(makeLogEditForm());
  const [uploadingLogEditPhotos, setUploadingLogEditPhotos] = useState(false);
  const logEditPhotoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await apiRequest<AuthProfile>('/auth/profile', { method: 'GET' }, authToken);
      const [nextProject, allBlocks, allStatuses, allLogs, allPhotos, allInspections] = await Promise.all([
        apiRequest<Project>(`/projects/${projectId}`, { method: 'GET' }, authToken),
        apiRequest<ProjectBlock[]>('/project-block', { method: 'GET' }, authToken),
        hasPermission(nextProfile, 'construction-status.read')
          ? apiRequest<ConstructionStatus[]>('/construction-status', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'construction-stage-log.read')
          ? apiRequest<ConstructionStageLog[]>('/construction-stage-logs?take=300', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'site-photo.read')
          ? apiRequest<SitePhoto[]>('/site-photos?take=300', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'site-inspection.read')
          ? apiRequest<SiteInspection[]>('/site-inspections?take=300', { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);

      setProfile(nextProfile);
      setProject(nextProject);
      const projectBlocks = allBlocks.filter((block) => block.projectId === projectId);
      setBlocks(projectBlocks);
      setStatuses(allStatuses);
      setStageLogs(allLogs);
      setSitePhotos(allPhotos);
      setInspections(allInspections);
      setActiveBlockId((prev) => prev || projectBlocks[0]?.id || null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load construction data.');
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

  const activeBlock = useMemo(
    () => blocks.find((block) => block.id === activeBlockId) || null,
    [blocks, activeBlockId],
  );

  const activeStatus = useMemo(
    () => statuses.find((status) => status.blockId === activeBlockId) || null,
    [statuses, activeBlockId],
  );

  const activeStageLogs = useMemo(
    () => stageLogs.filter((log) => log.blockId === activeBlockId),
    [stageLogs, activeBlockId],
  );

  const activePhotos = useMemo(() => {
    const filtered = sitePhotos.filter((photo) => photo.blockId === activeBlockId);
    if (photoStageFilter === 'ALL') return filtered;
    return filtered.filter((photo) => photo.stage === photoStageFilter);
  }, [sitePhotos, activeBlockId, photoStageFilter]);

  const activeInspections = useMemo(
    () => inspections.filter((inspection) => inspection.blockId === activeBlockId),
    [inspections, activeBlockId],
  );

  useEffect(() => {
    setStatusForm(makeStatusForm(activeStatus));
  }, [activeStatus, activeBlockId]);

  useEffect(() => {
    setInspectionForm(makeInspectionForm(activeStatus?.currentStage || 'PLANNING'));
    setUploadStage(activeStatus?.currentStage || 'PLANNING');
    setProgressPhotoUrls([]);
    setEditingLogId(null);
  }, [activeBlockId]);

  const canUpdateStatus = hasPermission(profile, 'construction-status.update');
  const canCreatePhoto = hasPermission(profile, 'site-photo.create');
  const canDeletePhoto = hasPermission(profile, 'site-photo.delete');
  const canCreateInspection = hasPermission(profile, 'site-inspection.create');
  const canDeleteInspection = hasPermission(profile, 'site-inspection.delete');
  const canUpdateLog = hasPermission(profile, 'construction-stage-log.update');
  const canDeleteLog = hasPermission(profile, 'construction-stage-log.delete');

  const roleLabel = useMemo(() => {
    if (!profile) return 'Unassigned';
    if (profile.roles?.length) return profile.roles.map((role) => role.name).join(', ');
    return profile.role || 'Unassigned';
  }, [profile]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  async function runMutation(action: () => Promise<void>, successMessage: string) {
    if (!token) return;
    setMutating(true);
    setFeedback(null);
    setErrorMessage(null);
    try {
      await action();
      setFeedback(successMessage);
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Operation failed.');
    } finally {
      setMutating(false);
    }
  }

  async function onSaveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdateStatus || !activeBlockId) return;

    await runMutation(async () => {
      await apiRequest(
        `/construction-status/block/${activeBlockId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            currentStage: statusForm.currentStage,
            progressPercent: Number(statusForm.progressPercent || 0),
            notes: statusForm.notes || undefined,
            photoUrls: progressPhotoUrls.length > 0 ? progressPhotoUrls : undefined,
            updatedBy: profile?.email || 'system',
          }),
        },
        token,
      );
      setProgressPhotoUrls([]);
    }, 'Construction progress updated.');
  }

  async function addProgressPhotoFiles(fileList: FileList | File[]) {
    if (!token) return;
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      setErrorMessage('Please select image files only.');
      return;
    }

    setUploadingProgressPhotos(true);
    setErrorMessage(null);
    try {
      const uploaded = await Promise.all(files.map((file) => uploadMedia(file, token)));
      const urls = uploaded.map((item) => item.url).filter(Boolean);
      setProgressPhotoUrls((prev) => [...prev, ...urls]);
      setFeedback(`${urls.length} photo${urls.length === 1 ? '' : 's'} attached to this update.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload photos.');
    } finally {
      setUploadingProgressPhotos(false);
    }
  }

  function removeProgressPhoto(url: string) {
    setProgressPhotoUrls((prev) => prev.filter((item) => item !== url));
  }

  function startEditingLog(log: ConstructionStageLog) {
    setEditingLogId(log.id);
    setLogEditForm(makeLogEditForm(log));
  }

  async function addLogEditPhotoFiles(fileList: FileList | File[]) {
    if (!token) return;
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      setErrorMessage('Please select image files only.');
      return;
    }

    setUploadingLogEditPhotos(true);
    setErrorMessage(null);
    try {
      const uploaded = await Promise.all(files.map((file) => uploadMedia(file, token)));
      const urls = uploaded.map((item) => item.url).filter(Boolean);
      setLogEditForm((prev) => ({ ...prev, photoUrls: [...prev.photoUrls, ...urls] }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload photos.');
    } finally {
      setUploadingLogEditPhotos(false);
    }
  }

  function removeLogEditPhoto(url: string) {
    setLogEditForm((prev) => ({ ...prev, photoUrls: prev.photoUrls.filter((item) => item !== url) }));
  }

  async function onUpdateLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canUpdateLog || !editingLogId) return;

    await runMutation(async () => {
      await apiRequest(
        `/construction-stage-logs/${editingLogId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            stage: logEditForm.stage,
            progressPercent: Number(logEditForm.progressPercent || 0),
            notes: logEditForm.notes || undefined,
            photoUrls: logEditForm.photoUrls,
            updatedBy: profile?.email || 'system',
          }),
        },
        token,
      );
      setEditingLogId(null);
    }, 'Stage history entry updated.');
  }

  async function onDeleteLog(id: string) {
    if (!token || !canDeleteLog) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Stage History Entry',
      message: 'Delete this stage history entry? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/construction-stage-logs/${id}`, { method: 'DELETE' }, token);
      if (editingLogId === id) setEditingLogId(null);
    }, 'Stage history entry deleted.');
  }

  async function addPhotoFiles(fileList: FileList | File[]) {
    if (!token || !activeBlockId) return;
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      setErrorMessage('Please drop image files only.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    try {
      const uploaded = await Promise.all(files.map((file) => uploadMedia(file, token)));
      await Promise.all(
        uploaded.map((item) =>
          apiRequest(
            '/site-photos',
            {
              method: 'POST',
              body: JSON.stringify({
                blockId: activeBlockId,
                stage: uploadStage,
                url: item.url,
                objectKey: item.objectKey,
                uploadedBy: profile?.email || 'system',
              }),
            },
            token,
          ),
        ),
      );
      setFeedback(`${uploaded.length} site photo${uploaded.length === 1 ? '' : 's'} uploaded.`);
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload site photos.');
    } finally {
      setUploading(false);
    }
  }

  /**
   * Records already-uploaded images as site photos.
   *
   * A site photo is a database record carrying its stage and uploader, not
   * just a URL, so picking an existing image still has to create one -- the
   * same POST addPhotoFiles makes, without the upload step.
   */
  async function attachExistingSitePhotos(items: Array<{ url: string; objectKey: string }>) {
    if (!token || !activeBlockId || items.length === 0) return;

    setUploading(true);
    setErrorMessage(null);
    try {
      await Promise.all(
        items.map((item) =>
          apiRequest(
            '/site-photos',
            {
              method: 'POST',
              body: JSON.stringify({
                blockId: activeBlockId,
                stage: uploadStage,
                url: item.url,
                objectKey: item.objectKey,
                uploadedBy: profile?.email || 'system',
              }),
            },
            token,
          ),
        ),
      );
      setFeedback(`${items.length} site photo${items.length === 1 ? '' : 's'} attached.`);
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not attach site photos.');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) {
      void addPhotoFiles(event.dataTransfer.files);
    }
  }

  async function onDeletePhoto(id: string) {
    if (!token || !canDeletePhoto) return;
    const confirmed = await dialog.confirm({
      title: 'Remove Site Photo',
      message: 'Remove this site photo?',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/site-photos/${id}`, { method: 'DELETE' }, token);
    }, 'Site photo removed.');
  }

  async function onCreateInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canCreateInspection || !activeBlockId) return;

    await runMutation(async () => {
      await apiRequest(
        '/site-inspections',
        {
          method: 'POST',
          body: JSON.stringify({
            blockId: activeBlockId,
            stage: inspectionForm.stage,
            inspectorName: inspectionForm.inspectorName,
            inspectionDate: inspectionForm.inspectionDate,
            outcome: inspectionForm.outcome,
            findings: inspectionForm.findings || undefined,
            createdBy: profile?.email || 'system',
          }),
        },
        token,
      );
      setInspectionForm(makeInspectionForm(activeStatus?.currentStage || 'PLANNING'));
      setShowInspectionForm(false);
    }, 'Site inspection recorded.');
  }

  async function onDeleteInspection(id: string) {
    if (!token || !canDeleteInspection) return;
    const confirmed = await dialog.confirm({
      title: 'Delete Inspection Record',
      message: 'Delete this inspection record?',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await runMutation(async () => {
      await apiRequest(`/site-inspections/${id}`, { method: 'DELETE' }, token);
    }, 'Inspection deleted.');
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading construction data...</article>
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

  if (errorMessage && !project) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card">
              <h2>Project not available</h2>
              <p>{errorMessage}</p>
              <Link href="/portal/projects" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                Back to Projects
              </Link>
            </article>
          </section>
        </main>
      </EliteLayout>
    );
  }

  if (!project) return null;

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="projects"
            pageTitle="Construction Management"
            pageSubtitle={`${project.code} • ${project.name} • Track stages, progress, site photos, and inspections per block.`}
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
            <div className="portal-action-row" style={{ marginBottom: 16 }}>
              <Link href={`/portal/projects/${projectId}`} className="portal-ghost-btn">
                Back to Project
              </Link>
            </div>


            {blocks.length === 0 ? (
              <article className="portal-card portal-empty-state">
                No blocks exist for this project yet. Create a block under Operations before tracking construction.
              </article>
            ) : (
              <div className="portal-stack-grid">
                <article className="portal-card">
                  <div className="portal-card-header-row no-print">
                    <PrintReportButton documentTitle="Construction Report" />
                  </div>
                  <h2>Blocks</h2>
                  <div className="portal-action-row" style={{ flexWrap: 'wrap' }}>
                    {blocks.map((block) => {
                      const status = statuses.find((item) => item.blockId === block.id);
                      return (
                        <button
                          key={block.id}
                          type="button"
                          className={block.id === activeBlockId ? 'portal-primary-btn' : 'portal-inline-btn'}
                          onClick={() => setActiveBlockId(block.id)}
                        >
                          Block {block.blockName}
                          {status ? ` — ${stageLabel(status.currentStage)} (${status.progressPercent}%)` : ' — Not started'}
                        </button>
                      );
                    })}
                  </div>
                </article>

                {activeBlock ? (
                  <>
                    <div className="portal-detail-grid">
                      <article className="portal-card">
                        <h2>Block {activeBlock.blockName} — Stage &amp; Progress</h2>
                        <div className="portal-detail-tags">
                          {STAGES.map((stage) => (
                            <span
                              key={stage}
                              className={
                                activeStatus?.currentStage === stage ? 'portal-chip is-active' : 'portal-chip'
                              }
                            >
                              {stageLabel(stage)}
                            </span>
                          ))}
                        </div>
                        <div className="portal-progress-track" aria-hidden="true" style={{ marginTop: 14 }}>
                          <div
                            className="portal-progress-fill"
                            style={{ width: `${activeStatus?.progressPercent || 0}%` }}
                          />
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#5e5e5e' }}>
                          {activeStatus
                            ? `${activeStatus.progressPercent}% complete • Updated ${formatDate(activeStatus.updatedAt)} by ${activeStatus.updatedBy}`
                            : 'No progress recorded yet.'}
                        </p>

                        {canUpdateStatus ? (
                          <form className="portal-entity-form portal-detail-form" onSubmit={onSaveStatus} style={{ marginTop: 16 }}>
                            <div className="portal-entity-grid-2">
                              <label>
                                <span>Current Stage</span>
                                <select
                                  value={statusForm.currentStage}
                                  onChange={(event) =>
                                    setStatusForm((prev) => ({
                                      ...prev,
                                      currentStage: event.target.value as ConstructionStage,
                                    }))
                                  }
                                >
                                  {STAGES.map((stage) => (
                                    <option key={stage} value={stage}>
                                      {stageLabel(stage)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Progress %</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={statusForm.progressPercent}
                                  onChange={(event) =>
                                    setStatusForm((prev) => ({ ...prev, progressPercent: event.target.value }))
                                  }
                                  required
                                />
                              </label>
                            </div>
                            <label>
                              <span>Notes</span>
                              <textarea
                                rows={3}
                                value={statusForm.notes}
                                onChange={(event) => setStatusForm((prev) => ({ ...prev, notes: event.target.value }))}
                                placeholder="What changed since the last update?"
                              />
                            </label>

                            <div>
                              <span style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                                Supporting Photos
                              </span>
                              <div className="portal-action-row" style={{ marginBottom: progressPhotoUrls.length > 0 ? 10 : 0 }}>
                                <button
                                  type="button"
                                  className="portal-inline-btn"
                                  disabled={uploadingProgressPhotos}
                                  onClick={() => progressPhotoInputRef.current?.click()}
                                >
                                  {uploadingProgressPhotos ? 'Uploading...' : 'Attach Photos'}
                                </button>
                                <button
                                  type="button"
                                  className="portal-inline-btn"
                                  onClick={() => setProgressPickerOpen(true)}
                                >
                                  Choose Existing
                                </button>
                                <ImagePicker
                                  open={progressPickerOpen}
                                  token={token}
                                  multiple
                                  onClose={() => setProgressPickerOpen(false)}
                                  onSelect={(urls) =>
                                    setProgressPhotoUrls((prev) => [
                                      ...prev,
                                      ...urls.filter((url) => !prev.includes(url)),
                                    ])
                                  }
                                  usedUrls={progressPhotoUrls}
                                  title="Choose existing photos"
                                />
                                <input
                                  ref={progressPhotoInputRef}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  hidden
                                  onChange={(event) => {
                                    if (event.target.files?.length) {
                                      void addProgressPhotoFiles(event.target.files);
                                      event.target.value = '';
                                    }
                                  }}
                                />
                              </div>
                              {progressPhotoUrls.length > 0 ? (
                                <div className="portal-project-gallery-grid">
                                  {progressPhotoUrls.map((url, index) => (
                                    <div key={`${url}-${index}`} className="portal-project-gallery-item">
                                      <img src={url} alt={`Progress attachment ${index + 1}`} className="portal-project-gallery-thumb" />
                                      <div className="portal-gallery-item-actions">
                                        <button
                                          type="button"
                                          className="portal-inline-btn is-danger"
                                          onClick={() => removeProgressPhoto(url)}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <button type="submit" className="portal-primary-btn" disabled={mutating || uploadingProgressPhotos}>
                              {mutating ? 'Saving...' : 'Update Progress'}
                            </button>
                          </form>
                        ) : null}
                      </article>

                      <article className="portal-card">
                        <h2>Stage History</h2>
                        <div className="portal-list-stack">
                          {activeStageLogs.length === 0 ? (
                            <div className="portal-empty-state">No stage updates recorded yet.</div>
                          ) : (
                            activeStageLogs.map((log) => (
                              <div key={log.id} className="portal-record">
                                <div className="portal-list-row">
                                  <div>
                                    <strong>{stageLabel(log.stage)}</strong>
                                    <p>{log.notes || 'No notes provided.'}</p>
                                    <p>
                                      By {log.recordedBy} • {formatDate(log.recordedAt)}
                                    </p>
                                  </div>
                                  <span>{log.progressPercent}%</span>
                                </div>
                                {log.photoUrls && log.photoUrls.length > 0 ? (
                                  <div className="portal-project-gallery-grid" style={{ marginTop: 10 }}>
                                    {log.photoUrls.map((url, index) => (
                                      <div key={`${url}-${index}`} className="portal-project-gallery-item">
                                        <img
                                          src={url}
                                          alt={`${stageLabel(log.stage)} update photo ${index + 1}`}
                                          className="portal-project-gallery-thumb"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                ) : null}

                                {canUpdateLog || canDeleteLog ? (
                                  <div className="portal-action-row">
                                    {canUpdateLog ? (
                                      <button
                                        type="button"
                                        className="portal-inline-btn"
                                        onClick={() =>
                                          editingLogId === log.id ? setEditingLogId(null) : startEditingLog(log)
                                        }
                                      >
                                        {editingLogId === log.id ? 'Cancel' : 'Edit'}
                                      </button>
                                    ) : null}
                                    {canDeleteLog ? (
                                      <button
                                        type="button"
                                        className="portal-inline-btn is-danger"
                                        onClick={() => void onDeleteLog(log.id)}
                                      >
                                        Delete
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}

                                {editingLogId === log.id && canUpdateLog ? (
                                  <form className="portal-entity-form portal-inline-form" onSubmit={onUpdateLog}>
                                    <div className="portal-entity-grid-2">
                                      <label>
                                        <span>Stage</span>
                                        <select
                                          value={logEditForm.stage}
                                          onChange={(event) =>
                                            setLogEditForm((prev) => ({
                                              ...prev,
                                              stage: event.target.value as ConstructionStage,
                                            }))
                                          }
                                        >
                                          {STAGES.map((stage) => (
                                            <option key={stage} value={stage}>
                                              {stageLabel(stage)}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label>
                                        <span>Progress %</span>
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          value={logEditForm.progressPercent}
                                          onChange={(event) =>
                                            setLogEditForm((prev) => ({ ...prev, progressPercent: event.target.value }))
                                          }
                                          required
                                        />
                                      </label>
                                    </div>
                                    <label>
                                      <span>Notes</span>
                                      <textarea
                                        rows={3}
                                        value={logEditForm.notes}
                                        onChange={(event) =>
                                          setLogEditForm((prev) => ({ ...prev, notes: event.target.value }))
                                        }
                                      />
                                    </label>

                                    <div>
                                      <span style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                                        Supporting Photos
                                      </span>
                                      <div
                                        className="portal-action-row"
                                        style={{ marginBottom: logEditForm.photoUrls.length > 0 ? 10 : 0 }}
                                      >
                                        <button
                                          type="button"
                                          className="portal-inline-btn"
                                          disabled={uploadingLogEditPhotos}
                                          onClick={() => logEditPhotoInputRef.current?.click()}
                                        >
                                          {uploadingLogEditPhotos ? 'Uploading...' : 'Attach Photos'}
                                        </button>
                                        <button
                                          type="button"
                                          className="portal-inline-btn"
                                          onClick={() => setLogEditPickerOpen(true)}
                                        >
                                          Choose Existing
                                        </button>
                                        <ImagePicker
                                          open={logEditPickerOpen}
                                          token={token}
                                          multiple
                                          onClose={() => setLogEditPickerOpen(false)}
                                          onSelect={(urls) =>
                                            setLogEditForm((prev) => ({
                                              ...prev,
                                              photoUrls: [
                                                ...prev.photoUrls,
                                                ...urls.filter((url) => !prev.photoUrls.includes(url)),
                                              ],
                                            }))
                                          }
                                          usedUrls={logEditForm.photoUrls}
                                          title="Choose existing photos"
                                        />
                                        <input
                                          ref={logEditPhotoInputRef}
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          hidden
                                          onChange={(event) => {
                                            if (event.target.files?.length) {
                                              void addLogEditPhotoFiles(event.target.files);
                                              event.target.value = '';
                                            }
                                          }}
                                        />
                                      </div>
                                      {logEditForm.photoUrls.length > 0 ? (
                                        <div className="portal-project-gallery-grid">
                                          {logEditForm.photoUrls.map((url, index) => (
                                            <div key={`${url}-${index}`} className="portal-project-gallery-item">
                                              <img
                                                src={url}
                                                alt={`Edited attachment ${index + 1}`}
                                                className="portal-project-gallery-thumb"
                                              />
                                              <div className="portal-gallery-item-actions">
                                                <button
                                                  type="button"
                                                  className="portal-inline-btn is-danger"
                                                  onClick={() => removeLogEditPhoto(url)}
                                                >
                                                  Remove
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="portal-inline-actions">
                                      <button
                                        type="submit"
                                        className="portal-primary-btn"
                                        disabled={mutating || uploadingLogEditPhotos}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="portal-ghost-btn"
                                        onClick={() => setEditingLogId(null)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </form>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      </article>
                    </div>

                    <article className="portal-card">
                      <div className="portal-card-header-row">
                        <div>
                          <h2 style={{ margin: 0 }}>Site Photos</h2>
                          <p className="portal-muted">Upload site photos and tag them with the construction stage.</p>
                        </div>
                        {canCreatePhoto ? (
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select
                              value={uploadStage}
                              onChange={(event) => setUploadStage(event.target.value as ConstructionStage)}
                            >
                              {STAGES.map((stage) => (
                                <option key={stage} value={stage}>
                                  Tag: {stageLabel(stage)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="portal-inline-btn"
                              disabled={uploading}
                              onClick={() => photoInputRef.current?.click()}
                            >
                              {uploading ? 'Uploading...' : 'Browse Photos'}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {canCreatePhoto ? (
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
                            if (!uploading) photoInputRef.current?.click();
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              if (!uploading) photoInputRef.current?.click();
                            }
                          }}
                        >
                          <strong>{uploading ? 'Uploading photos…' : 'Drag & drop site photos here'}</strong>
                          <p>PNG, JPG, or WebP. Photos are tagged with the stage selected above.</p>
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            onChange={(event) => {
                              if (event.target.files?.length) {
                                void addPhotoFiles(event.target.files);
                                event.target.value = '';
                              }
                            }}
                          />
                        </div>
                      ) : null}

                      {canCreatePhoto ? (
                        <div className="portal-action-row" style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            className="portal-inline-btn"
                            disabled={uploading}
                            onClick={() => setSitePhotoPickerOpen(true)}
                          >
                            Choose Existing
                          </button>
                        </div>
                      ) : null}

                      <ImagePicker
                        open={sitePhotoPickerOpen}
                        token={token}
                        multiple
                        onClose={() => setSitePhotoPickerOpen(false)}
                        onSelect={() => undefined}
                        // A site photo is a record, not just a URL, so the
                        // object key has to come through too.
                        onSelectItems={(items) => void attachExistingSitePhotos(items)}
                        title="Choose existing site photos"
                      />

                      <div className="portal-action-row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={photoStageFilter === 'ALL' ? 'portal-primary-btn' : 'portal-inline-btn'}
                          onClick={() => setPhotoStageFilter('ALL')}
                        >
                          All Stages
                        </button>
                        {STAGES.map((stage) => (
                          <button
                            key={stage}
                            type="button"
                            className={photoStageFilter === stage ? 'portal-primary-btn' : 'portal-inline-btn'}
                            onClick={() => setPhotoStageFilter(stage)}
                          >
                            {stageLabel(stage)}
                          </button>
                        ))}
                      </div>

                      <div className="portal-project-gallery-grid" style={{ marginTop: 16 }}>
                        {activePhotos.length === 0 ? (
                          <div className="portal-empty-state">No site photos uploaded for this filter yet.</div>
                        ) : (
                          activePhotos.map((photo) => (
                            <div key={photo.id} className="portal-project-gallery-item">
                              <img src={photo.url} alt="Site photo" className="portal-project-gallery-thumb" />
                              <div className="portal-gallery-item-actions">
                                <span className="portal-featured-badge" style={{ background: 'transparent', color: '#1a1c1c' }}>
                                  {photo.stage ? stageLabel(photo.stage) : 'Untagged'}
                                </span>
                                {canDeletePhoto ? (
                                  <button
                                    type="button"
                                    className="portal-inline-btn is-danger"
                                    onClick={() => void onDeletePhoto(photo.id)}
                                  >
                                    Remove
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </article>

                    <article className="portal-card">
                      <div className="portal-card-header-row">
                        <h2 style={{ margin: 0 }}>Site Inspections</h2>
                        {canCreateInspection ? (
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => setShowInspectionForm((prev) => !prev)}
                          >
                            {showInspectionForm ? 'Close' : 'Log Inspection'}
                          </button>
                        ) : null}
                      </div>

                      {showInspectionForm && canCreateInspection ? (
                        <form className="portal-entity-form portal-detail-form" onSubmit={onCreateInspection}>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Stage</span>
                              <select
                                value={inspectionForm.stage}
                                onChange={(event) =>
                                  setInspectionForm((prev) => ({ ...prev, stage: event.target.value as ConstructionStage }))
                                }
                              >
                                {STAGES.map((stage) => (
                                  <option key={stage} value={stage}>
                                    {stageLabel(stage)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Inspector Name</span>
                              <input
                                value={inspectionForm.inspectorName}
                                onChange={(event) =>
                                  setInspectionForm((prev) => ({ ...prev, inspectorName: event.target.value }))
                                }
                                required
                              />
                            </label>
                          </div>
                          <div className="portal-entity-grid-2">
                            <label>
                              <span>Inspection Date</span>
                              <input
                                type="date"
                                value={inspectionForm.inspectionDate}
                                onChange={(event) =>
                                  setInspectionForm((prev) => ({ ...prev, inspectionDate: event.target.value }))
                                }
                                required
                              />
                            </label>
                            <label>
                              <span>Outcome</span>
                              <select
                                value={inspectionForm.outcome}
                                onChange={(event) =>
                                  setInspectionForm((prev) => ({
                                    ...prev,
                                    outcome: event.target.value as InspectionOutcome,
                                  }))
                                }
                              >
                                <option value="PASSED">Passed</option>
                                <option value="FAILED">Failed</option>
                                <option value="NEEDS_FOLLOW_UP">Needs Follow-up</option>
                              </select>
                            </label>
                          </div>
                          <label>
                            <span>Findings</span>
                            <textarea
                              rows={3}
                              value={inspectionForm.findings}
                              onChange={(event) =>
                                setInspectionForm((prev) => ({ ...prev, findings: event.target.value }))
                              }
                              placeholder="Observations, defects, or follow-up actions"
                            />
                          </label>
                          <button type="submit" className="portal-primary-btn" disabled={mutating}>
                            {mutating ? 'Saving...' : 'Save Inspection'}
                          </button>
                        </form>
                      ) : null}

                      <div className="portal-list-stack">
                        {activeInspections.length === 0 ? (
                          <div className="portal-empty-state">No inspections recorded for this block yet.</div>
                        ) : (
                          activeInspections.map((inspection) => (
                            <div key={inspection.id} className="portal-record">
                              <div className="portal-list-row">
                                <div>
                                  <strong>
                                    {stageLabel(inspection.stage)} inspection by {inspection.inspectorName}
                                  </strong>
                                  <p>{inspection.findings || 'No findings recorded.'}</p>
                                  <p>{formatDate(inspection.inspectionDate)}</p>
                                </div>
                                <span className={outcomeClass(inspection.outcome)}>
                                  {inspection.outcome.replaceAll('_', ' ')}
                                </span>
                              </div>
                              {canDeleteInspection ? (
                                <div className="portal-action-row">
                                  <button
                                    type="button"
                                    className="portal-inline-btn is-danger"
                                    onClick={() => void onDeleteInspection(inspection.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </article>
                  </>
                ) : null}
              </div>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
