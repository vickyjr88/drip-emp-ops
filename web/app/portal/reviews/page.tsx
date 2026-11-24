"use client";

/**
 * Reviews: read what shoppers wrote, let it through or turn it away, answer it, add one a customer sent another way, and ask customers for theirs.
 *
 * Nothing shows on the storefront until a person approves it here, and a product's reviews only show once it has enough approved ones. The line
 * under each approval says where that product now stands, so it is never a surprise why reviews have, or have not, appeared.
 */

import Link from 'next/link';
import { usePortalDialog } from '../components/portal-dialog';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { Stars } from '../../components/stars';
import { PortalShell } from '../components/portal-shell';
import { useErrorState, useFeedbackState } from '../components/notifications';
import {
  API_BASE_URL, AuthProfile, TOKEN_KEY, apiRequest, canReadRbacFor, formatDate, hasPermission, loadProfile, roleLabelFor,
} from '../accounting/lib';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';
type Review = {
  id: string; rating: number; title: string | null; body: string; displayName: string; status: Status; verifiedPurchase: boolean; source: string;
  reviewerContact: string | null; reply: string | null; rejectionReason: string | null; createdAt: string;
  product: { id: string; name: string; slug: string }; order: { orderNumber: string } | null;
};
type Page = { items: Review[]; total: number; page: number; totalPages: number };
type Counts = { pending: number; approved: number; rejected: number; minPerProduct: number; minForSite: number; siteVisible: boolean };
type Visibility = { approved: number; minToShow: number; visible: boolean };
type Request = { orderNumber: string; customerName: string | null; phone: string | null; products: string[]; allReviewed: boolean; reviewsLeft: number; link: string; whatsappUrl: string | null; placedAt: string; auto: { email: Channel; whatsapp: Channel } | null };
type Channel = { status: string | null; detail: string | null };
type AutoStatus = { enabled: boolean; delayHours: number; maxAgeDays: number; template: string; whatsappConfigured: boolean };

const TABS: Array<{ key: Status | 'ask' | 'add'; label: string }> = [
  { key: 'PENDING', label: 'Waiting' }, { key: 'APPROVED', label: 'Approved' }, { key: 'REJECTED', label: 'Turned away' },
  { key: 'ask', label: 'Ask for reviews' }, { key: 'add', label: 'Add one' },
];

/** What approving (or turning away) a review did to its product, in words. */
function standing(name: string, v: Visibility): string {
  return v.visible
    ? `${name} has ${v.approved} approved review${v.approved === 1 ? '' : 's'}, so its reviews now show on its page.`
    : `${name} has ${v.approved} of the ${v.minToShow} approved reviews it needs before its reviews show on its page.`;
}

