"use client";

/**
 * WhatsApp outreach: pick customers, pick one of the three approved messages (download the app, join the WhatsApp
 * group, rate us on Google) and send it through the WhatsApp Business number. Each customer is shown with the messages
 * they have already received, and a message already sent to someone is skipped unless "send again" is ticked.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { PortalShell } from '../components/portal-shell';
import { usePortalDialog } from '../components/portal-dialog';
import { ServerListPager, ServerListSearch, ServerPage, useServerPager } from '../components/server-pager';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDateTime, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Kind = 'APP' | 'GROUP' | 'REVIEW';
type KindStatus = { kind: Kind; label: string; template: string; link: string | null; linkReady: boolean };
type Status = { configured: boolean; kinds: KindStatus[] };
type Recipient = {
  id: string; firstName: string; lastName: string; email: string; phone: string;
  createdAt: string; sent: Partial<Record<Kind, string>>;
};
type SendResult = { customerId: string; name: string; phone: string | null; outcome: 'SENT' | 'FAILED' | 'SKIPPED'; detail?: string };
type Totals = { sent: number; failed: number; skipped: number; problems: SendResult[] };
type HistoryRow = {
  id: string; kind: Kind; template: string; phone: string; status: 'SENT' | 'FAILED'; error?: string | null;
  triggeredBy: string; createdAt: string; customer?: { firstName: string; lastName: string } | null;
};

const SHORT: Record<Kind, string> = { APP: 'App', GROUP: 'Group', REVIEW: 'Rating' };
const BATCH = 25;

export default function OutreachPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [kind, setKind] = useState<Kind>('APP');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [force, setForce] = useState(false);
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [, setFeedback] = useFeedbackState();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setInitialized(true);
  }, []);

  const loadHistory = useCallback(async (authToken: string) => {
    const page = await apiRequest<ServerPage<HistoryRow>>('/whatsapp-outreach/history?take=15', { method: 'GET' }, authToken);
    setHistory(page.items);
  }, []);

  const load = useCallback(async (authToken: string) => {
    setLoading(true);
    try {
      const [me, st] = await Promise.all([
        loadProfile(authToken),
        apiRequest<Status>('/whatsapp-outreach/status', { method: 'GET' }, authToken),
      ]);
      setProfile(me);
      setStatus(st);
      await loadHistory(authToken);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
  }, [loadHistory, setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void load(token);
  }, [initialized, token, load]);

  const fetchPage = useCallback(
    async (params: { skip: number; take: number; search: string }): Promise<ServerPage<Recipient>> => {
      if (!token) return { items: [], total: 0, skip: params.skip, take: params.take };
      const query = new URLSearchParams({ skip: String(params.skip), take: String(params.take) });
      if (params.search) query.set('search', params.search);
      return apiRequest<ServerPage<Recipient>>(`/whatsapp-outreach/recipients?${query}`, { method: 'GET' }, token);
    },
    [token],
  );
  const pager = useServerPager<Recipient, Record<string, never>>({ fetchPage: (params) => fetchPage(params), filters: {}, enabled: Boolean(token) });

  const current = status?.kinds.find((k) => k.kind === kind);
  const canSend = hasPermission(profile, 'customer.update');
  const names = useMemo(() => new Map(pager.items.map((r) => [r.id, `${r.firstName} ${r.lastName}`.trim()])), [pager.items]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectPage = () => setSelected((prev) => new Set(Array.from(prev).concat(pager.items.filter((r) => !r.sent[kind] || force).map((r) => r.id))));

  const selectUnsent = async () => {
    if (!token) return;
    try {
      const query = new URLSearchParams({ kind });
      if (pager.search) query.set('search', pager.search);
      const out = await apiRequest<{ ids: string[]; capped: boolean }>(`/whatsapp-outreach/unsent?${query}`, { method: 'GET' }, token);
      setSelected(new Set(out.ids));
      setFeedback(`${out.ids.length} customers have not received "${current?.label}" yet${out.capped ? ' (first 1000 shown)' : ''}.`);
    } catch (error) {
      setErrorMessage(error);
    }
  };

  const send = async () => {
    if (!token || !current || selected.size === 0) return;
    const ok = await dialog.confirm({
      title: `Send "${current.label}" to ${selected.size} customer${selected.size === 1 ? '' : 's'}?`,
      message: (
        <>
          This sends a real WhatsApp message from the Drip Emporium number using the <strong>{current.template}</strong> template.
          {force ? ' Customers who already received it will get it again.' : ' Customers who already received it are skipped.'}
        </>
      ),
      confirmLabel: 'Send now',
    });
    if (!ok) return;

    const ids = Array.from(selected);
    const run: Totals = { sent: 0, failed: 0, skipped: 0, problems: [] };
    setTotals(null);
    setSending({ done: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const out = await apiRequest<{ sent: number; failed: number; skipped: number; results: SendResult[] }>(
          '/whatsapp-outreach/send',
          { method: 'POST', body: JSON.stringify({ kind, customerIds: batch, force }) },
          token,
        );
        run.sent += out.sent; run.failed += out.failed; run.skipped += out.skipped;
        run.problems.push(...out.results.filter((r) => r.outcome !== 'SENT'));
        setSending({ done: Math.min(i + BATCH, ids.length), total: ids.length });
      }
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setSending(null);
      setTotals(run);
      setSelected(new Set());
      void loadHistory(token);
      pager.reload();
    }
  };

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main">
          <section className="lp-container" style={{ paddingTop: 72 }}>
            <article className="portal-card portal-loading">Loading WhatsApp outreach...</article>
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
            active="outreach"
            pageSubtitle="Send customers a WhatsApp message to download the app, join the group or rate us on Google."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}

            {status && !status.configured ? (
              <article className="portal-card portal-error">
                WhatsApp is not connected on this server, so nothing can be sent. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.
              </article>
            ) : null}

            <article className="portal-card">
              <h2 style={{ margin: 0 }}>1. Choose the message</h2>
              <div className="portal-list-stack" style={{ marginTop: 12 }}>
                {status?.kinds.map((k) => (
                  <label key={k.kind} className="portal-record" style={{ cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <input type="radio" name="kind" checked={kind === k.kind} onChange={() => { setKind(k.kind); setSelected(new Set()); }} />
                    <div>
                      <strong>{k.label}</strong>
                      <p className="portal-muted" style={{ margin: '2px 0 0' }}>
                        Template <code>{k.template}</code> ·{' '}
                        {k.linkReady ? <>sends <a href={k.link ?? '#'} target="_blank" rel="noreferrer">{k.link}</a></> : (
                          <span style={{ color: 'var(--danger, #b42318)' }}>
                            no link yet — add it under <Link href="/portal/content">Site content</Link> &gt; Footer
                          </span>
                        )}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </article>

            <article className="portal-card">
              <div className="portal-card-header-row">
                <div>
                  <h2 style={{ margin: 0 }}>2. Choose the customers</h2>
                  <p className="portal-muted" style={{ margin: '4px 0 0' }}>
                    {selected.size} selected. Each name shows which messages that customer has already received.
                  </p>
                </div>
                <div className="portal-action-row">
                  <button type="button" className="portal-ghost-btn" onClick={selectPage}>Select this page</button>
                  <button type="button" className="portal-ghost-btn" onClick={() => void selectUnsent()}>Select everyone who has not received it</button>
                  <button type="button" className="portal-ghost-btn" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>Clear</button>
                </div>
              </div>

              <div className="list-toolbar">
                <ServerListSearch pager={pager} placeholder="Search name, phone or email…" />
                <label className="portal-check" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
                  <span>Send again to customers who already have it</span>
                </label>
              </div>

              <div className="portal-list-stack">
                {!pager.loading && pager.items.length === 0 ? (
                  <div className="portal-empty-state">{pager.search ? 'No customers match.' : 'No customers with a phone number.'}</div>
                ) : (
                  pager.items.map((r) => {
                    const had = Boolean(r.sent[kind]);
                    return (
                      <label key={r.id} className="portal-record" style={{ cursor: 'pointer', opacity: had && !force ? 0.6 : 1 }}>
                        <div className="portal-list-row" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                          <div>
                            <strong>{`${r.firstName} ${r.lastName}`.trim() || r.email}</strong>
                            {(Object.keys(SHORT) as Kind[]).filter((k) => r.sent[k]).map((k) => (
                              <span key={k} className="portal-chip is-success" style={{ marginLeft: 8 }} title={`Sent ${formatDateTime(r.sent[k])}`}>
                                {SHORT[k]} sent
                              </span>
                            ))}
                            <p className="portal-muted">{r.phone} · {r.email}</p>
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              <ServerListPager pager={pager} noun="customers" />
            </article>

            <article className="portal-card">
              <h2 style={{ margin: 0 }}>3. Send</h2>
              <div className="portal-action-row" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="portal-primary-btn"
                  onClick={() => void send()}
                  disabled={!canSend || !status?.configured || !current?.linkReady || selected.size === 0 || sending !== null}
                >
                  {sending ? `Sending ${sending.done} of ${sending.total}…` : `Send "${current?.label ?? ''}" to ${selected.size} customer${selected.size === 1 ? '' : 's'}`}
                </button>
              </div>
              {!canSend ? <p className="portal-muted">You need permission to edit customers to send messages.</p> : null}
              {totals ? (
                <div style={{ marginTop: 12 }}>
                  <p>
                    <strong>{totals.sent} sent</strong>
                    {totals.failed ? `, ${totals.failed} failed` : ''}
                    {totals.skipped ? `, ${totals.skipped} skipped` : ''}.
                  </p>
                  {totals.problems.length ? (
                    <ul className="portal-muted">
                      {totals.problems.slice(0, 30).map((p) => (
                        <li key={p.customerId}>{(names.get(p.customerId) || p.name)} ({p.phone ?? 'no number'}): {p.outcome.toLowerCase()}{p.detail ? ` — ${p.detail}` : ''}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <p className="portal-muted" style={{ marginTop: 12 }}>
                "Sent" means WhatsApp accepted the message. A failure usually means the template is not approved yet or the number is not on WhatsApp.
              </p>
            </article>

            <article className="portal-card">
              <h2 style={{ margin: 0 }}>Recent messages</h2>
              <div className="portal-list-stack" style={{ marginTop: 12 }}>
                {history.length === 0 ? (
                  <div className="portal-empty-state">Nothing sent yet.</div>
                ) : history.map((h) => (
                  <div key={h.id} className="portal-record">
                    <div className="portal-list-row">
                      <div>
                        <strong>{h.customer ? `${h.customer.firstName} ${h.customer.lastName}`.trim() : h.phone}</strong>
                        <span className={`portal-chip ${h.status === 'SENT' ? 'is-success' : 'is-danger'}`} style={{ marginLeft: 8 }}>{h.status === 'SENT' ? 'Sent' : 'Failed'}</span>
                        <span className="portal-chip is-muted" style={{ marginLeft: 8 }}>{SHORT[h.kind] ?? h.kind}</span>
                        <p className="portal-muted">{h.phone} · {formatDateTime(h.createdAt)} · by {h.triggeredBy}{h.error ? ` · ${h.error}` : ''}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
