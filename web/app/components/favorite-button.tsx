"use client";

/**
 * Save a product for later. A signed-out tap sends the shopper to sign in
 * rather than silently doing nothing -- favorites has no local/guest mode
 * (see lib/favorites.tsx), so there is no other honest response to the tap.
 */

import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '../lib/customer-auth';
import { useFavorites } from '../lib/favorites';

type FavoriteButtonProps = {
  productId: string;
  className?: string;
  /** Icon-only, for tight spaces like a card overlay -- matches ShareButton's
   *  own `compact` convention so the two sit together consistently. */
  compact?: boolean;
};

export function FavoriteButton({ productId, className, compact }: FavoriteButtonProps) {
  const auth = useCustomerAuth();
  const favorites = useFavorites();
  const router = useRouter();
  const active = favorites.isFavorite(productId);

  function onClick(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (!auth.token) {
      router.push('/account/login');
      return;
    }
    void favorites.toggle(productId);
  }

  return (
    <button
      type="button"
      className={`de-favorite-btn${compact ? ' is-compact' : ''}${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={active ? 'Remove from favorites' : 'Save to favorites'}
      title={active ? 'Remove from favorites' : 'Save to favorites'}
      aria-pressed={active}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
        <path d="M12 21s-7.5-4.6-10-9.1C.5 8.6 2 5 5.6 5c2 0 3.4 1 4.4 2.4C11 6 12.4 5 14.4 5 18 5 19.5 8.6 22 11.9 19.5 16.4 12 21 12 21z" strokeLinejoin="round" />
      </svg>
      {!compact ? <span className="de-favorite-label">{active ? 'Saved' : 'Save'}</span> : null}
    </button>
  );
}
