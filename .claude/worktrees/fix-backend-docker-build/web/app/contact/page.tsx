"use client";

import { FormEvent, useState } from 'react';
import { EliteLayout } from '../components/elite-layout';

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

export default function ContactPage() {
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const submitLabel =
    submitState === 'sending' ? 'Transmitting...' : submitState === 'sent' ? 'Inquiry Sent' : 'Send Inquiry';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitState === 'sending') {
      return;
    }

    setSubmitState('sending');

    setTimeout(() => {
      setSubmitState('sent');
      setTimeout(() => {
        setSubmitState('idle');
        event.currentTarget.reset();
      }, 2200);
    }, 1200);
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
              alt="Mohamed Dirrir"
            />
          </div>
          <h2>Mohamed Dirrir</h2>
          <p>Principal Consultant</p>
        </section>

        <section className="lp-container lp-contact-grid">
          <article className="lp-contact-form-card">
            <h2>Send an Inquiry</h2>
            <form onSubmit={handleSubmit}>
              <div className="lp-contact-row">
                <label>
                  Full Name
                  <input type="text" placeholder="John Doe" />
                </label>
                <label>
                  Email Address
                  <input type="email" placeholder="john@example.com" />
                </label>
              </div>
              <label>
                Phone Number
                <input type="tel" placeholder="+1 (234) 567-8900" />
              </label>
              <label>
                Message
                <textarea rows={4} placeholder="I am interested in exploring property acquisitions..." />
              </label>
              <button
                type="submit"
                className={submitState === 'sent' ? 'is-sent' : ''}
                disabled={submitState === 'sending'}
              >
                {submitLabel}
              </button>
            </form>

            <div className="lp-contact-quick-actions">
              <a href="tel:+12345678900">Call Agent</a>
              <a href="mailto:direct@dirrir.com">Email Direct</a>
            </div>
          </article>

          <aside className="lp-contact-aside">
            <article className="lp-contact-agent-card">
              <img
                src="/images/agent-shared.jpg"
                alt="Mohamed Dirrir"
              />
              <h3>Mohamed Dirrir</h3>
              <p>Principal Broker</p>
              <div className="lp-contact-agent-lines">
                <a href="tel:+12345678900">
                  <span className="lp-contact-line-icon">
                    <PhoneIcon />
                  </span>
                  <span>+1 (234) 567-8900</span>
                </a>
                <a href="mailto:direct@dirrir.com">
                  <span className="lp-contact-line-icon">
                    <MailIcon />
                  </span>
                  <span>direct@dirrir.com</span>
                </a>
                <p>
                  <span className="lp-contact-line-icon">
                    <PinIcon />
                  </span>
                  <span>Luxury Real Estate HQ, New York</span>
                </p>
              </div>
            </article>

            <article className="lp-contact-why">
              <h3>Why Choose DRL?</h3>
              <ul>
                <li>
                  <strong>Personalized Service</strong>
                  <span>Every portfolio is managed with extreme attention to individual goals and lifestyle aspirations.</span>
                </li>
                <li>
                  <strong>Market Expertise</strong>
                  <span>Over two decades of experience navigating high-end property acquisitions and investment scaling.</span>
                </li>
                <li>
                  <strong>Exclusive Inventory</strong>
                  <span>Gain access to off-market listings and private estate auctions globally.</span>
                </li>
              </ul>
            </article>
          </aside>
        </section>

        <section className="lp-contact-map" aria-label="Map section">
          <div>
            <span>Dirrir HQ</span>
            <p>Manhattan, New York</p>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
