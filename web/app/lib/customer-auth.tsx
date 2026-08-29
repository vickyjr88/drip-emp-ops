"use client";

/**
 * Customer sign-in for the storefront.
 *
 * Deliberately separate from the staff portal's token: they are different
 * audiences on different devices, and a customer session that could be
 * mistaken for a staff one is a way to leak the back office. The key and the
 * API prefix are both distinct, and the backend issues a token stamped
 * kind: "customer" that staff guards reject.
 *
 * Kept in localStorage rather than a cookie because the storefront reads it
 * from client components only; nothing server-rendered depends on who is
 * signed in.
 */

import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');
const TOKEN_KEY = 'de_customer_token';

export type CustomerProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  priceTier?: string;
  /** Trading name for a reseller/wholesale account. Null/absent for a
   *  retail customer or a trade account that never set one. */
  businessName?: string | null;
  /** Present only for a reseller/wholesale customer once one has been
   *  generated; absent for a retail customer. Opaque -- carried verbatim
   *  into a shared product URL's ?ref= param, never decoded client-side. */
  referralCode?: string | null;
  /** True while a submitted reseller application is awaiting staff review.
   *  Lets the account page show a status message instead of the apply form. */
  hasPendingResellerApplication?: boolean;
};

type AuthValue = {
  /** False until localStorage has been read, so nothing flashes signed-out. */
  ready: boolean;
  token: string | null;
  customer: CustomerProfile | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: {
    firstName: string; lastName: string; email: string; phone: string; password: string;
  }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

async function call<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message;
    throw new Error(message || 'Something went wrong. Try again.');
  }
  return data as T;
}

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (!saved) { setReady(true); return; }
    setToken(saved);
    // A stored token may have expired while the tab was closed; confirming it
    // against the API avoids showing a signed-in header that cannot load
    // anything.
    void call<CustomerProfile>('/customer-portal/me', { method: 'GET' }, saved)
      .then((profile) => setCustomer(profile))
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setReady(true));
  }, []);

  const adopt = useCallback((result: { access_token: string; customer: CustomerProfile }) => {
    window.localStorage.setItem(TOKEN_KEY, result.access_token);
    setToken(result.access_token);
    setCustomer(result.customer);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    adopt(await call('/customer-portal/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }));
  }, [adopt]);

  const signup = useCallback(async (input: {
    firstName: string; lastName: string; email: string; phone: string; password: string;
  }) => {
    adopt(await call('/customer-portal/signup', { method: 'POST', body: JSON.stringify(input) }));
  }, [adopt]);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setCustomer(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setCustomer(await call<CustomerProfile>('/customer-portal/me', { method: 'GET' }, token));
    } catch {
      logout();
    }
  }, [token, logout]);

  const value = useMemo<AuthValue>(
    () => ({ ready, token, customer, login, signup, logout, refresh }),
    [ready, token, customer, login, signup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCustomerAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  return context;
}

/** Shared with the account pages so they all speak to the API the same way. */
export const customerApi = call;
export const CUSTOMER_TOKEN_KEY = TOKEN_KEY;
