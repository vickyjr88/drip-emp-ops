"use client";

import { FormEvent, useEffect, useState } from 'react';
import { EliteLayout } from '../components/elite-layout';
import { PageContentDocument, contentValue, fetchPageContent } from '../lib/page-content';

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.1.36 2.28.54 3.5.54a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.4 21 3 13.6 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.22.18 2.4.54 3.5a1 1 0 0 1-.24 1l-2.2 2.3Z" fill="currentColor" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 2v.2l8 5 8-5V7H4Zm16 10V9.6l-7.46 4.66a1 1 0 0 1-1.08 0L4 9.6V17h16Z" fill="currentColor" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a6.5 6.5 0 0 1 6.5 6.5c0 4.6-4.83 9.84-5.04 10.06a2 2 0 0 1-2.92 0C10.33 18.34 5.5 13.1 5.5 8.5A6.5 6.5 0 0 1 12 2Zm0 8.8A2.3 2.3 0 1 0 12 6.2a2.3 2.3 0 0 0 0 4.6Z" fill="currentColor" />
    </svg>
  );
}

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3100').replace(/\/$/, '');

export default function ContactClient() {
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [content, setContent] = useState<PageContentDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPageContent('contact').then((document) => {
      if (!cancelled) setContent(document);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const formHeading = contentValue(content, 'form.heading', 'Send an Inquiry');
  const formIntro = contentValue(
    content,
    'form.intro',
    'Tell us what you are after and we will come back to you the same day. Naming the shoe, your size and which shop is nearest saves a round of messages.',
  );
  const agentName = contentValue(content, 'agent.name', 'Mohamed Drip Emporium');
  const agentRole = contentValue(content, 'agent.role', 'Principal Broker');
  // Falls back to the file that was hardcoded here, so the card keeps its
  // photograph until someone uploads a replacement.
  const agentImage = contentValue(content, 'agent.image', '/images/agent-shared.jpg');
  const phone = contentValue(content, 'details.phone', '+12345678900');
  const email = contentValue(content, 'details.email', 'direct@dripemporium.store');
  const officeName = contentValue(content, 'details.officeName', 'Drip Emporium HQ');
  const officeAddress = contentValue(content, 'details.officeAddress', 'Dubai Merchants Mall shop F53 and Palms Mall shop BF75, Ronald Ngala Street, Nairobi');
  const highlights = contentValue<Array<{ title: string; description: string }>>(content, 'highlights.items', [
    {
      title: 'Ask About Your Size',
      description:
        'Tell us your size and what you are after; we will say straight away whether we have it.',
    },
    {
      title: 'Market Expertise',
      description:
        'Genuine stock from Nike, Adidas, Jordan and Puma, priced so you do not have to haggle.',
    },
    {
      title: 'Exclusive Inventory',
      description: 'Two shops on Ronald Ngala Street, open 08:00 to 20:00, and a WhatsApp line that gets answered.',
    },
  ]);

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
    <EliteLayout active="contact">
      <main className="lp-main-content lp-contact-main">
        <section className="lp-container lp-contact-header">
          <p>Connect with our team</p>
          <h1>Contact Agent</h1>
        </section>

        <section className="lp-container lp-contact-mobile-intro">
          <div>
            <img
              src="/images/agent-shared.jpg"
              alt="Mohamed Drip Emporium"
            />
          </div>
          <h2>Mohamed Drip Emporium</h2>
          <p>Principal Consultant</p>
        </section>

        <section className="lp-container lp-contact-grid">
          <article className="lp-contact-form-card">
            <h2>{formHeading}</h2>
            {formIntro ? <p className="lp-contact-form-intro">{formIntro}</p> : null}
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
                <input
                  type="tel"
                  placeholder="+1 (234) 567-8900"
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
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
              <a href={`tel:${phone}`}>Call Agent</a>
              <a href={`mailto:${email}`}>Email Direct</a>
            </div>
          </article>

          <aside className="lp-contact-aside">
            <article className="lp-contact-agent-card">
              <img src={agentImage} alt={agentName} />
              <h3>{agentName}</h3>
              <p>{agentRole}</p>
              <div className="lp-contact-agent-lines">
                <a href={`tel:${phone}`}>
                  <span className="lp-contact-line-icon">
                    <PhoneIcon />
                  </span>
                  <span>{phone}</span>
                </a>
                <a href={`mailto:${email}`}>
                  <span className="lp-contact-line-icon">
                    <MailIcon />
                  </span>
                  <span>{email}</span>
                </a>
                <p>
                  <span className="lp-contact-line-icon">
                    <PinIcon />
                  </span>
                  <span>{officeAddress}</span>
                </p>
              </div>
            </article>

            <article className="lp-contact-why">
              <h3>Why Shop With Us?</h3>
              <ul>
                {highlights.map((highlight, index) => (
                  <li key={`${highlight.title}-${index}`}>
                    <strong>{highlight.title}</strong>
                    <span>{highlight.description}</span>
                  </li>
                ))}
              </ul>
            </article>
          </aside>
        </section>

        <section className="lp-contact-map" aria-label="Map section">
          <div>
            <span>{officeName}</span>
            <p>{officeAddress}</p>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
