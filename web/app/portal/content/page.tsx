"use client";

import Link from 'next/link';
import { useFeedbackState } from '../components/notifications';
import { useErrorState } from '../components/notifications';
import { ImagePicker } from '../components/image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import {
  API_BASE_URL,
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  canReadRbacFor,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../accounting/lib';
import {
  Field,
  PAGE_SCHEMAS,
  PageSchema,
  Section,
  getAtPath,
  setAtPath,
} from './field-schema';

type PageContentResponse = {
  slug: string;
  label: string;
  content: Record<string, any>;
  isCustomised: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

type UploadResult = {
  url: string;
  objectKey: string;
  contentType: string;
  fileName: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
};

/** Cached per image URL so sizes survive switching between pages. */
type AssetMeta = { sizeBytes: number | null; width: number | null; height: number | null };

function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Advisory feedback comparing an upload against the slot's target size.
 * Never blocks a save -- an editor may knowingly use a different crop.
 */
function sizeWarning(field: Field, meta: AssetMeta | undefined) {
  if (!meta) return null;

  const notes: string[] = [];
  if (meta.sizeBytes && meta.sizeBytes > 1_500_000) {
    notes.push(`${formatBytes(meta.sizeBytes)} is heavy and will slow the page — consider compressing it.`);
  }

  if (field.recommendedWidth && field.recommendedHeight && meta.width && meta.height) {
    if (meta.width < field.recommendedWidth * 0.6 || meta.height < field.recommendedHeight * 0.6) {
      notes.push(
        `Smaller than the ${field.recommendedWidth}x${field.recommendedHeight} target — it may look soft when scaled up.`,
      );
    }
    const targetRatio = field.recommendedWidth / field.recommendedHeight;
    const actualRatio = meta.width / meta.height;
    // 25% tolerance: enough to catch a portrait image in a landscape slot
    // without nagging about a slightly different crop.
    if (Math.abs(actualRatio - targetRatio) / targetRatio > 0.25) {
      notes.push('Aspect ratio differs from the slot, so the image will be cropped to fit.');
    }
  }

  return notes.length > 0 ? notes.join(' ') : null;
}

export default function SiteContentPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ onChange: (next: string) => void; current: string } | null>(
    null,
  );
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [statusMessage, setStatusMessage] = useFeedbackState();

  const [activeSlug, setActiveSlug] = useState<string>(PAGE_SCHEMAS[0].slug);
  const [documents, setDocuments] = useState<Record<string, Record<string, any>>>({});
  const [meta, setMeta] = useState<Record<string, PageContentResponse>>({});
  const [assetMeta, setAssetMeta] = useState<Record<string, AssetMeta>>({});
  const [saving, setSaving] = useState(false);
  const [uploadingPath, setUploadingPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  const schema = useMemo(
    () => PAGE_SCHEMAS.find((page) => page.slug === activeSlug) as PageSchema,
    [activeSlug],
  );
  const canEdit = hasPermission(profile, 'page-content.update');

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);

      const pages = await apiRequest<PageContentResponse[]>('/page-content', { method: 'GET' }, authToken);
      const nextDocuments: Record<string, Record<string, any>> = {};
      const nextMeta: Record<string, PageContentResponse> = {};
      for (const page of pages) {
        nextDocuments[page.slug] = page.content;
        nextMeta[page.slug] = page;
      }
      setDocuments(nextDocuments);
      setMeta(nextMeta);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load page content.');
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

  /**
   * Looks up size metadata for images already referenced by the document, so
   * re-opening the CMS shows sizes without needing a fresh upload. Assets we
   * do not host (external URLs, files under /public) simply have no metadata.
   */
  const hydrateAssetMeta = useCallback(
    async (url: string) => {
      if (!token || !url || assetMeta[url]) return;
      const match = url.match(/\/media\/([^/?#]+)$/);
      if (!match) return;

      try {
        const stat = await apiRequest<AssetMeta>(`/media/stat/${match[1]}`, { method: 'GET' }, token);
        setAssetMeta((prev) => ({ ...prev, [url]: stat }));
      } catch {
        // Non-fatal: the field still renders, just without a size readout.
      }
    },
    [token, assetMeta],
  );

  useEffect(() => {
    const document = documents[activeSlug];
    if (!document || !schema) return;

    const urls: string[] = [];
    for (const section of schema.sections) {
      for (const field of section.fields || []) {
        if (field.type === 'image') {
          const value = getAtPath(document, field.path);
          if (typeof value === 'string' && value) urls.push(value);
        }
      }
      const repeatable = section.repeatable;
      if (repeatable) {
        const entries = getAtPath(document, repeatable.path);
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            for (const field of repeatable.fields) {
              if (field.type === 'image' && typeof entry?.[field.path] === 'string' && entry[field.path]) {
                urls.push(entry[field.path]);
              }
            }
          }
        }
      }
    }
    for (const url of urls) void hydrateAssetMeta(url);
  }, [documents, activeSlug, schema, hydrateAssetMeta]);

  function updateDocument(mutate: (document: Record<string, any>) => Record<string, any>) {
    setDocuments((prev) => ({ ...prev, [activeSlug]: mutate(prev[activeSlug] || {}) }));
    setDirty((prev) => ({ ...prev, [activeSlug]: true }));
    setStatusMessage(null);
  }

  async function uploadImage(file: File, applyUrl: (url: string) => void, fieldKey: string) {
    if (!token) return;
    setUploadingPath(fieldKey);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_BASE_URL}/media/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        throw new Error((await response.text()) || 'Upload failed.');
      }
      const uploaded = (await response.json()) as UploadResult;
      setAssetMeta((prev) => ({
        ...prev,
        [uploaded.url]: { sizeBytes: uploaded.sizeBytes, width: uploaded.width, height: uploaded.height },
      }));
      applyUrl(uploaded.url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploadingPath(null);
    }
  }

  async function onSave() {
    if (!token || saving) return;
    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const saved = await apiRequest<PageContentResponse>(
        `/page-content/${activeSlug}`,
        { method: 'PUT', body: JSON.stringify({ content: documents[activeSlug] || {} }) },
        token,
      );
      setMeta((prev) => ({ ...prev, [activeSlug]: saved }));
      setDocuments((prev) => ({ ...prev, [activeSlug]: saved.content }));
      setDirty((prev) => ({ ...prev, [activeSlug]: false }));
      setStatusMessage(`${schema.label} page updated and published.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save.');
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    if (!token || saving) return;
    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const reverted = await apiRequest<PageContentResponse>(
        `/page-content/${activeSlug}`,
        { method: 'DELETE' },
        token,
      );
      setMeta((prev) => ({ ...prev, [activeSlug]: reverted }));
      setDocuments((prev) => ({ ...prev, [activeSlug]: reverted.content }));
      setDirty((prev) => ({ ...prev, [activeSlug]: false }));
      setStatusMessage(`${schema.label} page reverted to the built-in copy.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to reset.');
    } finally {
      setSaving(false);
    }
  }

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  function renderImageField(field: Field, value: string, onChange: (next: string) => void, fieldKey: string) {
    const currentMeta = value ? assetMeta[value] : undefined;
    const warning = sizeWarning(field, currentMeta);
    const isUploading = uploadingPath === fieldKey;

    return (
      <div className="portal-cms-image-field">
        <div className="portal-cms-image-preview">
          {value ? <img src={value} alt={field.label} /> : <div className="portal-cms-image-empty">No image</div>}
        </div>
        <div className="portal-cms-image-body">
          <div className="portal-cms-image-meta">
            {field.recommendedWidth && field.recommendedHeight ? (
              <span className="portal-chip">
                Recommended {field.recommendedWidth}x{field.recommendedHeight}
              </span>
            ) : null}
            {currentMeta?.width && currentMeta?.height ? (
              <span className="portal-chip">
                Actual {currentMeta.width}x{currentMeta.height}
              </span>
            ) : null}
            {formatBytes(currentMeta?.sizeBytes) ? (
              <span className="portal-chip">{formatBytes(currentMeta?.sizeBytes)}</span>
            ) : null}
          </div>
          {warning ? <p className="portal-cms-image-warning">{warning}</p> : null}
          <input
            type="text"
            value={value}
            placeholder="Image URL, or upload below"
            onChange={(event) => onChange(event.target.value)}
            disabled={!canEdit}
          />
          <div className="portal-action-row">
            <label className={`portal-inline-btn${canEdit ? '' : ' is-disabled'}`}>
              {isUploading ? 'Uploading...' : 'Upload image'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                disabled={!canEdit || isUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void uploadImage(file, onChange, fieldKey);
                }}
              />
            </label>
            <button
              type="button"
              className="portal-inline-btn"
              disabled={!canEdit}
              onClick={() => setPicker({ onChange, current: value })}
            >
              Choose existing
            </button>
            {value ? (
              <button type="button" className="portal-inline-btn is-danger" disabled={!canEdit} onClick={() => onChange('')}>
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  function renderField(field: Field, value: any, onChange: (next: any) => void, fieldKey: string) {
    if (field.type === 'image') {
      return renderImageField(field, typeof value === 'string' ? value : '', onChange, fieldKey);
    }

    // Both edit an array of strings; they differ only in the separator.
    // stringList is for prose paragraphs (blank-line separated, so a paragraph
    // can wrap), lineList for short items like feature bullets.
    if (field.type === 'stringList' || field.type === 'lineList') {
      const isLineList = field.type === 'lineList';
      const separator = isLineList ? '\n' : '\n\n';
      const splitPattern = isLineList ? /\n/ : /\n{2,}/;
      const text = Array.isArray(value) ? value.join(separator) : String(value || '');
      return (
        <textarea
          rows={isLineList ? 5 : 8}
          value={text}
          disabled={!canEdit}
          onChange={(event) =>
            onChange(
              event.target.value
                .split(splitPattern)
                .map((entry) => entry.trim())
                .filter(Boolean),
            )
          }
        />
      );
    }

    // Sections that hide until they have real content are toggled rather than
    // switched by typing "true" into a text box.
    if (field.type === 'boolean') {
      return (
        <label className="portal-check">
          <input
            type="checkbox"
            checked={value === true || value === 'true'}
            disabled={!canEdit}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>Show this section</span>
        </label>
      );
    }

    if (field.type === 'textarea') {
      return (
        <textarea
          rows={3}
          value={String(value ?? '')}
          disabled={!canEdit}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    }

    return (
      <input
        type="text"
        value={String(value ?? '')}
        disabled={!canEdit}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  function renderSection(section: Section) {
    const document = documents[activeSlug] || {};

    return (
      <article key={section.key} className="portal-card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px' }}>{section.title}</h3>
        {section.description ? (
          <p className="portal-muted" style={{ margin: '0 0 12px' }}>
            {section.description}
          </p>
        ) : null}

        {(section.fields || []).map((field) => (
          <label key={field.path} className="portal-cms-field">
            <span>{field.label}</span>
            {renderField(
              field,
              getAtPath(document, field.path),
              (next) => updateDocument((current) => setAtPath(current, field.path, next)),
              `${section.key}:${field.path}`,
            )}
            {field.help ? <small className="portal-muted">{field.help}</small> : null}
          </label>
        ))}

        {section.repeatable
          ? (() => {
              const repeatable = section.repeatable!;
              const entries: any[] = getAtPath(document, repeatable.path) || [];
              return (
                <div>
                  {entries.length === 0 ? (
                    <div className="portal-empty-state">No {repeatable.label.toLowerCase()} entries yet.</div>
                  ) : (
                    entries.map((entry, index) => (
                      <div key={index} className="portal-cms-entry">
                        <div className="portal-card-header-row">
                          <strong>
                            {repeatable.label} {index + 1}
                          </strong>
                          <button
                            type="button"
                            className="portal-inline-btn is-danger"
                            disabled={!canEdit}
                            onClick={() =>
                              updateDocument((current) =>
                                setAtPath(
                                  current,
                                  repeatable.path,
                                  entries.filter((_, position) => position !== index),
                                ),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                        {repeatable.fields.map((field) => (
                          <label key={field.path} className="portal-cms-field">
                            <span>{field.label}</span>
                            {renderField(
                              field,
                              entry?.[field.path],
                              (next) =>
                                updateDocument((current) =>
                                  setAtPath(
                                    current,
                                    repeatable.path,
                                    entries.map((item, position) =>
                                      position === index ? { ...item, [field.path]: next } : item,
                                    ),
                                  ),
                                ),
                              `${section.key}:${index}:${field.path}`,
                            )}
                            {field.help ? <small className="portal-muted">{field.help}</small> : null}
                          </label>
                        ))}
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    className="portal-inline-btn"
                    disabled={!canEdit}
                    onClick={() =>
                      updateDocument((current) =>
                        setAtPath(current, repeatable.path, [...entries, { ...repeatable.blank }]),
                      )
                    }
                  >
                    {repeatable.addLabel}
                  </button>
                </div>
              );
            })()
          : null}
      </article>
    );
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading site content...</article>
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

  const activeMeta = meta[activeSlug];
  const isDirty = Boolean(dirty[activeSlug]);

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="content"
            pageTitle="Site Content"
            pageSubtitle="Edit the copy and imagery on the public marketing pages. Changes publish immediately."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {statusMessage ? (
              <article className="portal-card portal-role-banner">{statusMessage}</article>
            ) : null}
            {!canEdit ? (
              <article className="portal-card portal-role-banner">
                You can view this content but not change it. Editing needs the page-content.update permission.
              </article>
            ) : null}

            <div className="portal-action-row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
              {PAGE_SCHEMAS.map((page) => (
                <button
                  key={page.slug}
                  type="button"
                  className={`portal-inline-btn${activeSlug === page.slug ? ' is-active' : ''}`}
                  onClick={() => setActiveSlug(page.slug)}
                >
                  {page.label}
                  {dirty[page.slug] ? ' •' : ''}
                </button>
              ))}
            </div>

            <article className="portal-card" style={{ marginBottom: 16 }}>
              <div className="portal-card-header-row">
                <div>
                  <p className="portal-kicker">Editing</p>
                  <h2 style={{ margin: '4px 0 0' }}>{schema.label} page</h2>
                  <p className="portal-muted" style={{ margin: '6px 0 0' }}>
                    {activeMeta?.isCustomised
                      ? `Last updated ${activeMeta.updatedAt ? new Date(activeMeta.updatedAt).toLocaleString('en-GB') : ''}${
                          activeMeta.updatedBy ? ` by ${activeMeta.updatedBy}` : ''
                        }.`
                      : 'Showing the built-in copy — this page has not been edited yet.'}
                  </p>
                </div>
                <div className="portal-action-row">
                  <Link href={schema.href} target="_blank" className="portal-inline-btn">
                    View page
                  </Link>
                  {canEdit ? (
                    <>
                      <button
                        type="button"
                        className="portal-inline-btn"
                        disabled={saving || !activeMeta?.isCustomised}
                        onClick={() => void onReset()}
                      >
                        Revert to default
                      </button>
                      <button
                        type="button"
                        className="portal-primary-btn"
                        disabled={saving || !isDirty}
                        onClick={() => void onSave()}
                      >
                        {saving ? 'Publishing...' : isDirty ? 'Publish changes' : 'No changes'}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>

            {schema.sections.map((section) => renderSection(section))}

            <ImagePicker
              open={Boolean(picker)}
              token={token}
              onClose={() => setPicker(null)}
              onSelect={([url]) => picker?.onChange(url)}
              usedUrls={picker?.current ? [picker.current] : []}
              title="Choose an existing image"
            />
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