export default function ReviewsPage() {
  const dialog = usePortalDialog();
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [tab, setTab] = useState<Status | 'ask' | 'add'>('PENDING');
  const [data, setData] = useState<Page | null>(null);
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [auto, setAuto] = useState<AutoStatus | null>(null);
  const [replying, setReplying] = useState<{ id: string; text: string } | null>(null);
  const [errorMessage, setErrorMessage] = useErrorState();
  const [feedback, setFeedback] = useFeedbackState();

  useEffect(() => { setToken(window.localStorage.getItem(TOKEN_KEY)); setInitialized(true); }, []);

  const load = useCallback(async (authToken: string) => {
    try {
      setProfile(await loadProfile(authToken));
      setCounts(await apiRequest<Counts>('/reviews/counts', { method: 'GET' }, authToken));
    } catch (error) {
      setErrorMessage(error);
    } finally {
      setLoading(false);
    }
  }, [setErrorMessage]);

  useEffect(() => { if (!initialized) return; if (!token) { setLoading(false); return; } void load(token); }, [initialized, token, load]);

  const loadTab = useCallback(async () => {
    if (!token || !profile) return;
    try {
      if (tab === 'ask') {
        setRequests(await apiRequest<Request[]>('/reviews/requests', { method: 'GET' }, token));
        setAuto(await apiRequest<AutoStatus>('/reviews/auto-status', { method: 'GET' }, token).catch(() => null));
      }
      else if (tab !== 'add') setData(await apiRequest<Page>(`/reviews?status=${tab}&page=${page}`, { method: 'GET' }, token));
    } catch (error) {
      setErrorMessage(error);
    }
  }, [token, profile, tab, page, setErrorMessage]);

  useEffect(() => { void loadTab(); }, [loadTab]);

  const canUpdate = hasPermission(profile, 'product-review.update');
  const canCreate = hasPermission(profile, 'product-review.create');
  const canDelete = hasPermission(profile, 'product-review.delete');

  async function after(message: string) {
    setFeedback(message);
    if (token) setCounts(await apiRequest<Counts>('/reviews/counts', { method: 'GET' }, token));
    await loadTab();
  }

  async function moderate(review: Review, body: Record<string, unknown>, done: string) {
    if (!token) return;
    try {
      const out = await apiRequest<{ product: Visibility }>(`/reviews/${review.id}`, { method: 'PATCH', body: JSON.stringify(body) }, token);
      await after(`${done} ${standing(review.product.name, out.product)}`);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function reject(review: Review) {
    const answer = await dialog.prompt({
      title: 'Turn this review away?',
      message: 'It will not be shown on the site.',
      fields: [{ name: 'reason', label: 'Why? (only you will see this, optional)', type: 'textarea' }],
      confirmLabel: 'Turn it away',
    });
    if (answer === null) return;
    const reason = answer.reason ?? '';
    await moderate(review, { status: 'REJECTED', rejectionReason: reason }, 'Turned away.');
  }

  async function remove(review: Review) {
    if (!token || !(await dialog.confirm({ title: 'Delete this review for good?', message: 'It is removed from the site and from your records.', confirmLabel: 'Delete review', danger: true }))) return;
    try {
      const out = await apiRequest<{ product: Visibility }>(`/reviews/${review.id}`, { method: 'DELETE' }, token);
      await after(`Deleted. ${standing(review.product.name, out.product)}`);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function sendReply(review: Review) {
    if (!replying) return;
    await moderate(review, { reply: replying.text }, replying.text.trim() ? 'Reply saved.' : 'Reply removed.');
    setReplying(null);
  }

  if (!initialized || loading) {
    return <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}><article className="portal-card portal-loading">Loading reviews...</article></section></main></EliteLayout>;
  }
  if (!token || !profile) {
    return (
      <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}>
        <article className="portal-card"><h2>Authentication required</h2><Link href="/portal" className="portal-primary-btn" style={{ display: 'inline-flex', width: 'fit-content' }}>Go to Portal Login</Link></article>
      </section></main></EliteLayout>
    );
  }
  if (!hasPermission(profile, 'product-review.read')) {
    return <EliteLayout active="portal"><main className="lp-main-content portal-main"><section className="lp-container" style={{ paddingTop: 72 }}><article className="portal-card"><p>Your role cannot see reviews.</p></article></section></main></EliteLayout>;
  }

  return (
    <EliteLayout active="portal">
      <main className="lp-main-content portal-main is-authenticated">
        <section className="lp-container portal-auth-section">
          <PortalShell
            active="reviews"
            tourUserId={profile.id}
            tourPermissions={profile.permissions || []}
            tourIsAdmin={profile.role === 'ADMIN' || (profile.roles || []).some((r) => r.name === 'ADMIN')}
            pageTitle="Reviews"
            pageSubtitle="Read, approve and answer what shoppers write."
            email={profile.email}
            roleLabel={roleLabelFor(profile)}
            permissionCount={profile.permissions?.length || 0}
            canReadRbac={canReadRbacFor(profile)}
            canReadUsers={hasPermission(profile, 'user.read')}
            onLogout={() => { window.localStorage.removeItem(TOKEN_KEY); window.location.href = '/portal'; }}
            onRefresh={() => token && void load(token)}
          >
            {errorMessage ? <article className="portal-card portal-error">{errorMessage}</article> : null}
            {feedback ? <article className="portal-card portal-success">{feedback}</article> : null}

            <article className="portal-card" style={{ marginBottom: 20 }}>
              <h2 style={{ marginTop: 0 }}>How reviews show on the shop</h2>
              <p className="portal-muted" style={{ margin: 0 }}>
                A review never shows until someone here approves it. A product&apos;s reviews (its stars, its list, and the rating search engines are told about) show only once it has{' '}
                <strong>{counts?.minPerProduct ?? 3} approved reviews</strong>, so a shopper never sees one or two on their own. The shop&apos;s overall rating shows after{' '}
                <strong>{counts?.minForSite ?? 10}</strong> approved in all{counts ? (counts.siteVisible ? ' (it is showing now)' : ' (not yet)') : ''}. Below that, a product page just invites a review.
              </p>
            </article>

            <article className="portal-card">
              <div className="portal-action-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {TABS.map((t) => (
                  <button key={t.key} type="button" className={tab === t.key ? 'portal-primary-btn' : 'portal-inline-btn'} onClick={() => { setTab(t.key); setPage(1); }}>
                    {t.label}
                    {t.key === 'PENDING' && counts ? ` (${counts.pending})` : t.key === 'APPROVED' && counts ? ` (${counts.approved})` : t.key === 'REJECTED' && counts ? ` (${counts.rejected})` : ''}
                  </button>
                ))}
              </div>

              {tab === 'ask' ? <AskTab requests={requests} auto={auto} /> : tab === 'add' ? (
                canCreate ? <AddTab token={token} onDone={(m) => void after(m)} onError={setErrorMessage} /> : <p className="portal-muted">Your role cannot add reviews.</p>
              ) : (
                <>
                  {data && data.items.length === 0 ? <div className="portal-empty-state">{tab === 'PENDING' ? 'Nothing is waiting.' : 'Nothing here.'}</div> : null}
                  <div className="portal-list-stack">
                    {(data?.items ?? []).map((review) => (
                      <div key={review.id} className="portal-record">
                        <div className="portal-list-row">
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <Stars value={review.rating} size={16} />
                              {review.title ? <strong>{review.title}</strong> : null}
                              {review.verifiedPurchase ? <span className="portal-chip is-success">Verified purchase</span> : null}
                              {review.source === 'staff' ? <span className="portal-chip is-muted">Added by staff</span> : null}
                            </div>
                            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '6px 0' }}>{review.body}</p>
                            <p className="portal-muted" style={{ margin: 0, overflowWrap: 'anywhere' }}>
                              {review.displayName} on <Link href={`/shop/${review.product.slug}`} target="_blank">{review.product.name}</Link> · {formatDate(review.createdAt)}
                              {review.reviewerContact ? ` · ${review.reviewerContact}` : ''}{review.order ? ` · order ${review.order.orderNumber}` : ''}
                            </p>
                            {review.rejectionReason ? <p className="portal-muted" style={{ margin: '4px 0 0' }}>Turned away: {review.rejectionReason}</p> : null}
                            {review.reply ? <p style={{ margin: '8px 0 0', paddingLeft: 10, borderLeft: '3px solid var(--p-border, #ccd)' }}><strong>Your reply:</strong> {review.reply}</p> : null}
                            {replying?.id === review.id ? (
                              <div style={{ marginTop: 8 }}>
                                <textarea rows={2} style={{ width: '100%' }} maxLength={500} value={replying.text} onChange={(e) => setReplying({ id: review.id, text: e.target.value })} placeholder="A short, polite reply. It shows under the review once it is approved." />
                                <div className="portal-action-row" style={{ marginTop: 6 }}>
                                  <button type="button" className="portal-primary-btn" onClick={() => void sendReply(review)}>Save reply</button>
                                  <button type="button" className="portal-inline-btn" onClick={() => setReplying(null)}>Cancel</button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                          {canUpdate || canDelete ? (
                            <div className="portal-action-row" style={{ flexWrap: 'wrap' }}>
                              {canUpdate && review.status !== 'APPROVED' ? <button type="button" className="portal-primary-btn" onClick={() => void moderate(review, { status: 'APPROVED' }, 'Approved.')}>Approve</button> : null}
                              {canUpdate && review.status !== 'REJECTED' ? <button type="button" className="portal-inline-btn" onClick={() => void reject(review)}>Turn away</button> : null}
                              {canUpdate ? <button type="button" className="portal-inline-btn" onClick={() => setReplying({ id: review.id, text: review.reply ?? '' })}>{review.reply ? 'Edit reply' : 'Reply'}</button> : null}
                              {canDelete ? <button type="button" className="portal-inline-btn" onClick={() => void remove(review)}>Delete</button> : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  {data && data.totalPages > 1 ? (
                    <div className="portal-action-row" style={{ marginTop: 12, alignItems: 'center' }}>
                      <button type="button" className="portal-inline-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                      <span className="portal-muted">Page {data.page} of {data.totalPages}</span>
                      <button type="button" className="portal-inline-btn" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</button>
                    </div>
                  ) : null}
                </>
              )}
            </article>
          </PortalShell>
        </section>
      </main>
    </EliteLayout>
  );
}

/** Recent paid orders, each with the review link ready to send on WhatsApp. This is where most reviews will come from. */
/** How one channel of the automatic request went, in a few words. */
function ChannelChip({ label, channel }: { label: string; channel: Channel | undefined }) {
  if (!channel?.status) return null;
  const tone = channel.status === 'SENT' ? 'is-success' : channel.status === 'FAILED' ? 'is-danger' : 'is-muted';
  const word = channel.status === 'SENT' ? 'sent' : channel.status === 'FAILED' ? 'failed' : channel.status === 'SENDING' ? 'sending' : 'skipped';
  return <span className={`portal-chip ${tone}`} style={{ marginLeft: 8 }} title={channel.detail ?? undefined}>{label} {word}</span>;
}

function AskTab({ requests, auto }: { requests: Request[] | null; auto: AutoStatus | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!requests) return <p className="portal-muted">Loading...</p>;
  if (requests.length === 0) return <div className="portal-empty-state">No paid orders with a phone number in the last 60 days.</div>;
  return (
    <>
      {auto ? (
        <p className="portal-note" style={{ marginTop: 0 }}>
          {auto.enabled
            ? `Automatic: each retail order is asked by email and WhatsApp ${auto.delayHours === 0 ? 'as soon as' : `${auto.delayHours} hours after`} it is marked delivered (orders delivered in the last ${auto.maxAgeDays} days). ${auto.whatsappConfigured ? '' : 'WhatsApp is not set up on the server, so only the email goes. '}The chips below show what happened.`
            : 'Automatic review requests are switched off. Set REVIEW_REQUESTS_ENABLED=true on the server to send them after delivery; until then, send the links below yourself.'}
        </p>
      ) : null}
      <p className="portal-muted" style={{ marginTop: 0 }}>Send the link to people who have received their pairs. It is theirs alone, and a review left through it is marked as a verified purchase. It still waits here for you to approve.</p>
      <div className="portal-list-stack">
        {requests.map((r) => (
          <div key={r.orderNumber} className="portal-record">
            <div className="portal-list-row">
              <div style={{ minWidth: 0 }}>
                <strong>{r.customerName || 'Customer'}</strong> <span className="portal-muted">· {r.orderNumber} · {formatDate(r.placedAt)}</span>
                {r.allReviewed ? <span className="portal-chip is-success" style={{ marginLeft: 8 }}>Reviewed</span> : r.reviewsLeft ? <span className="portal-chip is-muted" style={{ marginLeft: 8 }}>{r.reviewsLeft} left</span> : null}
                <ChannelChip label="Email" channel={r.auto?.email} />
                <ChannelChip label="WhatsApp" channel={r.auto?.whatsapp} />
                <p className="portal-muted" style={{ margin: '2px 0 0', overflowWrap: 'anywhere' }}>{r.products.join(', ')}</p>
              </div>
              <div className="portal-action-row" style={{ flexWrap: 'wrap' }}>
                {r.whatsappUrl && !r.allReviewed ? <a className="portal-primary-btn" href={r.whatsappUrl} target="_blank" rel="noreferrer">Ask on WhatsApp</a> : null}
                {!r.allReviewed ? (
                  <button type="button" className="portal-inline-btn" onClick={() => { void navigator.clipboard?.writeText(r.link).then(() => setCopied(r.orderNumber)).catch(() => undefined); }}>
                    {copied === r.orderNumber ? 'Copied' : 'Copy link'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** A review a customer sent some other way, typed in. Approved at once, marked as added by staff. */
function AddTab({ token, onDone, onError }: { token: string; onDone: (message: string) => void; onError: (error: unknown) => void }) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [product, setProduct] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({ rating: 5, name: '', title: '', body: '' });

  useEffect(() => {
    if (search.trim().length < 2) { setFound([]); return; }
    const timer = window.setTimeout(() => {
      void fetch(`${API_BASE_URL}/shop/products?search=${encodeURIComponent(search.trim())}`).then((r) => r.json()).then((rows) => setFound(Array.isArray(rows) ? rows.slice(0, 6) : [])).catch(() => setFound([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!product) return;
    try {
      const out = await apiRequest<{ product: Visibility }>('/reviews', { method: 'POST', body: JSON.stringify({ productId: product.id, ...form, title: form.title || undefined }) }, token);
      setForm({ rating: 5, name: '', title: '', body: '' });
      onDone(`Added. ${standing(product.name, out.product)}`);
    } catch (error) {
      onError(error);
    }
  }

  return (
    <form onSubmit={submit} className="portal-form-grid" style={{ maxWidth: 560 }}>
      <p className="portal-muted" style={{ margin: 0 }}>For a review a customer sent you another way, such as a message or a Google review. Use only words they really wrote. It shows with their first name and last initial, approved at once, marked as added by staff.</p>
      <label><span>Pair</span>
        {product ? (
          <span>{product.name} <button type="button" className="portal-inline-btn" onClick={() => setProduct(null)}>Change</button></span>
        ) : (
          <>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type the pair's name" />
            {found.map((p) => <button key={p.id} type="button" className="portal-inline-btn" style={{ textAlign: 'left' }} onClick={() => { setProduct({ id: p.id, name: p.name }); setFound([]); setSearch(''); }}>{p.name}</button>)}
          </>
        )}
      </label>
      <label><span>Stars</span>
        <select value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select>
      </label>
      <label><span>Customer&apos;s name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
      <label><span>Title (optional)</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} /></label>
      <label><span>Their words</span><textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required maxLength={1000} /></label>
      <button type="submit" className="portal-primary-btn" disabled={!product} style={{ width: 'fit-content' }}>Add review</button>
    </form>
  );
}
