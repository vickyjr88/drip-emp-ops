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
 */

import {
  ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';

const STORAGE_KEY = 'de_cart_v1';

export type CartLine = {
  variantId: string;
  productSlug: string;
  name: string;
  size: string;
  sku: string;
  priceKes: number;
  imageUrl?: string | null;
  quantity: number;
};

type CartValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
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

  const add = useCallback((line: Omit<CartLine, 'quantity'>, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((item) => item.variantId === line.variantId);
      if (existing) {
        return prev.map((item) =>
          item.variantId === line.variantId
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }
      return [...prev, { ...line, quantity }];
    });
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((item) => item.variantId !== variantId)
        : prev.map((item) => (item.variantId === variantId ? { ...item, quantity } : item)),
    );
  }, []);

  const remove = useCallback((variantId: string) => {
    setLines((prev) => prev.filter((item) => item.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartValue>(() => ({
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: lines.reduce((sum, line) => sum + line.priceKes * line.quantity, 0),
    add,
    setQuantity,
    remove,
    clear,
    ready,
  }), [lines, add, setQuantity, remove, clear, ready]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}
