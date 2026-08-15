"use client";

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLink, AuthShell } from '../auth-form';
import { CUSTOMER_TOKEN_KEY, customerApi, useCustomerAuth } from '../../lib/customer-auth';

export function ResetClient() {
  const params = useSearchParams();
  const router = useRouter();
  const auth = useCustomerAuth();
  const token = params.get('token') || '';

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await customerApi<{ access_token: string }>('/customer-portal/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password: form.password }),
      });
      // Signed straight in: having just proved control of the inbox, asking
      // them to type the new password again would only lose people.
      window.localStorage.setItem(CUSTOMER_TOKEN_KEY, result.access_token);
      await auth.refresh();
      window.location.href = '/account';
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset your password.');
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        title="That link is not complete"
        intro="Reset links only work in full, straight from the email. Ask for a new one."
        footer={<AuthLink href="/account/forgot">Send a new link</AuthLink>}
      >
        <span />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      intro="Pick something you have not used elsewhere."
      error={error}
      footer={<AuthLink href="/account/login">Back to sign in</AuthLink>}
    >
      <form className="de-checkout-form" onSubmit={onSubmit}>
        <label>
          <span>New password</span>
          <input type="password" required minLength={8} autoComplete="new-password"
            placeholder="At least 8 characters" value={form.password}
            onChange={(event) => setForm((p) => ({ ...p, password: event.target.value }))} />
        </label>
        <label>
          <span>Confirm password</span>
          <input type="password" required minLength={8} autoComplete="new-password"
            value={form.confirm}
            onChange={(event) => setForm((p) => ({ ...p, confirm: event.target.value }))} />
        </label>
        <button type="submit" className="lp-button lp-button-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </AuthShell>
  );
}
