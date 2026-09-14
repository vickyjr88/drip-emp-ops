import type { Metadata } from 'next';
import { FavoritesClient } from './favorites-client';

export const metadata: Metadata = {
  title: 'Your Favorites',
  description: 'Products you have saved for later.',
  // Personal to the signed-in shopper, nothing to rank for.
  robots: { index: false, follow: true },
};

export default function FavoritesPage() {
  return <FavoritesClient />;
}
