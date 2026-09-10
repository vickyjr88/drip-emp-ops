import type { Metadata } from 'next';
import Image from 'next/image';
import { seoMetadata } from '../lib/page-metadata';
import { EliteLayout } from '../components/elite-layout';
import { contentValue, fetchPageContent } from '../lib/page-content';
import { JsonLd, SITE_URL } from '../lib/site';
import { ContactForm } from './contact-form';

/**
 * Contact.
 *
 * Server-rendered with real CMS data on the first paint, matching /about
 * and /faq -- ContactClient used to be "use client" with content fetched in
 * a useEffect, so the server render always saw the code defaults and the
 * client render could show different content once the real CMS document
 * loaded. Several sections (the agent photo intro, in particular) are
 * conditional on that content, so the two renders could disagree on which
 * elements exist at all -- a structural mismatch, not just different text,
 * which is what actually threw React's hydration errors rather than just
 * warning about them. Only the form itself is genuinely interactive, so
 * only that piece (ContactForm) needs to be a client component now.
 */

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

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'contact',
    path: '/contact',
    title: 'Contact Us',
    description:
      'Get in touch with Drip Emporium about stock, sizing, orders or anything else. Phone, WhatsApp, email and shop details.',
    shareTitle: 'Contact Drip Emporium',
  });
}

// Rendered per request so CMS edits appear without a rebuild, matching
// /about and /faq.
export const dynamic = 'force-dynamic';

type Highlight = { title: string; description: string };

export default async function ContactPage() {
  const content = await fetchPageContent('contact');

  const formHeading = contentValue(content, 'form.heading', 'Send an Inquiry');
  const formIntro = contentValue(
    content,
    'form.intro',
    'Tell us what you are after and we will come back to you the same day. Naming the shoe, your size and which shop is nearest saves a round of messages.',
  );
  const agentName = contentValue(content, 'agent.name', 'Drip Emporium');
  const agentRole = contentValue(content, 'agent.role', 'Customer Care');
  const agentImage = contentValue(content, 'agent.image', '');
  const phone = contentValue(content, 'details.phone', '+254 113 206 481');
  const email = contentValue(content, 'details.email', 'info@dripemporium.store');
  const officeName = contentValue(content, 'details.officeName', 'Drip Emporium HQ');
  const officeAddress = contentValue(content, 'details.officeAddress', 'Dubai Merchants Mall shop F53, Ronald Ngala Street, Nairobi');
  const highlights = contentValue<Highlight[]>(content, 'highlights.items', [
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
      description: 'Ronald Ngala Street, open 08:00 to 20:00, and a WhatsApp line that gets answered.',
    },
  ]);

  return (
    <EliteLayout active="contact">
      {/* The physical shop, distinct from the site-wide Organization entity
          in layout.tsx (parentOrganization links the two). This is what lets
          a "sneakers near me" search or an AI answer cite an actual address,
          phone and hours rather than just the brand. Geo coordinates are
          left out rather than guessed -- an approximate pin is worse than
          none, since it actively misleads a map result. Add geo.latitude/
          geo.longitude here once the Google Business Profile has the
          confirmed pin. */}
      <JsonLd
        data={{
          '@type': 'ShoeStore',
          '@id': `${SITE_URL}/contact#store`,
          parentOrganization: { '@id': `${SITE_URL}/#organization` },
          name: officeName,
          image: agentImage || undefined,
          telephone: phone,
          email,
          address: {
            '@type': 'PostalAddress',
            streetAddress: officeAddress,
            addressLocality: 'Nairobi',
            addressCountry: 'KE',
          },
          openingHoursSpecification: {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: [
              'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
            ],
            opens: '08:00',
            closes: '20:00',
          },
          priceRange: 'KES',
        }}
      />
      <main className="lp-main-content lp-contact-main">
        <section className="lp-container lp-contact-header">
          <p>Connect with our team</p>
          <h1>Get In Touch</h1>
        </section>

        {agentImage ? (
          <section className="lp-container lp-contact-mobile-intro">
            <div>
              <Image src={agentImage} alt={agentName} width={96} height={96} style={{ objectFit: 'cover' }} />
            </div>
            <h2>{agentName}</h2>
            <p>{agentRole}</p>
          </section>
        ) : null}

        <section className="lp-container lp-contact-grid">
          <article className="lp-contact-form-card">
            <h2>{formHeading}</h2>
            {formIntro ? <p className="lp-contact-form-intro">{formIntro}</p> : null}
            <ContactForm phone={phone} email={email} />
          </article>

          <aside className="lp-contact-aside">
            <article className="lp-contact-agent-card">
              {agentImage ? (
                <Image src={agentImage} alt={agentName} width={132} height={176} style={{ objectFit: 'cover' }} />
              ) : null}
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
