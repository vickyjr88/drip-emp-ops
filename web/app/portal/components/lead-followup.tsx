"use client";

/**
 * The automatic follow-up on leads and abandoned carts, as staff see it: a chip on each lead saying where it stands, a panel on the list
 * saying whether it is running and what is waiting, and a card on a lead's own page with what was sent and the buttons to mark it by hand.
 * The rules live on the server (backend/src/cart-lead/lead-followup.ts); this only shows them.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest, formatDateTime } from '../accounting/lib';

export type FollowUpState = 'PENDING' | 'DONE' | 'FAILED' | 'SKIPPED';
export type LeadFollowUpFields = {
  followUpState?: FollowUpState;
  followUpReason?: string | null;
  followUpNote?: string | null;
  followUpAt?: string | null;
  followUpBy?: string | null;
  followUpWhatsapp?: 'SENT' | 'FAILED' | 'CONVERSATION' | null;
  followUpWhatsappAt?: string | null;
  followUpEmail?: 'SENT' | 'FAILED' | null;
  followUpEmailAt?: string | null;
  followUpNextAt?: string | null;
  lastActivityAt: string;
};

const REASON_LABEL: Record<string, string> = {
  SENT: 'Followed up', CONVERSATION: 'Already chatting on WhatsApp', STAFF: 'Followed up by staff', DUPLICATE: 'Followed up on another lead',
  CLOSED: 'Closed', TOO_OLD: 'Too old', NO_CONTACT: 'No contact details', STOPPED: 'Asked us to stop',
  WHATSAPP_FAILED: 'WhatsApp failed', GAVE_UP: 'Not delivered', NOT_REACHABLE: 'Could not reach', RETRY: 'Will retry',
};

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });

export function followUpLabel(lead: LeadFollowUpFields): { text: string; tone: 'active' | 'success' | 'danger' | 'muted'; title: string } {
  const state = lead.followUpState ?? 'PENDING';
  if (state === 'PENDING') {
    const due = new Date(new Date(lead.lastActivityAt).getTime() + 3_600_000);
    const waiting = lead.followUpNextAt && new Date(lead.followUpNextAt) > new Date() ? new Date(lead.followUpNextAt) : due;
    const future = waiting > new Date();
    return {
      text: future ? `Follow-up at ${hhmm(waiting.toISOString())}` : 'Follow-up queued',
      tone: 'active',
      title: lead.followUpNote || (future ? 'Goes out an hour after the last activity, between 08:00 and 20:00.' : 'Due now; goes out at the next run inside 08:00 to 20:00.'),
    };
  }
  const channels = [lead.followUpWhatsapp === 'SENT' ? 'WhatsApp' : '', lead.followUpEmail === 'SENT' ? 'email' : ''].filter(Boolean).join(' + ');
  const base = REASON_LABEL[lead.followUpReason ?? ''] ?? (state === 'DONE' ? 'Followed up' : state === 'FAILED' ? 'Failed' : 'Skipped');
  const text = state === 'DONE' && lead.followUpReason === 'SENT' && channels ? `Followed up: ${channels}` : base;
  const tone = state === 'DONE' ? 'success' : state === 'FAILED' ? 'danger' : 'muted';
  const when = lead.followUpAt ? ` (${formatDateTime(lead.followUpAt)})` : '';
  return { text, tone, title: `${lead.followUpNote ?? base}${when}` };
}

export function FollowUpChip({ lead }: { lead: LeadFollowUpFields }) {
  const { text, tone, title } = followUpLabel(lead);
  return <span className={`portal-chip is-dense${tone === 'active' ? ' is-active' : tone === 'success' ? ' is-success' : tone === 'danger' ? ' is-danger' : ' is-muted'}`} title={title}>{text}</span>;
}

/** Staff marking a lead followed up by hand (a call, a visit, a chat from their own phone), or putting it back in the queue. */
export async function setFollowUp(token: string, leadId: string, state: 'DONE' | 'PENDING', note?: string): Promise<boolean> {
  try {
    await apiRequest(`/cart-leads/${leadId}/follow-up`, { method: 'PATCH', body: JSON.stringify({ state, note }) }, token);
    return true;
  } catch {
    return false;
  }
}

type Summary = {
  enabled: boolean;
  window: { open: boolean; opensAt: string; from: string; to: string };
  delayMinutes: number;
  backlogDays: number;
  paused: { until: string; reason: string | null } | null;
  problem: string | null;
  channels: { whatsapp: boolean; email: boolean };
  counts: { waiting: number; dueNow: number; done: number; failed: number; skipped: number };
  reasons: Array<{ reason: string | null; count: number }>;
  today: { whatsapp: number; emails: number; cap: number; remaining: number };
  estimate: { leads: number; perDay: number; days: number } | null;
  lastRun: { at: string; sent: number; emailed: number; closed: number } | null;
};
type PreviewRow = {
  id: string; name: string | null; source: string; phone: string | null; email: string | null; dueAt: string;
  plan: { action: 'SEND'; whatsapp: boolean; email: boolean } | { action: 'MARK'; state: string; reason: string; note: string } | { action: 'WAIT'; until: string | null };
};

