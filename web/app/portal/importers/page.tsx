"use client";

import Link from 'next/link';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { TourLauncher } from '../tours/tour-launcher';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { usePortalDialog } from '../components/portal-dialog';
import {
  API_BASE_URL,
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../accounting/lib';

type ImportField = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  hint?: string;
};

type Definition = {
  key: string;
  label: string;
  description: string;
  permissionSubject: string;
  uniqueBy?: string;
  fields: ImportField[];
};

type RowResult = {
  rowNumber: number;
  ok: boolean;
  values: Record<string, unknown>;
  errors: string[];
};

type Validation = {
  key: string;
  label: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: RowResult[];
};

/** Skips '#' comment lines so the template's instructions can be left in place. */
function parseCsv(text: string, fields: string[]) {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));
  if (!lines.length) return [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        out.push(current);
        current = '';
      } else current += ch;
    }
    out.push(current);
    return out.map((value) => value.trim());
  };

  const headers = splitLine(lines[0]).map((header) => header.trim());
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    if (values.every((value) => value === '')) continue;
    // rowNumber matches what the operator sees in their spreadsheet.
    const row: Record<string, unknown> = { rowNumber: i + 1 };
    headers.forEach((header, index) => {
      if (fields.includes(header)) row[header] = values[index] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

export default function ImportersPage() {
  const dialog = usePortalDialog();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();

  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [activeKey, setActiveKey] = useState<string>('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [preview, setPreview] = useState<Validation | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      const list = await apiRequest<Definition[]>('/data-imports', { method: 'GET' }, authToken);
      setDefinitions(list);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the importers.');
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

  const permissionFor = useCallback(
    (definition: Definition) =>
      `${definition.permissionSubject.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.create`,
    [],
  );

  const allowed = useMemo(
    () => definitions.filter((definition) => hasPermission(profile, permissionFor(definition))),
    [definitions, profile, permissionFor],
  );

  const active = useMemo(
    () => allowed.find((definition) => definition.key === activeKey) || null,
    [allowed, activeKey],
  );

  const roleLabel = useMemo(() => roleLabelFor(profile), [profile]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  function resetFile() {
    setRows([]);
    setPreview(null);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function readApiError(error: unknown, fallback: string) {
    const raw = error instanceof Error ? error.message : '';
    try {
      const parsed = JSON.parse(raw);
      const message = parsed?.message;
      if (Array.isArray(message)) return message.join(', ');
      if (typeof message === 'string') return message;
    } catch {
      // Not JSON; fall through.
    }
    return raw || fallback;
  }

  async function onDownloadTemplate(definition: Definition) {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/data-imports/${definition.key}/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${definition.key}-import-template.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(readApiError(error, 'Could not download the template.'));
    }
  }

  function onFileSelected(file: File, definition: Definition) {
    setErrorMessage(null);
    setFeedback(null);
    setPreview(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(
        String(reader.result || ''),
        definition.fields.map((field) => field.name),
      );
      setRows(parsed);
      setFileName(file.name);
      if (!parsed.length) {
        setErrorMessage('No data rows found. Check the file has a header row and at least one record.');
      }
    };
    reader.readAsText(file);
  }

  async function onValidate() {
    if (!token || !active || !rows.length) return;
    setBusy(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      setPreview(
        await apiRequest<Validation>(
          `/data-imports/${active.key}/validate`,
          { method: 'POST', body: JSON.stringify({ rows }) },
          token,
        ),
      );
    } catch (error) {
      setErrorMessage(readApiError(error, 'Could not check the file.'));
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!token || !active || !preview || preview.invalidRows > 0) return;

    const confirmed = await dialog.confirm({
      title: `Import ${preview.validRows} ${active.label.toLowerCase()}`,
      message:
        active.key === 'users'
          ? `This creates ${preview.validRows} staff accounts. They will have no roles until you assign them in RBAC.`
          : `This creates ${preview.validRows} records. Existing ones are never overwritten.`,
      confirmLabel: 'Import',
    });
    if (!confirmed) return;

    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await apiRequest<{ created: number; label: string }>(
        `/data-imports/${active.key}`,
        { method: 'POST', body: JSON.stringify({ rows }) },
        token,
      );
      setFeedback(`Imported ${result.created} ${result.label.toLowerCase()}.`);
      resetFile();
    } catch (error) {
      setErrorMessage(readApiError(error, 'Import failed. Nothing was created.'));
    } finally {
      setBusy(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-auth-section" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading importers...</article>
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

  const invalidRows = preview?.rows.filter((row) => !row.ok) || [];

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="importers"
            pageSubtitle="Load initial data from spreadsheets — one importer per kind of record."
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={hasPermission(profile, 'role.read')}
            onLogout={onLogout}
          >

            <article className="portal-card">
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>Not sure what a column means?</h2>
                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                    The column reference lists every importer, which columns are required and what
                    each one expects.
                  </p>
                </div>
                <Link href="/portal/importers/docs" className="portal-inline-btn">
                  Column Reference
                </Link>
              </div>
            </article>

            {!allowed.length ? (
              <article className="portal-card portal-role-banner">
                You do not have permission to import any kind of record.
              </article>
            ) : (
              <>
                <article className="portal-card" data-tour="importers.choose">
                  <h2 style={{ marginTop: 0 }}>1. Choose what to import</h2><TourLauncher tour="import-data" />
                  <div className="portal-list-stack">
                    {allowed.map((definition) => (
                      <div
                        key={definition.key}
                        className="portal-record"
                        style={
                          activeKey === definition.key
                            ? { borderColor: 'var(--eef-black)' }
                            : undefined
                        }
                      >
                        <div className="portal-list-row">
                          <div>
                            <strong>{definition.label}</strong>
                            <p>{definition.description}</p>
                            <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                              {definition.fields.filter((field) => field.required).length} required column
                              {definition.fields.filter((field) => field.required).length === 1 ? '' : 's'} of{' '}
                              {definition.fields.length}
                              {definition.uniqueBy ? ` • ${definition.uniqueBy} must be unique` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="portal-action-row">
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => {
                              setActiveKey(definition.key);
                              resetFile();
                              setErrorMessage(null);
                              setFeedback(null);
                            }}
                          >
                            {activeKey === definition.key ? 'Selected' : 'Select'}
                          </button>
                          <button
                            type="button"
                            className="portal-inline-btn"
                            onClick={() => void onDownloadTemplate(definition)}
                          >
                            Download Template
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                {active ? (
                  <article className="portal-card">
                    <h2 style={{ marginTop: 0 }}>2. Upload {active.label.toLowerCase()}</h2>

                    <div className="portal-info-list" style={{ marginBottom: 14 }}>
                      {active.fields.map((field) => (
                        <div key={field.name} className="portal-info-row">
                          <span>{field.name}</span>
                          <strong style={{ fontWeight: 400, fontSize: 13 }}>
                            {field.required ? 'Required. ' : 'Optional. '}
                            {field.hint || field.label}
                          </strong>
                        </div>
                      ))}
                    </div>

                    <div className="portal-entity-form">
                      <label>
                        <span>CSV File</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) onFileSelected(file, active);
                          }}
                        />
                      </label>
                      {fileName ? (
                        <p className="portal-muted" style={{ margin: 0 }}>
                          {fileName} — {rows.length} row{rows.length === 1 ? '' : 's'} read.
                        </p>
                      ) : null}
                      <div className="portal-inline-actions">
                        <button
                          type="button"
                          className="portal-primary-btn"
                          disabled={busy || !rows.length}
                          onClick={() => void onValidate()}
                        >
                          {busy ? 'Checking...' : 'Check File'}
                        </button>
                        {fileName ? (
                          <button type="button" className="portal-ghost-btn" onClick={resetFile}>
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ) : null}

                {preview ? (
                  <article className="portal-card" data-tour="importers.review">
                    <h2 style={{ marginTop: 0 }}>3. Review</h2>
                    <div className="portal-stats-grid">
                      <article className="portal-card portal-stat-card">
                        <span>Rows Ready</span>
                        <strong>{preview.validRows}</strong>
                      </article>
                      <article className="portal-card portal-stat-card">
                        <span>Rows With Errors</span>
                        <strong>{preview.invalidRows}</strong>
                      </article>
                      <article className="portal-card portal-stat-card">
                        <span>Total Rows</span>
                        <strong>{preview.totalRows}</strong>
                      </article>
                    </div>

                    {invalidRows.length ? (
                      <>
                        <h3 style={{ margin: '18px 0 8px', fontSize: 15 }}>
                          Fix these {invalidRows.length} rows
                        </h3>
                        <p className="portal-muted" style={{ marginTop: 0 }}>
                          Nothing is imported while any row has an error. Row numbers match your
                          spreadsheet.
                        </p>
                        <div className="portal-list-stack">
                          {invalidRows.slice(0, 50).map((row) => (
                            <div key={row.rowNumber} className="portal-record">
                              <div className="portal-list-row">
                                <div>
                                  <strong>Row {row.rowNumber}</strong>
                                  <p>{row.errors.join(' • ')}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                          {invalidRows.length > 50 ? (
                            <p className="portal-muted">…and {invalidRows.length - 50} more.</p>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 style={{ margin: '18px 0 8px', fontSize: 15 }}>Ready to import</h3>
                        <div className="portal-list-stack">
                          {preview.rows.slice(0, 25).map((row) => (
                            <div key={row.rowNumber} className="portal-list-row" style={{ fontSize: 13 }}>
                              <div>
                                <strong>
                                  {String(
                                    row.values[active?.fields[0].name || ''] ?? `Row ${row.rowNumber}`,
                                  )}
                                </strong>
                                <p>
                                  {Object.entries(row.values)
                                    .filter(([field]) => field !== active?.fields[0].name)
                                    .map(([field, value]) => `${field}: ${String(value)}`)
                                    .join(' • ')}
                                </p>
                              </div>
                            </div>
                          ))}
                          {preview.rows.length > 25 ? (
                            <p className="portal-muted">…and {preview.rows.length - 25} more rows.</p>
                          ) : null}
                        </div>
                        <div className="portal-inline-actions" style={{ marginTop: 14 }}>
                          <button
                            type="button"
                            className="portal-primary-btn"
                            disabled={busy}
                            onClick={() => void onImport()}
                          >
                            {busy ? 'Importing...' : `Import ${preview.validRows} ${active?.label}`}
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ) : null}

                <article className="portal-card">
                  <h2 style={{ marginTop: 0 }}>Other importers</h2>
                  <div className="portal-list-stack">
                    <div className="portal-list-row">
                      <div>
                        <strong>Project Expenses</strong>
                        <p>Historical spend, tagged to a project and expense category.</p>
                      </div>
                      <Link href="/portal/accounting/import" className="portal-inline-btn">
                        Open
                      </Link>
                    </div>
                  </div>
                </article>
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
