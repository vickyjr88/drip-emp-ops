"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { usePortalDialog } from '../../components/portal-dialog';
import {
  API_BASE_URL,
  AuthProfile,
  TOKEN_KEY,
  apiRequest,
  formatDate,
  formatMoney,
  hasPermission,
  loadProfile,
  roleLabelFor,
} from '../lib';

type Project = { id: string; code: string; name: string };
type ChartOfAccount = { id: string; code: string; name: string; type: string; parentId?: string | null };

type ImportRow = {
  rowNumber: number;
  date?: string;
  description?: string;
  amount?: string;
  accountCode?: string;
  projectCode?: string;
};

type RowResult = {
  rowNumber: number;
  ok: boolean;
  date?: string;
  description?: string;
  amount?: number;
  accountCode?: string;
  accountName?: string;
  projectCode?: string;
  projectName?: string;
  errors: string[];
};

type ValidationResult = {
  creditAccount: { code: string; name: string };
  totalRows: number;
  validRows: number;
  invalidRows: number;
  totalAmount: number;
  rows: RowResult[];
};

type Batch = { batchRef: string; entryCount: number; importedAt: string };

/**
 * Minimal CSV reader: handles quoted fields and skips the '#' comment lines the
 * template ships its instructions in.
 */
function parseCsv(text: string): ImportRow[] {
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

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ''));
  const index = (name: string) => headers.indexOf(name.toLowerCase());
  const iDate = index('date');
  const iDesc = index('description');
  const iAmount = index('amount');
  const iAccount = index('accountcode');
  const iProject = index('projectcode');

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    if (values.every((value) => value === '')) continue;
    rows.push({
      // +1 for the header, +1 because spreadsheets are 1-indexed, so this
      // matches what the operator sees in Excel.
      rowNumber: i + 1,
      date: iDate >= 0 ? values[iDate] : undefined,
      description: iDesc >= 0 ? values[iDesc] : undefined,
      amount: iAmount >= 0 ? values[iAmount] : undefined,
      accountCode: iAccount >= 0 ? values[iAccount] : undefined,
      projectCode: iProject >= 0 ? values[iProject] : undefined,
    });
  }
  return rows;
}

