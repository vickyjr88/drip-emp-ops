"use client";

/**
 * Notifications: who the shop's people are told, by email and by WhatsApp, when something happens that is worth a quick follow-up
 * (a cart left behind, a shopper choosing WhatsApp, a customer's message, a question, an order, a review, a size running low).
 *
 * The server raises the alerts (backend/src/alerts). This screen edits who receives them and which kinds go to which channel, sends a test,
 * and shows every alert with what became of it. WhatsApp needs an approved template for anyone who has not written to the shop in the last
 * 24 hours; for someone who has, the whole message goes as plain text.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { CollapseCard } from '../components/collapse-card';
import { useErrorState, useFeedbackState } from '../components/notifications';
import { RecipientList } from '../daily-report/daily-report-view';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type KindRow = { kind: string; group: string; label: string; when: string; actNow: boolean; email: boolean; whatsapp: boolean };
type Settings = {
  enabled: boolean; emailRecipients: string[]; whatsappRecipients: string[]; whatsappTemplate: string; dailyWhatsAppCap: number;
  isCustomised: boolean; whatsappConfigured: boolean; kindList: KindRow[]; sentToday: number;
};
type Entry = { to: string; status: 'SENT' | 'FAILED' | 'SKIPPED'; how?: 'TEXT' | 'TEMPLATE'; error?: string };
type Delivery = { email: Entry[]; whatsapp: Entry[]; skipped?: string };
type Alert = { id: string; kind: string; subject: string; summary: string; link: string | null; followUpUrl: string | null; results: Delivery; createdAt: string };
type Draft = { enabled: boolean; emailRecipients: string[]; whatsappRecipients: string[]; whatsappTemplate: string; dailyWhatsAppCap: number; kinds: Record<string, { email: boolean; whatsapp: boolean }> };

const TEMPLATE_BODY = 'Drip Emporium alert: {{1}}\n\n{{2}}\n\n{{3}}';
const STATUS_CLASS: Record<string, string> = { SENT: 'portal-chip is-success', FAILED: 'portal-chip is-danger', SKIPPED: 'portal-chip is-muted' };

const draftOf = (s: Settings): Draft => ({
  enabled: s.enabled, emailRecipients: s.emailRecipients, whatsappRecipients: s.whatsappRecipients, whatsappTemplate: s.whatsappTemplate,
  dailyWhatsAppCap: s.dailyWhatsAppCap, kinds: Object.fromEntries(s.kindList.map((k) => [k.kind, { email: k.email, whatsapp: k.whatsapp }])),
});

const errorText = (e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  try { const m = JSON.parse(raw)?.message; return Array.isArray(m) ? m.join(' ') : m || raw; } catch { return raw; }
};

/** One line saying what happened to an alert on each channel. */
function Outcome({ results }: { results: Delivery }) {
  if (results.skipped) return <span className="portal-chip is-muted">{results.skipped}</span>;
  const part = (label: string, entries: Entry[]) => {
    if (!entries.length) return null;
    const failed = entries.filter((e) => e.status === 'FAILED');
    const skipped = entries.filter((e) => e.status === 'SKIPPED');
    const sent = entries.filter((e) => e.status === 'SENT');
    const status = failed.length ? 'FAILED' : sent.length ? 'SENT' : 'SKIPPED';
    const note = (failed[0] ?? skipped[0])?.error;
    return (
      <span key={label} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={STATUS_CLASS[status]}>{label}: {status === 'SENT' ? (sent.some((e) => e.how === 'TEXT') ? 'sent (text)' : 'sent') : status === 'FAILED' ? 'failed' : 'not sent'}</span>
        {note ? <span className="portal-muted" style={{ fontSize: 12 }}>{note}</span> : null}
      </span>
    );
  };
  return <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{part('Email', results.email)}{part('WhatsApp', results.whatsapp)}</span>;
}

