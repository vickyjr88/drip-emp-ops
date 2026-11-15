"use client";

/**
 * Duplicate customers: the same person on more than one record (a phone-only checkout, then a sign-up with an email; a walk-in rung up twice).
 *
 * Each group shows who is linked and which record would be kept. Groups that are plainly one person with nothing to lose are marked safe and
 * can be merged together; the rest say what to check first. Nothing is merged until a person presses a button and confirms what it will do.
 * A merge moves the others' orders, invoices, receipts, carts, documents, favourites and WhatsApp history to the kept record and removes them,
 * keeping a copy of what each was. Reseller and wholesale accounts never appear here.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../../components/elite-layout';
import { PortalShell } from '../../components/portal-shell';
import { useErrorState, useFeedbackState } from '../../components/notifications';
import { TOKEN_KEY, AuthProfile, apiRequest, canReadRbacFor, formatDate, hasPermission, loadProfile, roleLabelFor } from '../../accounting/lib';
import { realEmail } from '../../../lib/contact-email';

type Member = { id: string; firstName: string; lastName: string; email: string; phone: string; hasPassword: boolean; portalEnabled: boolean; createdAt: string; orders: number; lastOrderAt: string | null };
type Group = { reason: string; members: Member[]; keepId: string; safe: boolean; caution: string | null };
type Result = { groups: Group[]; summary: { groups: number; safe: number; needsReview: number; extraRecords: number } };
type Preview = { keep: Member; merging: Member[]; adopt: Record<string, string>; ordersMoved: number };

const nameOf = (m: Member) => `${m.firstName} ${m.lastName}`.trim() || 'No name';

export default function DuplicateCustomersPage() {
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  /** Per group (keyed by the suggested keep id): the record chosen to keep, and the others left out of the merge. */
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [left, setLeft] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();

  useEffect(() => { setToken(window.localStorage.getItem(TOKEN_KEY)); setInitialized(true); }, []);

  const loadGroups = useCallback(async (authToken: string) => {
    try {
      setResult(await apiRequest<Result>('/customer-duplicates', { method: 'GET' }, authToken));
    } catch (error) {
      setErrorMessage(error);
    }
  }, [setErrorMessage]);

  useEffect(() => {
    if (!initialized) return;
    if (!token) { setLoading(false); return; }
    void (async () => {
      try { setProfile(await loadProfile(token)); await loadGroups(token); } catch (error) { setErrorMessage(error); } finally { setLoading(false); }
    })();
  }, [initialized, token, loadGroups, setErrorMessage]);

  const canMerge = hasPermission(profile, 'customer.delete');

  const chosenKeep = (g: Group) => keep[g.keepId] ?? g.keepId;
  const toMerge = (g: Group) => g.members.filter((m) => m.id !== chosenKeep(g) && !(left[g.keepId] ?? []).includes(m.id));

  async function mergeGroup(g: Group) {
    if (!token) return;
    const ids = toMerge(g).map((m) => m.id);
    const kept = g.members.find((m) => m.id === chosenKeep(g))!;
    if (ids.length === 0) return;
    setBusy(g.keepId);
    try {
      const preview = await apiRequest<Preview>('/customer-duplicates/preview', { method: 'POST', body: JSON.stringify({ keepId: kept.id, mergeIds: ids }) }, token);
      const lines = [
        `Keep ${nameOf(preview.keep)} (${realEmail(preview.keep.email) ?? 'no email'}, ${preview.keep.phone}).`,
        `Merge ${preview.merging.map((m) => `${nameOf(m)} (${realEmail(m.email) ?? 'no email'})`).join(', ')} into it.`,
        `${preview.ordersMoved} order${preview.ordersMoved === 1 ? '' : 's'} move across, along with their invoices, receipts, carts, documents, favourites and WhatsApp history.`,
        preview.adopt.email ? `The kept record takes the email ${preview.adopt.email}.` : '',
        'The other record is removed (a copy of it is kept). This cannot be undone from here.',
      ].filter(Boolean);
      if (!window.confirm(lines.join('\n\n'))) return;
      const out = await apiRequest<{ merged: number; moved: { orders: number } }>('/customer-duplicates/merge', { method: 'POST', body: JSON.stringify({ keepId: kept.id, mergeIds: ids }) }, token);
      setFeedback(`Merged ${out.merged} record${out.merged === 1 ? '' : 's'} into ${nameOf(kept)}; ${out.moved.orders} order${out.moved.orders === 1 ? '' : 's'} moved.`);
      await loadGroups(token);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setBusy(null);
    }
  }

  async function mergeAllSafe() {
    if (!token || !result) return;
    const safe = result.groups.filter((g) => g.safe);
    const extra = safe.reduce((n, g) => n + g.members.length - 1, 0);
    if (!window.confirm(`Merge ${safe.length} group${safe.length === 1 ? '' : 's'} (${extra} extra record${extra === 1 ? '' : 's'}) into the record shown as kept in each?\n\nEach is the same phone number or email, with nothing that differs. Orders and everything else move to the kept record, and the extra records are removed (a copy of each is kept). This cannot be undone from here.`)) return;
    setBusy('all');
    try {
      const out = await apiRequest<{ groupsMerged: number; customersMerged: number; skipped: Array<{ keepId: string; reason: string }> }>('/customer-duplicates/merge-safe', { method: 'POST', body: JSON.stringify({ keepIds: safe.map((g) => g.keepId) }) }, token);
      setFeedback(`Merged ${out.customersMerged} record${out.customersMerged === 1 ? '' : 's'} in ${out.groupsMerged} group${out.groupsMerged === 1 ? '' : 's'}.${out.skipped.length ? ` ${out.skipped.length} left alone because they changed.` : ''}`);
      await loadGroups(token);
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setBusy(null);
    }
  }

  if (!initialized || loading) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}><article className="portal-card portal-loading">Looking for duplicates...</article></section></main>
      </EliteLayout>
    );
  }
  if (!token || !profile) {
    return (
      <EliteLayout active="portal">
        <main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
          <article className="portal-card"><h2>Authentication required</h2><Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>Go to Portal Login</Link></article>
        </section></main>
      </EliteLayout>
    );
  }

  const groups = result?.groups ?? [];
  const review = groups.filter((g) => !g.safe);
  const safe = groups.filter((g) => g.safe);

  const card = (g: Group) => {
    const chosen = chosenKeep(g);
    return (
      <article key={g.keepId} className="portal-card" style={{ marginBottom: 16 }}>
        <div className="portal-card-head">
          <div>
            <strong>{g.reason || 'Possible duplicate'}</strong>
            {g.safe ? <span className="portal-chip is-success" style={{ marginLeft: 8 }}>Safe to merge</span> : <span className="portal-chip is-muted" style={{ marginLeft: 8 }}>Check first</span>}
          </div>
        </div>
        {g.caution ? <p className="portal-note" style={{ marginTop: 0 }}>{g.caution}</p> : null}
        <div className="portal-list-stack">
          {g.members.map((m) => {
            const isKept = m.id === chosen;
            const excluded = (left[g.keepId] ?? []).includes(m.id);
            return (
              <div key={m.id} className="portal-record" style={{ opacity: !isKept && excluded ? 0.5 : 1 }}>
                <div className="portal-list-row">
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', minWidth: 0 }}>
                    <input type="radio" name={`keep-${g.keepId}`} checked={isKept} onChange={() => setKeep((k) => ({ ...k, [g.keepId]: m.id }))} aria-label={`Keep ${nameOf(m)}`} />
                    <span style={{ minWidth: 0 }}>
                      <Link href={`/portal/customers/${m.id}`} target="_blank"><strong>{nameOf(m)}</strong></Link>
                      {isKept ? <span className="portal-chip is-success" style={{ marginLeft: 8 }}>Keep</span> : null}
                      {m.hasPassword && m.portalEnabled ? <span className="portal-chip is-muted" style={{ marginLeft: 8 }}>Has sign-in</span> : null}
                      <span className="portal-muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                        {realEmail(m.email) ?? 'No email'} · {m.phone} · {m.orders} order{m.orders === 1 ? '' : 's'}{m.lastOrderAt ? `, last ${formatDate(m.lastOrderAt)}` : ''} · added {formatDate(m.createdAt)}
                      </span>
                    </span>
                  </label>
                  {!isKept ? (
                    <label className="portal-muted" style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={!excluded} onChange={(e) => setLeft((l) => ({ ...l, [g.keepId]: e.target.checked ? (l[g.keepId] ?? []).filter((x) => x !== m.id) : [...(l[g.keepId] ?? []), m.id] }))} />
                      Merge this one
                    </label>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {canMerge ? (
          <div className="portal-action-row" style={{ marginTop: 12 }}>
            <button type="button" className="portal-primary-btn" disabled={busy !== null || toMerge(g).length === 0} onClick={() => void mergeGroup(g)}>
              {busy === g.keepId ? 'Merging...' : `Merge ${toMerge(g).length} into the kept record`}
            </button>
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r: { name: string }) => r.name === 'ADMIN')}
            active="customers"
            pageTitle="Duplicate customers"
            pageSubtitle="The same person on more than one record."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void loadGroups(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}
            {feedback ? <article className="portal-card portal-success">{feedback}</article> : null}

            <article className="portal-card" style={{ marginBottom: 20 }}>
              <div className="portal-card-head">
                <h2 style={{ margin: 0 }}>{result ? (groups.length === 0 ? 'No duplicates found' : `${result.summary.extraRecords} extra record${result.summary.extraRecords === 1 ? '' : 's'} in ${result.summary.groups} group${result.summary.groups === 1 ? '' : 's'}`) : 'Duplicates'}</h2>
                <Link href="/portal/customers" className="portal-inline-btn">Back to customers</Link>
              </div>
              <p className="portal-muted" style={{ margin: 0 }}>
                Customers are linked when they share a phone number or an email address. A merge moves everything the others own (orders, invoices, receipts, carts, documents,
                favourites, WhatsApp history) to the record that is kept, and removes the others, keeping a copy of each. Reseller and wholesale accounts are never listed.
                {!canMerge ? ' Your role can look but not merge.' : ''}
              </p>
              {canMerge && safe.length > 0 ? (
                <div className="portal-action-row" style={{ marginTop: 12 }}>
                  <button type="button" className="portal-primary-btn" disabled={busy !== null} onClick={() => void mergeAllSafe()}>
                    {busy === 'all' ? 'Merging...' : `Merge all ${safe.length} safe group${safe.length === 1 ? '' : 's'}`}
                  </button>
                  <span className="portal-muted">Safe means the same number or email and nothing that differs.</span>
                </div>
              ) : null}
            </article>

            {review.length > 0 ? <h3 style={{ margin: '0 0 12px' }}>Check these first ({review.length})</h3> : null}
            {review.map(card)}
            {safe.length > 0 ? <h3 style={{ margin: '8px 0 12px' }}>Safe to merge ({safe.length})</h3> : null}
            {safe.map(card)}
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}
