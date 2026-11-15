"use client";

/**
 * A product's reviews, and the way to add one.
 *
 * Reviews are shown only once the product has enough approved ones (the server decides: `reviews.visible`). Below that this shows no stars, no
 * average and no count, only an invitation, because one or two reviews on their own read as a shop with few customers, or as made up. The form
 * is always offered: a review written here waits for a person to read it, and is never marked as a verified purchase (that comes from the link
 * the shop sends for an order). The phone number or email asked for is so a review can be checked and one person leaves one; it is never shown.
 */

import { FormEvent, useState } from 'react';
import { fetchMoreReviews, submitReview } from '../lib/reviews';
import type { ProductReviews, PublicReview } from '../lib/shop';
import { StarPicker, Stars } from './stars';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function ProductReviewsSection({ slug, productName, reviews }: { slug: string; productName: string; reviews: ProductReviews }) {
  const [items, setItems] = useState<PublicReview[]>(reviews.items);
  const [loadingMore, setLoadingMore] = useState(false);

  async function showMore() {
    setLoadingMore(true);
    try {
      const next = await fetchMoreReviews(slug, items.length);
      setItems((prev) => [...prev, ...next.items.filter((r) => !prev.some((p) => p.id === r.id))]);
    } catch {
      // The reviews already shown stay; the button is simply there to try again.
    } finally {
      setLoadingMore(false);
    }
  }

  const spread = reviews.distribution;
  const most = spread ? Math.max(...spread, 1) : 1;

  return (
    <section className="lp-container de-reviews" id="reviews" aria-labelledby="reviews-heading">
      {reviews.visible && reviews.average !== null ? (
        <>
          <h2 id="reviews-heading">Customer reviews</h2>
          <div className="de-reviews-summary">
            <div className="de-reviews-score">
              <strong>{reviews.average.toFixed(1)}</strong>
              <Stars value={reviews.average} size={20} />
              <span>{reviews.count} review{reviews.count === 1 ? '' : 's'}</span>
            </div>
            {spread ? (
              <ul className="de-reviews-spread" aria-label="How many reviews gave each rating">
                {[5, 4, 3, 2, 1].map((stars) => (
                  <li key={stars}>
                    <span>{stars}</span>
                    <i aria-hidden="true"><b style={{ width: `${(spread[stars - 1] / most) * 100}%` }} /></i>
                    <span>{spread[stars - 1]}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <ul className="de-review-list">
            {items.map((review) => (
              <li key={review.id} className="de-review">
                <div className="de-review-head">
                  <Stars value={review.rating} size={16} />
                  {review.title ? <strong>{review.title}</strong> : null}
                </div>
                <p className="de-review-body">{review.body}</p>
                <p className="de-review-meta">
                  {review.displayName} · {when(review.createdAt)}
                  {review.verified ? <span className="de-review-verified">Verified purchase</span> : null}
                </p>
                {review.reply ? (
                  <div className="de-review-reply">
                    <strong>Drip Emporium replied</strong>
                    <p>{review.reply}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {items.length < reviews.count ? (
            <button type="button" className="lp-button lp-button-ghost" onClick={() => void showMore()} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Show more reviews'}
            </button>
          ) : null}
        </>
      ) : null}

      <WriteReview slug={slug} productName={productName} first={!reviews.visible} />
    </section>
  );
}

function WriteReview({ slug, productName, first }: { slug: string; productName: string; first: boolean }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ rating: 0, title: '', body: '', name: '', phone: '', email: '', website: '' });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.rating) { setError('Choose a rating from 1 to 5 stars.'); return; }
    setBusy(true);
    try {
      await submitReview(slug, {
        rating: form.rating, title: form.title.trim() || undefined, body: form.body, name: form.name,
        phone: form.phone.trim() || undefined, email: form.email.trim() || undefined, website: form.website,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className="de-review-thanks" role="status">Thank you! Your review of the {productName} will appear once we have read it.</p>;
  }

  return (
    <div className="de-review-write">
      {!open ? (
        <>
          <p className="de-review-invite">{first ? `Bought the ${productName}? Tell other shoppers what you think.` : 'Bought this pair? Share your review.'}</p>
          <button type="button" className="lp-button lp-button-ghost" onClick={() => setOpen(true)} aria-expanded="false">Write a review</button>
        </>
      ) : (
        <form onSubmit={onSubmit} className="de-review-form" noValidate>
          <h3>Your review of the {productName}</h3>
          <StarPicker value={form.rating} onChange={(rating) => setForm((prev) => ({ ...prev, rating }))} name={`rating-${slug}`} />
          <label><span>Title <small>(optional)</small></span><input value={form.title} onChange={set('title')} maxLength={80} /></label>
          <label><span>Your review</span><textarea value={form.body} onChange={set('body')} rows={4} maxLength={1000} required placeholder="How do they fit? Are they as you expected?" /></label>
          <label><span>Your first name</span><input value={form.name} onChange={set('name')} autoComplete="given-name" required /><small>Shown with your review, with the initial of your last name.</small></label>
          <label><span>Phone number</span><input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="0712 345 678" /></label>
          <label><span>Or email</span><input type="email" value={form.email} onChange={set('email')} autoComplete="email" /><small>One of the two, so we can check your review is real. It is never shown.</small></label>
          {/* A person never sees this; a robot fills it in, and its review is dropped. */}
          <div className="de-review-trap" aria-hidden="true">
            <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
          </div>
          {error ? <p className="de-checkout-error" role="alert">{error}</p> : null}
          <div className="de-review-form-actions">
            <button type="submit" className="lp-button lp-button-primary" disabled={busy}>{busy ? 'Sending…' : 'Send review'}</button>
            <button type="button" className="lp-button lp-button-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
