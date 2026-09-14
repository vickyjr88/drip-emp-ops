"use client";

/**
 * A signed-in customer's saved products.
 *
 * Backend-only, unlike the cart: a favorite has no meaning for a guest (there
 * is nothing to sync, and no page shows it), so this context simply holds an
 * empty set and no-ops every mutation until a customer is signed in, rather
 * than falling back to local storage. The customer-portal endpoints are the
 * only source of truth -- see backend/src/customer-portal/customer-portal.service.ts.
 */

import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { customerApi, useCustomerAuth } from './customer-auth';

export type FavoriteProduct = {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  priceFrom: number | null;
};

type FavoritesValue = {
  /** False until the initial fetch (or the decision that there is nothing to
   *  fetch, for a signed-out visitor) has resolved. */
  ready: boolean;
  items: FavoriteProduct[];
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const FavoritesContext = createContext<FavoritesValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const auth = useCustomerAuth();
  const [items, setItems] = useState<FavoriteProduct[]>([]);
  const [ready, setReady] = useState(false);
  // Tracks ids with a request in flight, so a fast double-tap cannot fire
  // two opposite calls (add then remove) before the first one resolves.
  const [pending, setPending] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!auth.token) {
      setItems([]);
      return;
    }
    try {
      setItems(await customerApi<FavoriteProduct[]>('/customer-portal/favorites', { method: 'GET' }, auth.token));
    } catch {
      // Leave whatever was already loaded rather than clearing on a blip --
      // a favorites list disappearing on a flaky connection is worse than a
      // stale one.
    }
  }, [auth.token]);

  useEffect(() => {
    // Wait for auth's own localStorage read to finish so a signed-in visitor
    // is not shown an empty list for one frame before their real favorites
    // arrive.
    if (!auth.ready) return;
    void load().finally(() => setReady(true));
  }, [auth.ready, auth.token, load]);

  const isFavorite = useCallback(
    (productId: string) => items.some((item) => item.productId === productId),
    [items],
  );

  const toggle = useCallback(
    async (productId: string) => {
      if (!auth.token || pending.has(productId)) return;

      const currentlyFavorite = isFavorite(productId);
      setPending((prev) => new Set(prev).add(productId));
      // Optimistic: a favorite toggle should feel instant, and the common
      // failure mode (a dropped request) is rare enough that reverting on
      // catch is simpler than waiting on the round trip every time.
      if (currentlyFavorite) {
        setItems((prev) => prev.filter((item) => item.productId !== productId));
      }

      try {
        if (currentlyFavorite) {
          await customerApi(`/customer-portal/favorites/${productId}`, { method: 'DELETE' }, auth.token);
        } else {
          await customerApi(`/customer-portal/favorites/${productId}`, { method: 'POST' }, auth.token);
          // The POST response is just {productId, favorited}, not the full
          // card shape -- re-fetch so the new item's name/image/price are
          // available wherever the list renders (e.g. the /favorites page).
          await load();
        }
      } catch {
        // Revert the optimistic removal; a failed add is simply not
        // reflected (nothing was added to revert).
        if (currentlyFavorite) await load();
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    [auth.token, isFavorite, pending, load],
  );

  const value = useMemo<FavoritesValue>(
    () => ({ ready, items, isFavorite, toggle, refresh: load }),
    [ready, items, isFavorite, toggle, load],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used within a FavoritesProvider');
  return context;
}
