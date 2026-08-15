"use client";

/**
 * Public site header, editable from the CMS under the "header" slug.
 *
 * Fetches on the client for the same reason the footer does: EliteLayout is a
 * server component wrapping every public page, and making it async would opt
 * each of those pages out of static rendering for the sake of a wordmark.
 *
 * The defaults passed to contentValue mirror what this rendered when it was
 * hardcoded, so the header looks identical until someone edits it, and it
 * still renders if the API is unreachable.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart } from '../lib/cart';
import { PageContentDocument, contentValue, fetchPageContent } from '../lib/page-content';
import { MobileNav } from './mobile-nav';

export type NavLink = { label: string; href: string };

export const DEFAULT_NAV_LINKS: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/shop' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

/**
 * Which nav key a link belongs to.
 *
 * Highlighting is driven by a key the page passes in, not by the URL, so a
 * link added in the CMS has to be mapped onto one. Deriving it from the href
 * means a new link highlights correctly without anyone editing this file,
 * and an unrecognised href simply never highlights rather than stealing the
 * highlight from another tab.
 */
export function navKeyForHref(href: string): string {
  const path = (href || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (path === '/') return 'search';
  if (path.startsWith('/shop')) return 'shop';
  if (path.startsWith('/about')) return 'profile';
  if (path.startsWith('/contact')) return 'contact';
  if (path.startsWith('/portal')) return 'portal';
  return `path:${path}`;
}

export function SiteHeader({ active }: { active: string }) {
  const [content, setContent] = useState<PageContentDocument | null>(null);
  const cart = useCart();

  useEffect(() => {
    let cancelled = false;
    void fetchPageContent('header').then((document) => {
      if (!cancelled) setContent(document);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const wordmark = contentValue(content, 'brand.wordmark', 'Drip Emporium');
  const navLinks = contentValue<NavLink[]>(content, 'nav.items', DEFAULT_NAV_LINKS);
  const ctaLabel = contentValue(content, 'cta.label', 'Contact Professional');
  const ctaHref = contentValue(content, 'cta.href', '/contact');

  return (
    <header className="lp-header">
      <div className="lp-container lp-header-inner">
        <Link href="/" className="lp-brand" aria-label={`${wordmark} home`}>
          {wordmark}
        </Link>
        <nav className="lp-nav" aria-label="Primary">
          {navLinks.map((link) => {
            const key = navKeyForHref(link.href);
            return (
              <Link
                key={`${link.href}-${link.label}`}
                className={active === key ? 'is-active' : ''}
                href={link.href}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        {/* Stays visible at every width, unlike the nav and the CTA. A basket
            a buyer cannot find is a basket they abandon, and on a phone is
            where most of them are. The count only appears once the cart has
            read localStorage, so the server HTML and the first client paint
            agree. */}
        <Link className="lp-cart-link" href="/cart" aria-label={cartLabel(cart.ready, cart.count)}>
          <CartIcon />
          {cart.ready && cart.count > 0 ? (
            <span className="lp-cart-count" aria-hidden="true">{cart.count}</span>
          ) : null}
        </Link>

        <Link className="lp-button lp-button-primary lp-header-cta" href={ctaHref}>
          {ctaLabel}
        </Link>

        {/* Replaces both the nav and the CTA below 1060px, where they are
            hidden. Without it the header had no navigation at all. */}
        <MobileNav active={active} links={navLinks} ctaLabel={ctaLabel} ctaHref={ctaHref} />
      </div>
    </header>
  );
}

function cartLabel(ready: boolean, count: number) {
  if (!ready || count === 0) return 'Cart, empty';
  return `Cart, ${count} item${count === 1 ? '' : 's'}`;
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M3 4h2.2l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.2a1.6 1.6 0 0 0 1.6-1.2L21 8H6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17.5" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}
