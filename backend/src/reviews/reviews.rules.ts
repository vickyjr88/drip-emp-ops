import { BadRequestException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { isValidPhoneNumber } from '../common/phone.util';
import { phoneTail } from '../common/contact-email';

/**
 * The rules for product reviews, kept apart from the database so they can be reasoned about (and tested) on their own.
 *
 * The one that matters most: **reviews are shown only when there are enough of them.** A product with one glowing review and nothing else reads as
 * a shop that has few customers, or worse, as a made-up review; three or more, from different people, reads as what customers actually think. So
 * a product's reviews (its stars, its list, the rating search engines are told about) appear only once it has `product` approved reviews, and the
 * site's overall rating only once there are `site` approved reviews in all. Below that, nothing about reviews is shown, only an invitation to
 * write one. Approved means a person on staff read it and let it through; a review waiting, or turned away, never counts.
 */

export const DEFAULT_MIN_REVIEWS_PRODUCT = 3;
export const DEFAULT_MIN_REVIEWS_SITE = 10;

/** How many approved reviews it takes. Set with REVIEWS_MIN_PRODUCT and REVIEWS_MIN_SITE; anything that is not a whole number from 1 to 1000 is ignored. */
export function reviewThresholds(env: Record<string, string | undefined> = process.env) {
  const whole = (value: string | undefined, fallback: number) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : fallback;
  };
  return { product: whole(env.REVIEWS_MIN_PRODUCT, DEFAULT_MIN_REVIEWS_PRODUCT), site: whole(env.REVIEWS_MIN_SITE, DEFAULT_MIN_REVIEWS_SITE) };
}

export const enoughToShow = (approved: number, minimum: number) => approved >= minimum;

/** How many reviews and their average, to one decimal. No reviews has no average (not zero stars). */
export function summarise(ratings: number[]): { count: number; average: number | null } {
  if (!ratings.length) return { count: 0, average: null };
  const sum = ratings.reduce((a, b) => a + b, 0);
  return { count: ratings.length, average: Math.round((sum / ratings.length) * 10) / 10 };
}

/** How many reviews gave each number of stars (index 0 is one star). */
export function distribution(ratings: number[]): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const r of ratings) if (r >= 1 && r <= 5) out[r - 1] += 1;
  return out;
}

/** What is shown beside a review: the first name and the last name's initial, "Wanjiku K." Never a full name, never digits or symbols. */
export function displayNameOf(full: string | null | undefined): string {
  const words = (full ?? '')
    .normalize('NFC')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}'’-]/gu, ''))
    .filter((w) => w.length > 0);
  if (!words.length) return 'A customer';
  // "WANJIKU" and "wanjiku" become "Wanjiku"; a name with its own capitals (DeShawn, McKinley) is left as it was typed.
  const tidy = (w: string) => (w === w.toUpperCase() || w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1));
  const first = tidy(words[0].slice(0, 20));
  const last = words.length > 1 ? words[words.length - 1] : '';
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export type CleanReview = { rating: number; title: string | null; body: string };

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co\.ke|ke|net|org|io|shop|store|me|ly)\b)/i;

/** A rating and some words, or a message a shopper can act on. Links, email addresses and phone numbers are kept out of what is published. */
export function cleanReview(input: { rating?: unknown; title?: unknown; body?: unknown }): CleanReview {
  const rating = typeof input.rating === 'string' && input.rating.trim() !== '' ? Number(input.rating) : input.rating;
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new BadRequestException('Choose a rating from 1 to 5 stars.');
  }
  const tidy = (value: unknown) =>
    typeof value === 'string'
      ? value.replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f]/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
      : '';
  const body = tidy(input.body);
  if (body.length < 10) throw new BadRequestException('Please write a few words about the pair (at least 10 characters).');
  if (body.length > 1000) throw new BadRequestException('Please keep your review under 1,000 characters.');
  const title = tidy(input.title).replace(/\s+/g, ' ');
  if (title.length > 80) throw new BadRequestException('Please keep the title under 80 characters.');

  for (const text of [body, title]) {
    if (/@/.test(text)) throw new BadRequestException('Please leave email addresses out of your review.');
    if (LINK.test(text)) throw new BadRequestException('Please leave web links out of your review.');
    if (/(\d[\s.-]*){9,}/.test(text)) throw new BadRequestException('Please leave phone numbers out of your review.');
  }
  return { rating, title: title || null, body };
}

/** The contact a shopper gave to prove they are a person: a phone number, or failing that an email. Returns what to keep, or a message. */
export function cleanContact(input: { phone?: unknown; email?: unknown }): { phone: string | null; email: string | null } {
  const phone = typeof input.phone === 'string' && input.phone.trim() ? input.phone.trim() : null;
  const email = typeof input.email === 'string' && input.email.trim() ? input.email.trim().toLowerCase() : null;
  if (phone && !isValidPhoneNumber(phone)) throw new BadRequestException('That phone number does not look right.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('That email address does not look right.');
  if (!phone && !email) {
    throw new BadRequestException('Add your phone number or email so we can check the review is real. It is never shown.');
  }
  return { phone, email };
}

/**
 * Who a review is from, as a hash, so one person leaves one review per product however they come to write it (the product page, or the link for an
 * order). The phone number first (by its last nine digits, however it was typed, which is what both routes have), then the email, then the customer
 * record. Never shown to anyone.
 */
export function reviewerKeyOf(who: { customerId?: string | null; phone?: string | null; email?: string | null }): string {
  const raw = who.phone && phoneTail(who.phone).length >= 7 ? `p:${phoneTail(who.phone)}` : who.email?.trim() ? `e:${who.email.trim().toLowerCase()}` : who.customerId ? `c:${who.customerId}` : null;
  if (!raw) throw new BadRequestException('Add your phone number or email so we can check the review is real. It is never shown.');
  return createHash('sha256').update(raw).digest('hex');
}

// --- the link for an order -------------------------------------------------------------------------------------------------

const tokenSecret = () => process.env.REVIEW_TOKEN_SECRET || process.env.JWT_SECRET || 'dev-review-secret-change-me';
const sign = (orderNumber: string, secret: string) => createHmac('sha256', secret).update(`review:${orderNumber}`).digest('base64url').slice(0, 22);

/**
 * The link a customer follows to review what they bought: the order number and a signature only the server can make. It proves the link came from
 * the shop (so a review through it is a verified purchase), and cannot be made up for another order. It carries nothing about the customer.
 */
export function reviewToken(orderNumber: string, secret: string = tokenSecret()): string {
  return `${orderNumber}.${sign(orderNumber, secret)}`;
}

/** The order number a genuine token is for, or null for anything altered, truncated or made up. */
export function orderNumberOfToken(token: string, secret: string = tokenSecret()): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const orderNumber = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(orderNumber, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? orderNumber : null;
}
