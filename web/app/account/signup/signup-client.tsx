"use client";

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLink, AuthShell } from '../auth-form';
import { PasswordInput } from '../../components/password-input';
import { PhoneInput } from '../../components/phone-input';
import { useCustomerAuth } from '../../lib/customer-auth';

export function SignupClient() {
  const auth = useCustomerAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/account';

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
  });
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
      await auth.signup(form);
      router.replace(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create your account.');
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create an account"
      intro="So you can track orders without messaging us. You can still buy without one."
      error={error}
      footer={<span>Already have one? <AuthLink href={`/account/login?next=${encodeURIComponent(next)}`}>Sign in</AuthLink></span>}
    >
      <form className="de-checkout-form" onSubmit={onSubmit}>
        <label>
          <span>First name</span>
          <input required autoComplete="given-name" value={form.firstName}
            onChange={(event) => setForm((p) => ({ ...p, firstName: event.target.value }))} />
        </label>
        <label>
          <span>Last name</span>
          <input required autoComplete="family-name" value={form.lastName}
            onChange={(event) => setForm((p) => ({ ...p, lastName: event.target.value }))} />
        </label>
        <label>
          <span>Email</span>
          <input type="email" required autoComplete="email" value={form.email}
            onChange={(event) => setForm((p) => ({ ...p, email: event.target.value }))} />
        </label>
        <label>
          <span>Phone</span>
          <PhoneInput required autoComplete="tel" value={form.phone}
            onChange={(phone) => setForm((p) => ({ ...p, phone }))} />
        </label>
        <label>
          <span>Password</span>
          <PasswordInput required minLength={8} autoComplete="new-password"
            placeholder="At least 8 characters" value={form.password}
            onChange={(event) => setForm((p) => ({ ...p, password: event.target.value }))} />
        </label>
        <button type="submit" className="lp-button lp-button-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
