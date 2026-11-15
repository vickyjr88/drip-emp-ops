/**
 * Reviews, from the browser: reading more of a product's, writing one, and writing them for an order through its link.
 * Every call says what went wrong in words a shopper can act on, because the server's messages are written for that.
 */

import type { ProductReviews } from './shop';

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(' ') : data?.message;
    throw new Error(message || 'Something went wrong. Please try again.');
  }
  return data as T;
}

export type ReviewInput = { rating: number; title?: string; body: string };

/** The next page of a product's reviews (newest first). Empty until the product has enough approved ones. */
export const fetchMoreReviews = (slug: string, offset: number) => call<ProductReviews>(`/shop/products/${encodeURIComponent(slug)}/reviews?offset=${offset}&limit=10`);

/** A review written on a product page. It waits for approval, so the shopper is thanked and told so. */
export const submitReview = (slug: string, input: ReviewInput & { name: string; phone?: string; email?: string; website?: string }) =>
  call<{ received: boolean }>(`/shop/products/${encodeURIComponent(slug)}/reviews`, { method: 'POST', body: JSON.stringify(input) });

export type OrderToReview = { orderNumber: string; firstName: string; items: Array<{ slug: string; name: string; imageUrl: string | null; reviewed: boolean }> };

export const fetchOrderToReview = (token: string) => call<OrderToReview>(`/shop/reviews/order/${encodeURIComponent(token)}`);

export const submitOrderReviews = (token: string, reviews: Array<ReviewInput & { productSlug: string }>) =>
  call<{ created: number; alreadyReviewed: number }>(`/shop/reviews/order/${encodeURIComponent(token)}`, { method: 'POST', body: JSON.stringify({ reviews }) });
