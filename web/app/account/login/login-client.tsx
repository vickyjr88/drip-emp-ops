"use client";

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLink, AuthShell } from '../auth-form';
import { useCustomerAuth } from '../../lib/customer-auth';

export function LoginClient() {
  const auth = useCustomerAuth();
  const router = useRouter();
  const params = useSearchParams();
  // Where to land afterwards. Checkout sends people here and wants them back.
  const next = params.get('next') || '/account';

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.ready && auth.customer) router.replace(next);
  }, [auth.ready, auth.customer, next, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.login(form.email, form.password);
      router.replace(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign you in.');
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      intro="Track your orders and check out faster."
      error={error}
      footer={
        <>
          <span>New here? <AuthLink href={`/account/signup?next=${encodeURIComponent(next)}`}>Create an account</AuthLink></span>
          <AuthLink href="/account/forgot">Forgot your password?</AuthLink>
        </>
      }
    >
      <form className="de-checkout-form" onSubmit={onSubmit}>
        <label>
          <span>Email</span>
          <input type="email" required autoComplete="email" value={form.email}
            onChange={(event) => setForm((p) => ({ ...p, email: event.target.value }))} />
        </label>
        <label>
          <span>Password</span>
          <input type="password" required autoComplete="current-password" value={form.password}
            onChange={(event) => setForm((p) => ({ ...p, password: event.target.value }))} />
        </label>
        <button type="submit" className="lp-button lp-button-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
