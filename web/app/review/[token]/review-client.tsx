"use client";

/**
 * The page behind the link the shop sends a customer after their order: the pairs they bought, a rating and a few words for each. A review left
 * here is marked as a verified purchase (the link is the proof), and waits for the shop to read it before it appears.
 */

import { FormEvent, useEffect, useState } from 'react';
import { EliteLayout } from '../../components/elite-layout';
import { StarPicker } from '../../components/stars';
import { OrderToReview, fetchOrderToReview, submitOrderReviews } from '../../lib/reviews';

type Draft = { rating: number; title: string; body: string };

export function ReviewOrderClient({ token }: { token: string }) {
  const [order, setOrder] = useState<OrderToReview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: number; alreadyReviewed: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOrderToReview(token)
      .then((o) => { if (!cancelled) setOrder(o); })
      .catch((e) => { if (!cancelled) setProblem(e instanceof Error ? e.message : 'This review link is not valid.'); });
    return () => { cancelled = true; };
  }, [token]);

  const draft = (slug: string): Draft => drafts[slug] ?? { rating: 0, title: '', body: '' };
  const change = (slug: string, patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [slug]: { ...draft(slug), ...patch } }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const chosen = (order?.items ?? []).filter((i) => !i.reviewed && draft(i.slug).rating > 0);
    if (chosen.length === 0) { setError('Choose a rating for at least one pair.'); return; }
    setBusy(true);
    try {
      setDone(await submitOrderReviews(token, chosen.map((i) => ({ productSlug: i.slug, rating: draft(i.slug).rating, title: draft(i.slug).title.trim() || undefined, body: draft(i.slug).body }))));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <EliteLayout active="none">
      <main className="lp-main-content">
        <section className="lp-container de-review-order">
          {problem ? (
            <>
              <h1>Review your pair</h1>
              <p role="alert">{problem}</p>
            </>
          ) : !order ? (
            <p>Loading…</p>
          ) : done ? (
            <>
              <h1>Thank you, {order.firstName}!</h1>
              <p className="de-review-thanks" role="status">
                {done.created > 0 ? `Your review${done.created === 1 ? '' : 's'} will appear once we have read ${done.created === 1 ? 'it' : 'them'}.` : 'You had already reviewed these pairs, so nothing new was added.'}
              </p>
            </>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <h1>How are your pairs, {order.firstName}?</h1>
              <p className="de-muted">A few words help other shoppers choose. It takes a minute, and it is shown with your first name only.</p>
              {order.items.map((item) => (
                <div key={item.slug} className="de-review-order-item">
                  <div className="de-review-order-product">
                    {item.imageUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.imageUrl} alt="" /> : null}
                    <strong>{item.name}</strong>
                  </div>
                  {item.reviewed ? (
                    <p className="de-muted">You have already reviewed this pair. Thank you!</p>
                  ) : (
                    <div className="de-review-form">
                      <StarPicker value={draft(item.slug).rating} onChange={(rating) => change(item.slug, { rating })} name={`rating-${item.slug}`} />
                      <label><span>Title <small>(optional)</small></span><input value={draft(item.slug).title} onChange={(e) => change(item.slug, { title: e.target.value })} maxLength={80} /></label>
                      <label><span>Your review</span><textarea rows={3} value={draft(item.slug).body} onChange={(e) => change(item.slug, { body: e.target.value })} maxLength={1000} placeholder="How do they fit? Are they as you expected?" /></label>
                    </div>
                  )}
                </div>
              ))}
              {error ? <p className="de-checkout-error" role="alert">{error}</p> : null}
              {order.items.some((i) => !i.reviewed) ? (
                <div className="de-review-form-actions" style={{ marginTop: 16 }}>
                  <button type="submit" className="lp-button lp-button-primary" disabled={busy}>{busy ? 'Sending…' : 'Send my review'}</button>
                </div>
              ) : null}
            </form>
          )}
        </section>
      </main>
    </EliteLayout>
  );
}
