"use client";

/**
 * What a shopper does on the storefront, reported to this shop's own event store, so Insights can follow a visit from the
 * ad that brought it to the order it produced (including the ones that end in WhatsApp). The ad pixels and analytics that
 * were already here answer to Meta, TikTok and Google; this is the copy the shop owns.
 *
 * Anonymous. The session id is a random string kept for the life of the browser tab; it holds no name, phone or email.
 */

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const SESSION_KEY = 'de_sid';
const STARTED_KEY = 'de_started';

export type EventType = 'SESSION_START' | 'VIEW_PRODUCT' | 'ADD_TO_CART' | 'BEGIN_CHECKOUT' | 'WHATSAPP_CLICK' | 'SEARCH';

/** The same shape the backend accepts (insights/events.service SESSION_ID): letters and digits, 12 to 40 of them. */
function makeId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}

/** This tab's session id, made on first use. Null where storage is refused (some private modes): nothing is then recorded. */
export function getSessionId(): string | null {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = makeId();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Visit details read from the address once, at the start of a session. */
function visitDetails() {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    clickIds: { fbclid: params.has('fbclid'), ttclid: params.has('ttclid'), gclid: params.has('gclid') },
    referrer: document.referrer || undefined,
    landingPath: window.location.pathname,
  };
}

/** The product a storefront address is the page of, or null: /shop/<slug>, /watches/<slug>, /kits/<slug> (not their index or category pages). */
const NOT_PRODUCTS = new Set(['club', 'league', 'guides', 'image', 'brand', 'category', 'collection']);
export function productSlugOfPath(pathname: string): string | null {
  const match = pathname.match(/^\/(shop|watches|kits)\/([^/]+)\/?$/);
  return match && !NOT_PRODUCTS.has(match[2]) ? decodeURIComponent(match[2]) : null;
}

// True while the first request of a visit is on its way, so events fired in the meantime do not each start the visit again.
let startPending = false;

/** Sends one event. Fire and forget: a lost event is a rounding error, a broken page is not. */
export function recordEvent(type: EventType, extra: { productSlug?: string; detail?: string } = {}) {
  try {
    const sessionId = getSessionId();
    if (!sessionId) return;
    const events: Record<string, unknown>[] = [];
    // The first event of a tab's session carries where the visit came from. The visit counts as started only once the
    // server has accepted it, so a request lost on a bad connection does not leave the whole visit unrecorded.
    const needStart = !window.sessionStorage.getItem(STARTED_KEY) && !startPending;
    // A visit starts once: a repeat of the start (React runs effects twice in development) is not sent again.
    if (type === 'SESSION_START' && !needStart) return;
    if (needStart) {
      startPending = true;
      if (type !== 'SESSION_START') events.push({ type: 'SESSION_START', ...visitDetails() });
    }
    events.push({ type, ...(type === 'SESSION_START' ? visitDetails() : {}), ...extra });
    void fetch(`${API}/storefront-events`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, events }),
    })
      .then((res) => {
        if (!needStart) return;
        startPending = false;
        if (res.ok) window.sessionStorage.setItem(STARTED_KEY, '1');
      })
      .catch(() => {
        if (needStart) startPending = false;
      });
  } catch {
    // Storage or fetch refused: the page carries on.
  }
}
