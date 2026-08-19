"use client";

/**
 * Floating checkout button, beside the WhatsApp float.
 *
 * Only appears once there is something to check out -- an empty cart is
 * nothing to remind a shopper about, and the button would just be another
 * fixed element competing with WhatsApp for the same corner. Hidden on the
 * cart and checkout pages themselves for the same reason: a button pointing
 * at the page already open is not useful.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '../lib/cart';

export function CheckoutFloat() {
  const cart = useCart();
  const pathname = usePathname();

  const onCartFlow = pathname === '/cart' || pathname?.startsWith('/checkout');
  if (!cart.ready || cart.count === 0 || onCartFlow) return null;

  return (
    <Link
      className="lp-checkout-float"
      href="/cart"
      aria-label={`Checkout, ${cart.count} item${cart.count === 1 ? '' : 's'} in cart`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="9" cy="21" r="1.4" />
        <circle cx="18" cy="21" r="1.4" />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.5 3h2.4l1 4m0 0 1.7 7.2a1.5 1.5 0 0 0 1.46 1.15h7.4a1.5 1.5 0 0 0 1.46-1.15L20 8.5H5.9"
        />
      </svg>
      <span>Checkout</span>
      <span className="lp-checkout-float-count">{cart.count}</span>
    </Link>
  );
}