function describePlan(plan: PreviewRow['plan']) {
  if (plan.action === 'SEND') return `Will send ${[plan.whatsapp ? 'WhatsApp' : '', plan.email ? 'email' : ''].filter(Boolean).join(' and ')}`;
  if (plan.action === 'MARK') return `Will be marked: ${plan.note}`;
  return plan.until ? `Not due until ${formatDateTime(plan.until)}` : 'Waiting';
}

export function LeadFollowUpPanel({ token, refreshKey }: { token: string; refreshKey?: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [preview, setPreview] = useState<{ sendingNow: boolean; leads: PreviewRow[] } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummary(await apiRequest<Summary>('/cart-leads/follow-up/summary', { method: 'GET' }, token));
      setFailed(false);
    } catch { setFailed(true); }
  }, [token]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  async function togglePreview() {
    const next = !showPreview;
    setShowPreview(next);
    if (next) {
      try { setPreview(await apiRequest('/cart-leads/follow-up/preview?limit=25', { method: 'GET' }, token)); } catch { setPreview({ sendingNow: false, leads: [] }); }
    }
  }

  if (failed) return null;
  if (!summary) return <article className="portal-card portal-muted">Loading follow-up status...</article>;

  const running = summary.enabled && !summary.paused && !summary.problem;
  const status = !summary.enabled ? 'Switched off' : summary.paused || summary.problem ? 'Paused' : summary.window.open ? 'Running' : `Resumes ${formatDateTime(summary.window.opensAt)}`;

  return (
    <article className="portal-card" style={{ marginBottom: 16 }}>
      <div className="portal-card-header-row">
        <div>
          <h2 style={{ margin: 0 }}>Automatic follow-up <span className={`portal-chip is-dense ${running ? 'is-success' : summary.enabled ? 'is-danger' : 'is-muted'}`} style={{ marginLeft: 8, verticalAlign: 'middle' }}>{status}</span></h2>
          <p className="portal-muted" style={{ margin: '4px 0 0' }}>
            About {summary.delayMinutes} minutes after a shopper goes quiet, by email and WhatsApp, between {summary.window.from} and {summary.window.to}, unless they have already opened a WhatsApp conversation. Reaches back {summary.backlogDays} days.
          </p>
        </div>
      </div>

      {summary.problem || summary.paused ? (
        <div className="portal-error" style={{ marginTop: 12, padding: 12, borderRadius: 8 }}>
          <strong>Follow-ups are paused.</strong> {summary.paused?.reason ?? summary.problem}
          {summary.paused ? <> It tries again {formatDateTime(summary.paused.until)}.</> : null}
          <div style={{ fontSize: 13, marginTop: 4 }}>No customer has been marked as unreachable because of this. If it is the WhatsApp template, check that <code>drip_cart_followup</code> and <code>drip_order_followup</code> are approved in WhatsApp Manager.</div>
        </div>
      ) : null}
      {!summary.channels.whatsapp || !summary.channels.email ? (
        <p className="portal-muted" style={{ marginTop: 10 }}>
          {!summary.channels.whatsapp ? 'WhatsApp is not connected on this server, so only email goes out. ' : ''}
          {!summary.channels.email ? 'No email provider is set up, so only WhatsApp goes out.' : ''}
        </p>
      ) : null}

      <dl className="portal-detail-grid" style={{ marginTop: 14 }}>
        <div><dt>Waiting</dt><dd>{summary.counts.waiting}{summary.counts.dueNow ? ` (${summary.counts.dueNow} due now)` : ''}</dd></div>
        <div><dt>Followed up</dt><dd>{summary.counts.done}</dd></div>
        <div><dt>Failed</dt><dd>{summary.counts.failed}</dd></div>
        <div><dt>Skipped</dt><dd>{summary.counts.skipped}</dd></div>
        <div><dt>Sent today</dt><dd>{summary.today.whatsapp} WhatsApp, {summary.today.emails} email</dd></div>
        <div><dt>WhatsApp left today</dt><dd>{summary.today.remaining} of {summary.today.cap}</dd></div>
      </dl>
      {summary.estimate && summary.estimate.days > 1 ? <p className="portal-muted" style={{ marginTop: 8 }}>{summary.estimate.leads} leads are due; at {summary.estimate.perDay} a day that takes about {summary.estimate.days} days.</p> : null}

      <div className="portal-action-row" style={{ marginTop: 12 }}>
        <button type="button" className="portal-inline-btn" onClick={() => void togglePreview()}>{showPreview ? 'Hide what is next' : 'Show what happens next'}</button>
        <button type="button" className="portal-inline-btn" onClick={() => void load()}>Refresh</button>
      </div>

      {showPreview ? (
        <div style={{ marginTop: 12 }}>
          {!preview ? <p className="portal-muted">Loading...</p> : preview.leads.length === 0 ? <p className="portal-muted">Nothing is waiting.</p> : (
            <>
              <p className="portal-muted" style={{ margin: '0 0 8px' }}>A dry run: nothing is sent from here. {preview.sendingNow ? 'The next run sends these.' : `Sending resumes ${formatDateTime(summary.window.opensAt)}.`}</p>
              <div className="portal-list-stack">
                {preview.leads.map((row) => (
                  <div key={row.id} className="portal-record">
                    <strong>{row.name || row.phone || row.email}</strong>
                    <span className="portal-chip is-dense" style={{ marginLeft: 8 }}>{row.source === 'WHATSAPP_ORDER' ? 'WhatsApp' : 'Abandoned cart'}</span>
                    <p className="portal-muted" style={{ margin: '2px 0 0' }}>{describePlan(row.plan)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

type Messages = {
  emails: Array<{ id: string; recipient: string; subject: string; status: string; errorMessage: string | null; sentAt: string | null; createdAt: string }>;
  whatsapp: Array<{ id: string; kind: string; template: string; status: string; error: string | null; delivery: string | null; deliveryError: string | null; createdAt: string }>;
};

/** A lead's own follow-up: where it stands, each channel's result, every message sent, and the buttons to mark it by hand. */
export function LeadFollowUpCard({ token, leadId, lead, messages, closed, onChanged }: {
  token: string; leadId: string; lead: LeadFollowUpFields; messages?: Messages; closed: boolean; onChanged: () => void;
}) {
  const state = lead.followUpState ?? 'PENDING';
  const [busy, setBusy] = useState(false);
  const act = async (next: 'DONE' | 'PENDING') => {
    setBusy(true);
    await setFollowUp(token, leadId, next);
    setBusy(false);
    onChanged();
  };
  const wa = lead.followUpWhatsapp === 'SENT' ? 'Sent' : lead.followUpWhatsapp === 'FAILED' ? 'Failed: this number could not be reached on WhatsApp' : lead.followUpWhatsapp === 'CONVERSATION' ? 'Not needed: the customer had already messaged us' : 'Not sent';
  const email = lead.followUpEmail === 'SENT' ? 'Sent' : lead.followUpEmail === 'FAILED' ? 'Failed (see the log below)' : 'Not sent';

  return (
    <article className="portal-card" style={{ marginTop: 16 }}>
      <div className="portal-card-header-row">
        <div>
          <h2 style={{ margin: 0 }}>Follow-up</h2>
          <p className="portal-muted" style={{ margin: '4px 0 0' }}>{followUpLabel(lead).title}</p>
        </div>
        <FollowUpChip lead={lead} />
      </div>

      <dl className="portal-detail-grid" style={{ marginTop: 12 }}>
        <div><dt>WhatsApp</dt><dd>{wa}{lead.followUpWhatsappAt ? ` · ${formatDateTime(lead.followUpWhatsappAt)}` : ''}</dd></div>
        <div><dt>Email</dt><dd>{email}{lead.followUpEmailAt ? ` · ${formatDateTime(lead.followUpEmailAt)}` : ''}</dd></div>
        {lead.followUpBy ? <div><dt>Marked by</dt><dd>{lead.followUpBy === 'auto' ? 'Automatically' : lead.followUpBy}</dd></div> : null}
      </dl>

      {messages && (messages.emails.length > 0 || messages.whatsapp.length > 0) ? (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: '0 0 6px' }}>Sent</h3>
          <div className="portal-list-stack">
            {messages.whatsapp.map((m) => (
              <div key={m.id} className="portal-record">
                <strong>WhatsApp</strong>{' '}
                <span className={`portal-chip is-dense ${m.status === 'SENT' && m.delivery !== 'failed' ? 'is-success' : 'is-danger'}`}>{m.status === 'SENT' ? (m.delivery ?? 'accepted') : 'failed'}</span>
                <p className="portal-muted" style={{ margin: '2px 0 0' }}>{formatDateTime(m.createdAt)} · template {m.template}{m.error || m.deliveryError ? ` · ${m.deliveryError ?? m.error}` : ''}</p>
              </div>
            ))}
            {messages.emails.map((m) => (
              <div key={m.id} className="portal-record">
                <strong>Email</strong> <span className={`portal-chip is-dense ${m.status === 'SENT' ? 'is-success' : 'is-danger'}`}>{m.status.toLowerCase()}</span>
                <p className="portal-muted" style={{ margin: '2px 0 0' }}>{formatDateTime(m.sentAt ?? m.createdAt)} · to {m.recipient} · &ldquo;{m.subject}&rdquo;{m.errorMessage ? ` · ${m.errorMessage}` : ''}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!closed ? (
        <div className="portal-action-row" style={{ marginTop: 14 }}>
          {state !== 'DONE' ? <button type="button" className="portal-inline-btn" disabled={busy} onClick={() => void act('DONE')}>Mark follow-up done</button> : null}
          {state !== 'PENDING' ? <button type="button" className="portal-inline-btn" disabled={busy} onClick={() => void act('PENDING')}>Put back in the queue</button> : null}
        </div>
      ) : null}
    </article>
  );
}
