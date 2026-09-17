"use client";

/**
 * The cart.
 *
 * Deliberately absent until now: without a payment path a cart could only end
 * in "we will email you", which is worse than the WhatsApp handoff the shop
 * already runs on. With Paystack behind it, it earns its place — but the
 * WhatsApp route stays, because most of this shop's trade still happens there.
 *
 * Held in localStorage rather than on the server: a shopper who has not signed
 * in still expects their basket to survive a refresh, and a cart is not worth
 * an account.
 *
 * A line is a variant, not a product. Two sizes of the same shoe are two
 * lines, because that is what gets picked off the shelf.
 *
 * One exception: a line can carry a customer-typed size that isn't one of
 * the product's real variants at all ("My size isn't listed"). It has no
 * variantId -- there is nothing in the catalogue to price or reserve stock
 * against -- so it can never go through Paystack checkout. It exists in the
 * cart purely so the shopper sees it alongside everything else and so the
 * WhatsApp order (already a free-text message, not a priced API call) can
 * include it. `id` is what every line is keyed and looked up by now,
 * because a custom line has no variantId to serve that purpose; a real
 * line's id is just its variantId, so nothing about existing carts changes.
 */

import {
  ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';

const STORAGE_KEY = 'de_cart_v1';

export type CartLine = {
  id: string;
  /** Null for a custom-size line -- see the file comment above. */
  variantId: string | null;
  productSlug: string;
  name: string;
  size: string;
  sku: string;
  priceKes: number;
  imageUrl?: string | null;
  quantity: number;
  /** True only for a customer-typed size with no matching variant. */
  isCustomSize?: boolean;
};

type CartValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  /** The lines checkout can actually charge -- excludes any custom-size line. */
  payableLines: CartLine[];
  hasCustomSizeLine: boolean;
  add: (line: Omit<CartLine, 'id' | 'quantity'> & { id?: string }, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  ready: boolean;
};

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  // Nothing is written back until the first read has happened, or the initial
  // empty state would overwrite a saved cart on every page load.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setLines(JSON.parse(saved));
    } catch {
      // A corrupt cart is not worth failing the page over.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Private browsing can refuse writes; the cart still works in memory.
    }
  }, [lines, ready]);

  const add = useCallback((line: Omit<CartLine, 'id' | 'quantity'> & { id?: string }, quantity = 1) => {
    setLines((prev) => {
      // A real variant line still dedupes/merges by variantId, exactly as
      // before -- its id defaults to the variantId itself when the caller
      // does not pass one, so this lookup and the merge below both still
      // work unchanged for every existing call site.
      const id = line.id ?? line.variantId ?? undefined;
      const existing = id ? prev.find((item) => item.id === id) : undefined;
      if (existing) {
        return prev.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + quantity } : item,
        );
      }
      // A custom-size line (no variantId) always gets its own fresh id --
      // two different customer-typed sizes for the same shoe are never the
      // same line, so there is nothing to merge into.
      const newId = id ?? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return [...prev, { ...line, id: newId, quantity }];
    });
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((item) => item.id !== id)
        : prev.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setLines((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const payableLines = useMemo(() => lines.filter((line) => !line.isCustomSize), [lines]);

  const value = useMemo<CartValue>(() => ({
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: lines.reduce((sum, line) => sum + line.priceKes * line.quantity, 0),
    payableLines,
    hasCustomSizeLine: lines.some((line) => line.isCustomSize),
    add,
    setQuantity,
    remove,
    clear,
    ready,
  }), [lines, payableLines, add, setQuantity, remove, clear, ready]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}