export function NotificationsView() {
  const [initialized, setInitialized] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [testResult, setTestResult] = useState<Delivery | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    setToken(saved);
    setInitialized(true);
    if (saved) void loadProfile(saved).then(setProfile).catch(() => setProfile(null));
  }, []);

  const load = useCallback(async (authToken: string) => {
    try {
      const [s, a] = await Promise.all([
        apiRequest<Settings>('/alerts/settings', { method: 'GET' }, authToken),
        apiRequest<Alert[]>('/alerts?limit=60', { method: 'GET' }, authToken).catch(() => [] as Alert[]),
      ]);
      setSettings(s);
      setDraft(draftOf(s));
      setAlerts(a);
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
      <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
        <article className="portal-card portal-loading">Loading...</article>
      </section></main></EliteLayout>
    );
  }
  if (!token || !profile) {
    return (
      <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
        <article className="portal-card">
          <h2>Authentication required</h2>
          <Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>Go to Portal Login</Link>
        </article>
      </section></main></EliteLayout>
    );
  }

  const canRead = hasPermission(profile, 'alert-setting.read');
  const canEdit = hasPermission(profile, 'alert-setting.update');
  const changed = Boolean(settings && draft) && JSON.stringify(draft) !== JSON.stringify(draftOf(settings!));

  async function onSave() {
    if (!draft) return;
    setBusy('save');
    try {
      const saved = await apiRequest<Settings>('/alerts/settings', { method: 'PUT', body: JSON.stringify(draft) }, token!);
      setSettings(saved);
      setDraft(draftOf(saved));
      setFeedback('Saved. New alerts follow these settings.');
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    setBusy('test');
    setTestResult(null);
    try {
      setTestResult(await apiRequest<Delivery>('/alerts/test', { method: 'POST' }, token!));
      await load(token!);
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  const setKind = (kind: string, channel: 'email' | 'whatsapp', on: boolean) =>
    draft && setDraft({ ...draft, kinds: { ...draft.kinds, [kind]: { ...draft.kinds[kind], [channel]: on } } });
  const groups = settings ? Array.from(new Set(settings.kindList.map((k) => k.group))) : [];

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="notifications"
            pageTitle="Notifications"
            pageSubtitle="Who is told, by email and WhatsApp, when something needs a quick follow-up."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={onLogout}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}
            {feedback ? <article className="portal-card portal-success">{feedback}</article> : null}
            {!canRead ? (
              <article className="portal-card"><p className="portal-muted" style={{ margin: 0 }}>Your role cannot see notification settings.</p></article>
            ) : !settings || !draft ? (
              <article className="portal-card portal-loading">Loading...</article>
            ) : (
              <>
                <article className="portal-card" style={{ marginBottom: 20 }}>
                  <div className="portal-card-header-row">
                    <h2 style={{ margin: 0 }}>Who is told</h2>
                    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={draft.enabled} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                      Send alerts
                    </label>
                  </div>
                  <p className="portal-muted" style={{ marginBottom: 0 }}>
                    Each alert says what happened and, where there is a customer to answer, carries a button that opens their WhatsApp chat with a reply ready. You read it and press send.
                    {!settings.isCustomised ? ' Nothing has been saved here yet, so the owner’s email and WhatsApp number are in use. Saving replaces them.' : ''}
                  </p>
                  {!settings.whatsappConfigured ? (
                    <p className="portal-error" style={{ marginTop: 12 }}>WhatsApp is not connected on this server, so WhatsApp alerts are skipped. Email still goes.</p>
                  ) : null}

                  <RecipientList label="WhatsApp" hint="Numbers in any usual format, for example 0712 345 678. Add the people who follow up with customers."
                    values={draft.whatsappRecipients} onChange={(next) => setDraft({ ...draft, whatsappRecipients: next })} placeholder="0712 345 678" type="tel" disabled={!canEdit} />
                  <RecipientList label="Email" hint="The same alerts by email, with the same buttons."
                    values={draft.emailRecipients} onChange={(next) => setDraft({ ...draft, emailRecipients: next })} placeholder="name@example.com" type="email" disabled={!canEdit} />

                  <div className="portal-entity-form" style={{ marginTop: 18 }}>
                    <div className="portal-entity-grid-2 is-pairs">
                      <label>
                        <span>WhatsApp template</span>
                        <input value={draft.whatsappTemplate} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, whatsappTemplate: e.target.value.toLowerCase() })} />
                      </label>
                      <label>
                        <span>WhatsApp alerts a day, at most</span>
                        <input type="number" min={1} max={1000} value={draft.dailyWhatsAppCap} disabled={!canEdit}
                          onChange={(e) => setDraft({ ...draft, dailyWhatsAppCap: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })} />
                      </label>
                    </div>
                    <p className="portal-muted" style={{ margin: 0 }}>{settings.sentToday} of {settings.dailyWhatsAppCap} sent today. Email is not limited.</p>
                  </div>

                  {canEdit ? (
                    <div className="portal-action-row" style={{ marginTop: 20 }}>
                      <button type="button" className="portal-primary-btn" disabled={!changed || busy === 'save'} onClick={() => void onSave()}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
                      {changed ? <button type="button" className="portal-inline-btn" onClick={() => setDraft(draftOf(settings))}>Undo changes</button> : null}
                    </div>
                  ) : <p className="portal-muted">Your role can see these settings but not change them.</p>}
                </article>

                <CollapseCard title="What you are told about" summary={`${settings.kindList.length} kinds`} defaultOpen style={{ marginBottom: 20 }}>
                  <p className="portal-muted" style={{ marginTop: 0 }}>Tick where each should go. Everything starts on. “Act now” ones are worth a reply while the person is still thinking about it.</p>
                  {groups.map((group) => (
                    <div key={group} style={{ marginTop: 12 }}>
                      <strong>{group}</strong>
                      <div>
                        {settings.kindList.filter((k) => k.group === group).map((k) => (
                          <div key={k.kind} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--eef-border, #e6e8e8)' }}>
                            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                              <strong>{k.label}</strong>{k.actNow ? <span className="portal-chip is-dense" style={{ marginLeft: 8 }}>Act now</span> : null}
                              <div className="portal-muted" style={{ fontSize: 13 }}>{k.when}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 20 }}>
                              <label className="portal-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                                <input type="checkbox" disabled={!canEdit} checked={draft.kinds[k.kind]?.email ?? true} onChange={(e) => setKind(k.kind, 'email', e.target.checked)} /> Email
                              </label>
                              <label className="portal-check" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                                <input type="checkbox" disabled={!canEdit} checked={draft.kinds[k.kind]?.whatsapp ?? true} onChange={(e) => setKind(k.kind, 'whatsapp', e.target.checked)} /> WhatsApp
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {canEdit && changed ? (
                    <div className="portal-action-row" style={{ marginTop: 14 }}>
                      <button type="button" className="portal-primary-btn" disabled={busy === 'save'} onClick={() => void onSave()}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
                    </div>
                  ) : null}
                </CollapseCard>

                <CollapseCard title="WhatsApp setup" summary={settings.whatsappConfigured ? 'connected' : 'not connected'} style={{ marginBottom: 20 }}>
                  <p style={{ marginTop: 0 }}>
                    WhatsApp lets the shop message someone first only with a template that Meta has approved. Alerts to a person who has written to the shop in the last 24 hours go as ordinary text, with no template.
                    For everyone else, create this template once in WhatsApp Manager (Message templates, Create, category <strong>Utility</strong>, language <strong>English</strong>) named <code>{draft.whatsappTemplate || 'admin_alert'}</code>:
                  </p>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '8px 0', padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.04)', fontSize: 14 }}>{TEMPLATE_BODY}</pre>
                  <p className="portal-muted" style={{ marginBottom: 0 }}>
                    Give Meta example values such as: {'{{1}}'} “Contact form: Wanjiku”, {'{{2}}'} “Name: Wanjiku Kamau · Phone: 0712 345 678 · Message: Do you have size 42?”, {'{{3}}'} “Reply: https://wa.me/254712345678”.
                    Until it is approved, WhatsApp alerts show “not approved” in the list below and email is unaffected.
                  </p>
                </CollapseCard>

                {canEdit ? (
                  <article className="portal-card" style={{ marginBottom: 20 }}>
                    <h2 style={{ marginTop: 0 }}>Send a test</h2>
                    <p className="portal-muted">Sends a test alert to everyone listed above, on both channels, whatever the ticks say. {changed ? 'Save your changes first, so it goes to the list shown.' : ''}</p>
                    <button type="button" className="portal-primary-btn" disabled={busy === 'test' || changed} onClick={() => void onTest()}>{busy === 'test' ? 'Sending…' : 'Send a test alert'}</button>
                    {testResult ? (
                      <ul style={{ margin: '14px 0 0', paddingLeft: 18 }}>
                        {[...testResult.whatsapp.map((r) => ({ ...r, channel: 'WhatsApp' })), ...testResult.email.map((r) => ({ ...r, channel: 'Email' }))].map((r) => (
                          <li key={`${r.channel}-${r.to}`}>
                            {r.channel}: {r.to} <span className={STATUS_CLASS[r.status]}>{r.status === 'SENT' ? (r.how === 'TEXT' ? 'Sent as text' : 'Sent') : r.status === 'FAILED' ? 'Failed' : 'Not sent'}</span>
                            {r.error ? <span className="portal-muted"> {r.error}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ) : null}

                <article className="portal-card">
                  <h2 style={{ marginTop: 0 }}>Recent alerts</h2>
                  {alerts.length === 0 ? <p className="portal-muted">Nothing yet. Alerts appear here as things happen.</p> : (
                    <div className="portal-list-stack">
                      {alerts.map((a) => (
                        <div key={a.id} className="portal-record">
                          <div className="portal-list-row">
                            <div>
                              <strong>{a.subject}</strong>
                              <p className="portal-muted" style={{ margin: '2px 0 4px' }}>{formatDateTime(a.createdAt)}</p>
                              <p style={{ margin: '0 0 6px' }}>{a.summary}</p>
                              <Outcome results={a.results} />
                            </div>
                            <div className="portal-action-row">
                              {a.followUpUrl ? <a href={a.followUpUrl} target="_blank" rel="noopener noreferrer" className="portal-inline-btn">Reply on WhatsApp</a> : null}
                              {a.link ? <Link href={a.link} className="portal-inline-btn">Open</Link> : null}
                            </div>
                          </div>
                        </div>
                      ))}
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
