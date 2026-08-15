"use client";

import { FormEvent, useState } from 'react';
import { AuthLink, AuthShell } from '../auth-form';
import { customerApi } from '../../lib/customer-auth';

export function ForgotClient() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await customerApi('/customer-portal/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the email.');
    } finally {
      setBusy(false);
    }
  }

  // The confirmation never says whether the address was found: that would let
  // anyone check which emails shop here.
  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        notice={`If an account exists for ${email}, a reset link is on its way. It expires in an hour.`}
        footer={<AuthLink href="/account/login">Back to sign in</AuthLink>}
      >
        <p className="de-auth-intro">
          Nothing arrived? Check the spam folder, or message us on WhatsApp and we will sort it out.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      intro="Enter the email you signed up with and we will send you a link to set a new one."
      error={error}
      footer={<AuthLink href="/account/login">Back to sign in</AuthLink>}
    >
      <form className="de-checkout-form" onSubmit={onSubmit}>
        <label>
          <span>Email</span>
          <input type="email" required autoComplete="email" value={email}
            onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button type="submit" className="lp-button lp-button-primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </AuthShell>
  );
}
