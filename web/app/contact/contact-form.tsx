"use client";

/**
 * Just the form: the only genuinely interactive part of /contact. Split out
 * of what was ContactClient so the rest of the page (headings, agent card,
 * highlights -- all CMS content) can be server-rendered with real data from
 * the first paint instead of starting blank and re-rendering once a
 * useEffect fetch resolves, which produced a structural server/client
 * mismatch (a whole conditional section appearing only after hydration) and
 * threw real React hydration errors on every load.
 */

import { FormEvent, useState } from 'react';
import { PhoneInput } from '../components/phone-input';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');

export function ContactForm({ phone, email }: { phone: string; email: string }) {
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });

  const submitLabel =
    submitState === 'sending' ? 'Transmitting...' : submitState === 'sent' ? 'Inquiry Sent' : 'Send Inquiry';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === 'sending') {
      return;
    }

    const element = event.currentTarget;
    setSubmitState('sending');
    setSubmitError(null);

    try {
      // No unitId: this is a general inquiry, so it lands unattached to a
      // project and routes to the fallback inbox.
      const response = await fetch(`${API_BASE_URL}/public/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          message: form.message,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setSubmitState('sent');
      setForm({ name: '', email: '', phone: '', message: '' });
      element.reset();
      setTimeout(() => setSubmitState('idle'), 2500);
    } catch {
      setSubmitError('We could not send your inquiry. Please try again or call us directly.');
      setSubmitState('idle');
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="lp-contact-row">
          <label>
            Full Name
            <input
              type="text"
              placeholder="John Doe"
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label>
            Email Address
            <input
              type="email"
              placeholder="john@example.com"
              required
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
        </div>
        <label>
          Phone Number
          <PhoneInput
            value={form.phone}
            onChange={(nextPhone) => setForm((prev) => ({ ...prev, phone: nextPhone }))}
          />
        </label>
        <label>
          Message
          <textarea
            rows={4}
            required
            placeholder="Do you have the Air Force 1 in EUR 43?"
            value={form.message}
            onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
          />
        </label>
        {submitError ? <p className="lp-detail-form-error">{submitError}</p> : null}
        <button
          type="submit"
          className={submitState === 'sent' ? 'is-sent' : ''}
          disabled={submitState === 'sending'}
        >
          {submitLabel}
        </button>
      </form>

      <div className="lp-contact-quick-actions">
        <a href={`tel:${phone}`}>Call Us</a>
        <a href={`mailto:${email}`}>Email Direct</a>
      </div>
    </>
  );
}
