"use client";

/**
 * Settings: the ids and secrets that connect the shop to Facebook, Instagram, Threads, X and TikTok (and the ad-tracking pixels).
 *
 * They are kept encrypted on the server. This screen is only ever told whether a secret is set and its last four characters, never the secret, so
 * there is nothing to copy out of it: to change one you type the new value, to keep it you leave the box empty. Ids, which are not secret, are shown.
 * Each group can be checked with a harmless call to the platform, using what is saved.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { CollapseCard } from '../components/collapse-card';
import { usePortalDialog } from '../components/portal-dialog';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { useUnsavedGuard } from '../components/use-unsaved-guard';
import { AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, hasPermission, loadProfile, roleLabelFor } from '../accounting/lib';

type Field = {
  key: string; label: string; secret: boolean; help: string | null; set: boolean;
  source: 'PORTAL' | 'ENV_SEED' | 'SERVER' | null;
  value: string | null; last4: string | null; updatedAt: string | null; updatedBy: string | null; error: string | null;
};
type Group = { id: string; label: string; description: string; testable: boolean; fields: Field[] };
type Overview = { encryptionReady: boolean; groups: Group[] };

const SOURCE: Record<string, string> = {
  PORTAL: 'saved here',
  ENV_SEED: 'copied from the server\'s settings',
  SERVER: 'from the server\'s settings, not yet saved here',
};

const errorText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  try { const m = JSON.parse(raw)?.message; return Array.isArray(m) ? m.join(' ') : m || raw; } catch { return raw; }
};

export function SettingsView() {
  const [initialized, setInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const dialog = usePortalDialog();
  const guard = useUnsavedGuard();

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    setToken(saved);
    setInitialized(true);
    if (saved) void loadProfile(saved).then(setProfile).catch(() => setProfile(null));
  }, []);

  const load = useCallback(async (authToken: string) => {
    try {
      setOverview(await apiRequest<Overview>('/credentials', { method: 'GET' }, authToken));
    } catch (error) {
      setErrorMessage(errorText(error));
    }
  }, [setErrorMessage]);

  useEffect(() => { if (token) void load(token); }, [token, load]);

  if (!initialized || (token && !profile)) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
          <article className="portal-card portal-loading">Loading...</article>
        </section></main>
      </EliteLayout>
    );
  }
  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
          <article className="portal-card">
            <h2>Authentication required</h2>
            <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>Go to Portal Login</Link>
          </article>
        </section></main>
      </EliteLayout>
    );
  }

  const canRead = hasPermission(profile, 'credential.read');
  const canEdit = hasPermission(profile, 'credential.update');

  /** What has been typed in a group that differs from what is saved: a secret box is a change when it has anything in it, an id when it differs. */
  const changesIn = (group: Group) => Object.fromEntries(group.fields.flatMap((f) => {
    const typed = drafts[f.key];
    if (typed === undefined) return [];
    if (f.secret ? typed.trim() === '' : typed.trim() === (f.value ?? '')) return [];
    return [[f.key, typed.trim()]];
  }));

  function edit(key: string, value: string) {
    setDrafts((d) => ({ ...d, [key]: value }));
    guard.markDirty();
  }

  async function onSave(group: Group) {
    const values = changesIn(group);
    if (!Object.keys(values).length) return;
    setBusy(`save:${group.id}`);
    try {
      const out = await apiRequest<Overview & { changed: string[] }>('/credentials', { method: 'PUT', body: JSON.stringify({ credentials: values }) }, token!);
      setOverview(out);
      setDrafts((d) => { const next = { ...d }; for (const k of Object.keys(values)) delete next[k]; return next; });
      if (!Object.keys(drafts).some((k) => !(k in values))) guard.markClean();
      setResults((r) => { const next = { ...r }; delete next[group.id]; return next; });
      setFeedback(`${group.label}: saved ${out.changed.length} value${out.changed.length === 1 ? '' : 's'}, encrypted.`);
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function onClear(group: Group, field: Field) {
    const ok = await dialog.confirm({
      title: `Remove ${field.label}?`,
      message: `${group.label} stops using it until you enter a new one. ${group.id === 'facebook' && field.key === 'FACEBOOK_PAGE_ACCESS_TOKEN' ? 'Facebook, Instagram and the comment replies all use this token. ' : ''}The old value is not kept.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    setBusy(`clear:${field.key}`);
    try {
      setOverview(await apiRequest<Overview>(`/credentials/${field.key}`, { method: 'DELETE' }, token!));
      setDrafts((d) => { const next = { ...d }; delete next[field.key]; return next; });
      setFeedback(`${field.label} removed.`);
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function onTest(group: Group) {
    if (group.id === 'x') {
      const ok = await dialog.confirm({ title: 'Check the X keys?', message: 'This makes one small request to X, which may charge a fraction of a cent from your X credit.', confirmLabel: 'Check' });
      if (!ok) return;
    }
    setBusy(`test:${group.id}`);
    try {
      const result = await apiRequest<{ ok: boolean; message: string }>(`/credentials/test/${group.id}`, { method: 'POST' }, token!);
      setResults((r) => ({ ...r, [group.id]: result }));
    } catch (error) {
      setResults((r) => ({ ...r, [group.id]: { ok: false, message: errorText(error) } }));
    } finally {
      setBusy(null);
    }
  }

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

  const statusOf = (group: Group) => {
    const set = group.fields.filter((f) => f.set).length;
    return set === 0 ? { label: 'Not set', cls: 'portal-chip is-muted' }
      : set === group.fields.length ? { label: 'Set', cls: 'portal-chip is-success' }
      : { label: `${set} of ${group.fields.length} set`, cls: 'portal-chip' };
  };

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="settings"
            pageTitle="Settings"
            pageSubtitle="The connections to Facebook, Instagram, Threads, X and TikTok."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}
            {feedback ? <article className="portal-card portal-success">{feedback}</article> : null}
            {!canRead ? (
              <article className="portal-card"><p className="portal-muted" style={{ margin: 0 }}>Your role cannot see settings.</p></article>
            ) : !overview ? (
              <article className="portal-card portal-loading">Loading...</article>
            ) : (
              <>
                <article className="portal-card" style={{ marginBottom: 20 }}>
                  <h2 style={{ marginTop: 0 }}>How these are kept</h2>
                  <p className="portal-muted" style={{ margin: 0 }}>
                    Everything here is stored encrypted, and this page is never sent a secret: it shows whether one is set and its last four characters. To change a secret, type the new value
                    and save; leave a box empty to keep what is saved. Turn each channel on, choose its times and connect TikTok on <Link href="/portal/social">Social Posting</Link>.
                  </p>
                  {!overview.encryptionReady ? (
                    <p className="portal-error" style={{ margin: '12px 0 0' }}>
                      The server has no encryption key (CREDENTIALS_ENCRYPTION_KEY), so nothing can be saved here. The connections keep working from the server&apos;s own settings.
                    </p>
                  ) : null}
                </article>

                {overview.groups.map((group) => {
                  const status = statusOf(group);
                  const changes = changesIn(group);
                  const dirty = Object.keys(changes).length > 0;
                  const result = results[group.id];
                  return (
                    <CollapseCard key={group.id} title={group.label} summary={status.label} forceOpen={dirty} style={{ marginBottom: 20 }}>
                      <div className="portal-card-header-row">
                        <span className={status.cls}>{status.label}</span>
                      </div>
                      <p className="portal-muted" style={{ margin: '4px 0 12px' }}>{group.description}</p>

                      <div className="psettings-fields">
                        {group.fields.map((field) => {
                          const typed = drafts[field.key];
                          return (
                            <div key={field.key} className="psettings-field">
                              <label htmlFor={`cred-${field.key}`}>{field.label}</label>
                              <input
                                id={`cred-${field.key}`}
                                type={field.secret ? 'password' : 'text'}
                                autoComplete="off"
                                spellCheck={false}
                                data-lpignore="true"
                                disabled={!canEdit || !overview.encryptionReady}
                                placeholder={field.secret ? (field.set ? 'Leave empty to keep the saved value' : 'Enter the value') : 'Enter the value'}
                                value={typed ?? (field.secret ? '' : field.value ?? '')}
                                onChange={(e) => edit(field.key, e.target.value)}
                              />
                              <small className="portal-muted">
                                {field.set
                                  ? <>Set{field.secret ? (field.last4 ? <> · ends in <strong>{field.last4}</strong></> : ' · value hidden') : null}
                                      {field.source ? ` · ${SOURCE[field.source]}` : ''}
                                      {field.updatedAt && field.source !== 'SERVER' ? ` · ${formatDateTime(field.updatedAt)}${field.updatedBy && field.updatedBy !== 'system' ? ` by ${field.updatedBy}` : ''}` : ''}</>
                                  : 'Not set.'}
                                {field.help ? ` ${field.help}` : ''}
                              </small>
                              {field.error ? <small className="portal-error">{field.error}</small> : null}
                              {canEdit && overview.encryptionReady && field.set ? (
                                <button type="button" className="portal-inline-btn psettings-clear" disabled={busy === `clear:${field.key}`} onClick={() => void onClear(group, field)}>Remove</button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>

                      {result ? <p className={result.ok ? 'portal-success' : 'portal-error'} style={{ margin: '12px 0 0', padding: '8px 12px', borderRadius: 6 }} role="status">{result.message}</p> : null}

                      {canEdit ? (
                        <div className="portal-action-row" style={{ marginTop: 14 }}>
                          <button type="button" className="portal-primary-btn" disabled={!dirty || busy === `save:${group.id}` || !overview.encryptionReady} onClick={() => void onSave(group)}>
                            {busy === `save:${group.id}` ? 'Saving…' : 'Save'}
                          </button>
                          {group.testable ? (
                            <button type="button" className="portal-inline-btn" disabled={dirty || busy === `test:${group.id}`} onClick={() => void onTest(group)} title={dirty ? 'Save first: the check uses what is saved' : undefined}>
                              {busy === `test:${group.id}` ? 'Checking…' : 'Test connection'}
                            </button>
                          ) : null}
                          {dirty ? <button type="button" className="portal-inline-btn" onClick={() => setDrafts((d) => { const next = { ...d }; for (const f of group.fields) delete next[f.key]; return next; })}>Undo</button> : null}
                        </div>
                      ) : null}
                    </CollapseCard>
                  );
                })}
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
