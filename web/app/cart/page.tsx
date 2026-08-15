import type { Metadata } from 'next';
import { CartClient } from './cart-client';

export const metadata: Metadata = {
  title: 'Your Cart',
  description: 'Review your basket and check out securely by card or M-Pesa.',
  // A basket is personal and has nothing to rank for.
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return <CartClient />;
}
