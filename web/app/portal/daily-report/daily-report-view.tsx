"use client";

/**
 * Daily report settings: who the morning report goes to, whether it goes at all, what it will say, and what was sent.
 *
 * The report is built and sent by the server (backend/src/daily-report). This screen only edits who receives it and lets
 * staff look at it or send it now. Until a list is saved here the server uses its defaults: the owner's email and the
 * owner's WhatsApp number. Saving replaces them, and a saved empty list means nobody on that channel.
 */

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { usePortalDialog } from '../components/portal-dialog';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Settings = {
  enabled: boolean; emailRecipients: string[]; whatsappRecipients: string[];
  isCustomised: boolean; whatsappConfigured: boolean; whatsappTemplate: string;
};
type Run = { id: string; reportDate: string; channel: 'EMAIL' | 'WHATSAPP'; recipient: string; status: 'SENT' | 'FAILED' | 'SKIPPED' | 'PENDING'; error?: string | null; updatedAt: string };
type Preview = { report: { label: string; shopName: string }; email: { subject: string }; whatsappParameters: string[] };
type Delivery = { dateKey: string; skipped?: string; email: { recipient: string; status: string; error?: string }[]; whatsapp: { recipient: string; status: string; error?: string }[] };

/** The approved template's wording, so staff can read the message as the recipient will. Matches `daily_report` in WhatsApp Manager. */
const TEMPLATE_TEXT = 'Daily report for {{1}} ({{2}}): {{3}} paid orders, {{4}} revenue, {{5}} vs the day before. To act on: {{6}}. Full report is in your email.';
const fillTemplate = (p: string[]) => TEMPLATE_TEXT.replace(/\{\{(\d)\}\}/g, (_, i) => p[Number(i) - 1] ?? '');

const errorText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  try { const m = JSON.parse(raw)?.message; return Array.isArray(m) ? m.join(' ') : m || raw; } catch { return raw; }
};

const STATUS_CLASS: Record<string, string> = { SENT: 'portal-chip is-success', FAILED: 'portal-chip is-danger', SKIPPED: 'portal-chip is-muted', PENDING: 'portal-chip', ALREADY_SENT: 'portal-chip is-muted' };