export default function ExpenseImportPage() {
  const dialog = usePortalDialog();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();

  const [projects, setProjects] = useState<Project[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [preview, setPreview] = useState<ValidationResult | null>(null);
  const [defaultProjectCode, setDefaultProjectCode] = useState('');
  const [creditAccountCode, setCreditAccountCode] = useState('1000');

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const nextProfile = await loadProfile(authToken);
      setProfile(nextProfile);
      const [nextProjects, nextAccounts, nextBatches] = await Promise.all([
        hasPermission(nextProfile, 'project.read')
          ? apiRequest<Project[]>('/projects', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'chart-of-account.read')
          ? apiRequest<ChartOfAccount[]>('/chart-of-accounts', { method: 'GET' }, authToken)
          : Promise.resolve([]),
        hasPermission(nextProfile, 'journal-entry.read')
          ? apiRequest<Batch[]>('/expense-imports/batches', { method: 'GET' }, authToken)
          : Promise.resolve([]),
      ]);
      setProjects(nextProjects);
      setAccounts(nextAccounts);
      setBatches(nextBatches);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load the import page.');
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

  const canImport = hasPermission(profile, 'journal-entry.create');
  const canDelete = hasPermission(profile, 'journal-entry.delete');
  const roleLabel = useMemo(() => roleLabelFor(profile), [profile]);
  const cashAccounts = useMemo(
    () => accounts.filter((account) => account.type === 'ASSET'),
    [accounts],
  );

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  async function onDownloadTemplate() {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/expense-imports/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'project-expense-template.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not download the template.');
    }
  }

  function onFileSelected(file: File) {
    setErrorMessage(null);
    setFeedback(null);
    setPreview(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ''));
      setRows(parsed);
      setFileName(file.name);
      if (!parsed.length) {
        setErrorMessage('No data rows found. Check the file has a header row and at least one entry.');
      }
    };
    reader.readAsText(file);
  }

  async function onValidate() {
    if (!token || !rows.length) return;
    setBusy(true);
    setErrorMessage(null);
    setFeedback(null);
    try {
      const result = await apiRequest<ValidationResult>(
        '/expense-imports/validate',
        {
          method: 'POST',
          body: JSON.stringify({ rows, defaultProjectCode: defaultProjectCode || undefined, creditAccountCode }),
        },
        token,
      );
      setPreview(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not check the file.');
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!token || !preview || preview.invalidRows > 0) return;

    const confirmed = await dialog.confirm({
      title: 'Import these expenses',
      message: `This posts ${preview.validRows} entries totalling ${formatMoney(preview.totalAmount)}. You can delete the batch afterwards if something is wrong.`,
      confirmLabel: 'Import',
    });
    if (!confirmed) return;

    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await apiRequest<{ batchRef: string; entriesCreated: number; totalAmount: number }>(
        '/expense-imports',
        {
          method: 'POST',
          body: JSON.stringify({ rows, defaultProjectCode: defaultProjectCode || undefined, creditAccountCode }),
        },
        token,
      );
      setFeedback(
        `Imported ${result.entriesCreated} entries totalling ${formatMoney(result.totalAmount)} as batch ${result.batchRef}.`,
      );
      setRows([]);
      setPreview(null);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Import failed. Nothing was posted.');
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteBatch(batch: Batch) {
    if (!token || !canDelete) return;
    const confirmed = await dialog.confirm({
      title: 'Delete this import',
      message: `This permanently removes all ${batch.entryCount} entries from ${batch.batchRef}, both sides of each. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await apiRequest<{ entriesDeleted: number }>(
        `/expense-imports/batches/${encodeURIComponent(batch.batchRef)}`,
        { method: 'DELETE' },
        token,
      );
      setFeedback(`Deleted ${result.entriesDeleted} entries from ${batch.batchRef}.`);
      await load(token);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete the batch.');
    } finally {
      setBusy(false);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container portal-auth-section" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading importer...</article>
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
              <a href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>
                Go to Portal Login
              </a>
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
            active="accounting"
            pageTitle="Import Project Expenses"
            pageSubtitle="Bring historical spend in from a spreadsheet, one row per payment."
            email={profile.email}
            roleLabel={roleLabel}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={hasPermission(profile, 'role.read')}
            onLogout={onLogout}
          >

            {!canImport ? (
              <article className="portal-card portal-role-banner">
                You do not have permission to import journal entries.
              </article>
            ) : (
              <>
                <article className="portal-card">
                  <div className="portal-card-header-row">
                    <div>
                      <h2 style={{ margin: 0 }}>1. Start from the template</h2>
                      <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                        The template lists every category and project code, with instructions inside the
                        file.
                      </p>
                    </div>
                    <button type="button" className="portal-inline-btn" onClick={() => void onDownloadTemplate()}>
                      Download Template
                    </button>
                  </div>

                  <div className="portal-info-list" style={{ marginTop: 12 }}>
                    <div className="portal-info-row">
                      <span>Columns</span>
                      <strong style={{ fontWeight: 400, fontSize: 13 }}>
                        date, description, amount, accountCode, projectCode
                      </strong>
                    </div>
                    <div className="portal-info-row">
                      <span>Tag the category</span>
                      <strong style={{ fontWeight: 400, fontSize: 13 }}>
                        Put an expense account code in <code>accountCode</code> — this decides which
                        heading the spend appears under on the project cost report.
                      </strong>
                    </div>
                    <div className="portal-info-row">
                      <span>Tag the project</span>
                      <strong style={{ fontWeight: 400, fontSize: 13 }}>
                        Put a project code in <code>projectCode</code>, or leave it blank and choose a
                        default below. Set it per row to mix projects in one file.
                      </strong>
                    </div>
                    <div className="portal-info-row">
                      <span>Shared costs</span>
                      <strong style={{ fontWeight: 400, fontSize: 13 }}>
                        Enter each project&apos;s share as its own row.
                      </strong>
                    </div>
                    <div className="portal-info-row">
                      <span>Leave out</span>
                      <strong style={{ fontWeight: 400, fontSize: 13 }}>
                        Subtotal and running-total rows — they would be imported as extra expenses.
                      </strong>
                    </div>
                  </div>

                  <h3 style={{ margin: '18px 0 8px', fontSize: 15 }}>Category codes</h3>
                  <div className="portal-list-stack">
                    {accounts
                      .filter((account) => account.type === 'EXPENSE' && account.parentId)
                      .sort((a, b) => a.code.localeCompare(b.code))
                      .map((account) => (
                        <div key={account.id} className="portal-list-row" style={{ fontSize: 13 }}>
                          <span>
                            <strong>{account.code}</strong> — {account.name}
                          </span>
                        </div>
                      ))}
                  </div>

                  <h3 style={{ margin: '18px 0 8px', fontSize: 15 }}>Project codes</h3>
                  <div className="portal-list-stack">
                    {projects.map((project) => (
                      <div key={project.id} className="portal-list-row" style={{ fontSize: 13 }}>
                        <span>
                          <strong>{project.code}</strong> — {project.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="portal-card">
                  <h2 style={{ marginTop: 0 }}>2. Upload and check</h2>
                  <div className="portal-entity-form">
                    <div className="portal-entity-grid-3">
                      <label>
                        <span>CSV File</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) onFileSelected(file);
                          }}
                        />
                      </label>
                      <label>
                        <span>Default Project (for rows with none)</span>
                        <select
                          value={defaultProjectCode}
                          onChange={(event) => setDefaultProjectCode(event.target.value)}
                        >
                          <option value="">Each row must specify one</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.code}>
                              {project.code} — {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Paid From</span>
                        <select
                          value={creditAccountCode}
                          onChange={(event) => setCreditAccountCode(event.target.value)}
                        >
                          {cashAccounts.map((account) => (
                            <option key={account.id} value={account.code}>
                              {account.code} — {account.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {fileName ? (
                      <p className="portal-muted" style={{ margin: 0 }}>
                        {fileName} — {rows.length} data row{rows.length === 1 ? '' : 's'} read.
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
                    </div>
                  </div>
                </article>

                {preview ? (
                  <article className="portal-card">
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
                        <span>Total To Import</span>
                        <strong>{formatMoney(preview.totalAmount)}</strong>
                      </article>
                      <article className="portal-card portal-stat-card">
                        <span>Paid From</span>
                        <strong>{preview.creditAccount.code}</strong>
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
                                <strong>{row.description}</strong>
                                <p>
                                  {row.date} • {row.accountCode} {row.accountName} • {row.projectCode}{' '}
                                  {row.projectName}
                                </p>
                              </div>
                              <span>{formatMoney(row.amount || 0)}</span>
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
                            {busy ? 'Importing...' : `Import ${preview.validRows} Entries`}
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ) : null}

                <article className="portal-card">
                  <h2 style={{ marginTop: 0 }}>Previous Imports</h2>
                  <p className="portal-muted" style={{ marginTop: 0 }}>
                    Deleting a batch removes every entry it created, both sides of each. Use this if a file
                    was imported by mistake.
                  </p>
                  <div className="portal-list-stack">
                    {!batches.length ? (
                      <div className="portal-empty-state">No imports yet.</div>
                    ) : (
                      batches.map((batch) => (
                        <div key={batch.batchRef} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>{batch.batchRef}</strong>
                              <p>
                                {batch.entryCount} entries • imported {formatDate(batch.importedAt)}
                              </p>
                            </div>
                          </div>
                          {canDelete ? (
                            <div className="portal-action-row">
                              <button
                                type="button"
                                className="portal-inline-btn is-danger"
                                disabled={busy}
                                onClick={() => void onDeleteBatch(batch)}
                              >
                                Delete This Import
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
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