/** One list of recipients: shown as chips with a remove button, plus a box to add another. */
function RecipientList({ label, hint, values, onChange, placeholder, type, disabled }: {
  label: string; hint: string; values: string[]; onChange: (next: string[]) => void; placeholder: string; type: 'email' | 'tel'; disabled: boolean;
}) {
  const [draft, setDraft] = useState('');
  function add(e: FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value || values.includes(value)) { setDraft(''); return; }
    onChange([...values, value]);
    setDraft('');
  }
  return (
    <div style={{ marginTop: 16 }}>
      <strong>{label}</strong>
      <p className="portal-muted" style={{ margin: '2px 0 8px' }}>{hint}</p>
      {values.length === 0 ? <p className="portal-muted" style={{ margin: '0 0 8px' }}>Nobody. This channel will not send.</p> : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {values.map((v) => (
            <span key={v} className="portal-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {v}
              <button type="button" aria-label={`Remove ${v}`} disabled={disabled} onClick={() => onChange(values.filter((x) => x !== v))}
                style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={add} className="portal-inline-form" style={{ maxWidth: 420 }}>
        <input type={type} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} disabled={disabled} aria-label={`Add to ${label}`} />
        <button type="submit" className="portal-inline-btn" disabled={disabled || !draft.trim()}>Add</button>
      </form>
    </div>
  );
}

export function DailyReportView() {
  const [initialized, setInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<{ enabled: boolean; emailRecipients: string[]; whatsappRecipients: string[] } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [busy, setBusy] = useState<'save' | 'preview' | 'send' | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();
  const dialog = usePortalDialog();

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    setToken(saved);
    setInitialized(true);
    if (saved) void loadProfile(saved).then(setProfile).catch(() => setProfile(null));
  }, []);

  const load = useCallback(async (authToken: string) => {
    try {
      const [s, r] = await Promise.all([
        apiRequest<Settings>('/daily-report/settings', { method: 'GET' }, authToken),
        apiRequest<Run[]>('/daily-report/runs', { method: 'GET' }, authToken).catch(() => []),
      ]);
      setSettings(s);
      setDraft({ enabled: s.enabled, emailRecipients: s.emailRecipients, whatsappRecipients: s.whatsappRecipients });
      setRuns(r);
    } catch (error) {
      setErrorMessage(error);
    }
  }, [setErrorMessage]);

  useEffect(() => { if (token) void load(token); }, [token, load]);

  function onLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/portal';
  }

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

  const canRead = hasPermission(profile, 'daily-report-setting.read');
  const canEdit = hasPermission(profile, 'daily-report-setting.update');
  const changed = Boolean(settings && draft) && (
    draft!.enabled !== settings!.enabled
    || JSON.stringify(draft!.emailRecipients) !== JSON.stringify(settings!.emailRecipients)
    || JSON.stringify(draft!.whatsappRecipients) !== JSON.stringify(settings!.whatsappRecipients)
  );

  async function onSave() {
    if (!draft) return;
    setBusy('save');
    try {
      const saved = await apiRequest<Settings>('/daily-report/settings', { method: 'PUT', body: JSON.stringify(draft) }, token!);
      setSettings(saved);
      setDraft({ enabled: saved.enabled, emailRecipients: saved.emailRecipients, whatsappRecipients: saved.whatsappRecipients });
      setFeedback('Saved. The next report uses these recipients.');
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function onPreview() {
    setBusy('preview');
    try {
      setPreview(await apiRequest<Preview>('/daily-report/preview', { method: 'GET' }, token!));
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function onSend(force: boolean) {
    if (!settings) return;
    const who = [...settings.whatsappRecipients, ...settings.emailRecipients];
    const ok = await dialog.confirm({
      title: force ? 'Send the report again?' : 'Send yesterday’s report now?',
      message: who.length
        ? `It goes to ${who.join(', ')}.${force ? ' Anyone who already received it will get it a second time.' : ' Anyone who already received it is skipped.'}`
        : 'There are no recipients saved, so nothing would be sent.',
      confirmLabel: 'Send',
    });
    if (!ok) return;
    setBusy('send');
    try {
      const result = await apiRequest<Delivery>(`/daily-report/send${force ? '?force=true' : ''}`, { method: 'POST' }, token!);
      setDelivery(result);
      await load(token!);
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  const allSent = delivery ? [...delivery.whatsapp, ...delivery.email] : [];
  const anyAlready = allSent.some((r) => r.status === 'ALREADY_SENT');

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="dailyReport"
            pageTitle="Daily Report"
            pageSubtitle="Who gets the morning report, what it says, and what has been sent."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}
            {!canRead ? (
              <article className="portal-card"><p className="portal-muted" style={{ margin: 0 }}>Your role cannot see the daily report settings.</p></article>
            ) : !settings || !draft ? (
              <article className="portal-card portal-loading">Loading...</article>
            ) : (
              <>
                <article className="portal-card" style={{ marginBottom: 20 }}>
                  <div className="portal-card-header-row">
                    <h2 style={{ margin: 0 }}>Who gets it</h2>
                    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={draft.enabled} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                      Send the report every morning
                    </label>
                  </div>
                  <p className="portal-muted" style={{ marginBottom: 0 }}>
                    Sent each morning at 07:00 (Nairobi time) with the previous day&apos;s sales, comparison and the things that need doing.
                    {!settings.isCustomised ? ' Nothing has been saved here yet, so the built-in defaults are in use: the owner’s email and WhatsApp number. Saving replaces them.' : ''}
                  </p>
                  {!settings.whatsappConfigured ? (
                    <p className="portal-error" style={{ marginTop: 12 }}>WhatsApp is not connected on this server, so WhatsApp recipients are skipped. Email still goes.</p>
                  ) : null}

                  <RecipientList label="WhatsApp" hint={`Numbers in any usual format, for example 0712 345 678. Sent with the approved template “${settings.whatsappTemplate}”.`}
                    values={draft.whatsappRecipients} onChange={(next) => setDraft({ ...draft, whatsappRecipients: next })} placeholder="0712 345 678" type="tel" disabled={!canEdit} />
                  <RecipientList label="Email" hint="The full report, with the orders to act on and stock warnings."
                    values={draft.emailRecipients} onChange={(next) => setDraft({ ...draft, emailRecipients: next })} placeholder="name@example.com" type="email" disabled={!canEdit} />

                  {canEdit ? (
                    <div className="portal-action-row" style={{ marginTop: 20 }}>
                      <button type="button" className="portal-primary-btn" disabled={!changed || busy === 'save'} onClick={() => void onSave()}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
                      {changed ? <button type="button" className="portal-inline-btn" onClick={() => setDraft({ enabled: settings.enabled, emailRecipients: settings.emailRecipients, whatsappRecipients: settings.whatsappRecipients })}>Undo changes</button> : null}
                    </div>
                  ) : <p className="portal-muted">Your role can see these settings but not change them.</p>}
                </article>

                <article className="portal-card" style={{ marginBottom: 20 }}>
                  <h2 style={{ marginTop: 0 }}>See it, or send it now</h2>
                  <div className="portal-action-row">
                    <button type="button" className="portal-inline-btn" disabled={busy === 'preview'} onClick={() => void onPreview()}>{busy === 'preview' ? 'Building…' : 'Preview yesterday’s report'}</button>
                    {canEdit ? <button type="button" className="portal-primary-btn" disabled={busy === 'send' || changed} onClick={() => void onSend(false)}>{busy === 'send' ? 'Sending…' : 'Send now'}</button> : null}
                  </div>
                  {changed && canEdit ? <p className="portal-muted" style={{ marginBottom: 0 }}>Save your changes first, so the report goes to the list shown above.</p> : null}
                  {preview ? (
                    <div style={{ marginTop: 16 }}>
                      <p className="portal-muted" style={{ margin: 0 }}>{preview.report.label}. Nothing was sent.</p>
                      <strong>WhatsApp</strong>
                      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '4px 0 12px', padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.04)', fontSize: 14 }}>{fillTemplate(preview.whatsappParameters)}</pre>
                      <strong>Email subject</strong>
                      <p style={{ margin: '4px 0 0' }}>{preview.email.subject}</p>
                    </div>
                  ) : null}
                  {delivery ? (
                    <div style={{ marginTop: 16 }}>
                      <strong>{delivery.skipped ? `Not sent: ${delivery.skipped}` : `Report for ${delivery.dateKey}`}</strong>
                      <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                        {allSent.map((r) => (
                          <li key={`${r.recipient}-${r.status}`}>
                            {r.recipient} <span className={STATUS_CLASS[r.status] ?? 'portal-chip'}>{r.status === 'ALREADY_SENT' ? 'Already sent' : r.status.charAt(0) + r.status.slice(1).toLowerCase()}</span>
                            {r.error ? <span className="portal-muted"> {r.error}</span> : null}
                          </li>
                        ))}
                      </ul>
                      {anyAlready && canEdit ? <button type="button" className="portal-inline-btn" style={{ marginTop: 10 }} disabled={busy === 'send'} onClick={() => void onSend(true)}>Send again anyway</button> : null}
                    </div>
                  ) : null}
                </article>

                <article className="portal-card">
                  <h2 style={{ marginTop: 0 }}>What has been sent</h2>
                  {runs.length === 0 ? <p className="portal-muted">Nothing yet.</p> : (
                    <div className="portal-table-wrap">
                      <table className="portal-data-table">
                        <thead><tr><th>Report for</th><th>Channel</th><th>To</th><th>Result</th><th>When</th></tr></thead>
                        <tbody>
                          {runs.map((r) => (
                            <tr key={r.id}>
                              <td>{r.reportDate}</td>
                              <td>{r.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}</td>
                              <td>{r.recipient}</td>
                              <td><span className={STATUS_CLASS[r.status] ?? 'portal-chip'}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</span>{r.error ? <span className="portal-muted"> {r.error}</span> : null}</td>
                              <td>{formatDateTime(r.updatedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              </>
            )}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
