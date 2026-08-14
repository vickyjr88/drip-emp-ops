import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import { EliteLayout } from '../components/elite-layout';
import { ValuesCarousel } from '../components/values-carousel';
import { contentValue, fetchPageContent } from '../lib/page-content';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'about',
    path: '/about',
    title: 'About Us',
    description:
      'Drip Emporium is a Nairobi property firm handling sales, lettings and portfolio management. Meet the team and see how we work.',
    shareTitle: 'About Drip Emporium',
  });
}


// Rendered per request so CMS edits appear without a rebuild.
export const dynamic = 'force-dynamic';

const values = [
  {
    title: 'Unrivaled Expertise',
    description:
      'With decades of collective experience, our advisors possess a deep understanding of the high-end market nuances, ensuring your portfolio is managed with precision and profound local knowledge.',
  },
  {
    title: 'Global Reach',
    description:
      'Our network extends across five continents, connecting prestigious properties with ultra-high-net-worth individuals through exclusive partnerships and private networks.',
  },
  {
    title: 'Personalized Discretion',
    description:
      'We understand the importance of privacy for our elite clientele. Every transaction and consultation is handled with the utmost confidentiality and bespoke attention to detail.',
  },
];

const heritage = [
  {
    year: '2004',
    title: 'The Foundation',
    text: 'DRL began as a boutique firm dedicated to historic restoration and preservation sales.',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAGJjdLPWdqh7OMBQggC6Q1ILECvARsWufH0DZKRP7kjy4t7-xPCO3cEH2sMNP9eyTfF7hY0lqde8hTVqCUUFKcOcpVnYgsxuSJsTp8KTAF4m0fuTpDL6KolVIJkmiW2UUzR7KynMD_8gJ5cFJCaHj4j5NbJ5t9hmR1stGHMHANYRBzocCsB0KGUlYehsSxP78jtQGX4vEuzuIzKgaQIpnQeTjMmodV4VmO6wkbaAA5EOaER9H2nrAd',
  },
  {
    year: '2012',
    title: 'Global Expansion',
    text: 'Our first international hub in Geneva marked the transition to a globally recognized brokerage.',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDNTNFl5TFuNu4Y3Xy9sKT3kr-a0HTeAvwZZfpSQbdMLkaloTfA8PmwDe35creiIimItBAhGDECuSCaetH8vluFVXRgfOFe3ex9J0inpPMhj93TbohR6FtFE5Cv7u3eKo_QPUlgQ_xCyEjxFzGRsn0TqMYYmiE1pfUed1YWzpxefNyevXu2DrcwIQ8DsZANxs6dTcmZrhJcShe73aXDsFgTMGPyPJW6f1JfUKh3OlNMCPqfzyCPo5zD',
  },
  {
    year: '2024',
    title: 'Digital Mastery',
    text: 'AI-driven valuation and private virtual viewing experiences keep clients at the front of the market.',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDnEc369JFyVWGMCLaxQYmQzY4QNT6Hp9-FP3U5HIZPsOrJZiXXlLtOaVBXexrKIonTebaKNzVB7kn5eTFF_gtVssmPxc9u3z3iYFyeWe3yvYDseU2xql27x-FIB29Kzz_H5616gIBjj9kurK58J4as2EpINHJGy21wgslPaSyS12kdED6wdVHLgc47YEw5MxUXk63KJcFfI1NlNyPHdmCyMKxuOauyj27GcZGl_3KXBsFDGLMPG27J',
  },
];

const LEADERSHIP_PARAGRAPHS = [
  "Mohamed Drip Emporium brings over 20 years of unparalleled experience in the luxury real estate sector. His journey began with a vision to redefine the brokerage experience into an editorial, high-touch consultancy for the world's most discerning buyers.",
  'Under his guidance, Drip Emporium has facilitated billions in transactions, specializing in off-market assets and architectural masterpieces. His philosophy is built on the pillars of absolute integrity and a relentless pursuit of perfection.',
  'Today, Mohamed continues to lead the firm by hand-selecting each professional advisor to ensure the DRL standard of excellence is maintained across every territory we serve.',
];

const DEFAULT_LEADERSHIP_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDIKczsAPZvCfpTK2a7dZd8A1dBwkkgvQkNZNPczqilEmXoXnaBfRp1spNS6-7xJmNMLaPDo1UeSZRJd0v6i5XQJZxoEDkdq3QQMyRDg5wz1OeR4fAjsYGt8JtkeBYjMJxDG0kOR3BaOml-nvlcCa1HOlBps3nV-1zAipttAZS47r_gGFtxarhBZYL3FYIq4LQ0DPGRVU2O1wsE6OwUfohpOxcXP8ziQqmVMNdUblv0i0rAGuyEI3bf';

export default async function AboutPage() {
  const content = await fetchPageContent('about');

  const heroKicker = contentValue(content, 'hero.kicker', 'Drip Emporium');
  const heroHeading = contentValue(content, 'hero.heading', 'Who We Are');
  const heroSubheading = contentValue(
    content,
    'hero.subheading',
    'A real estate company built on trust, transparency, and a deep understanding of what home means.',
  );
  const heroImage = contentValue(content, 'hero.image', '/images/agent-shared.jpg');

  const storyHeading = contentValue(content, 'story.heading', 'Our Story');
  const storyParagraphs = contentValue<string[]>(content, 'story.paragraphs', []);
  const storyStats = contentValue<Array<{ value: string; label: string }>>(content, 'story.stats', []);

  const missionVision = contentValue<Array<{ title: string; description: string }>>(
    content,
    'missionVision.items',
    [],
  );

  const valuesKicker = contentValue(content, 'values.kicker', 'Core Values');
  const valuesHeading = contentValue(content, 'values.heading', 'Our DNA');
  const valueItems = contentValue<Array<{ title: string; description: string }>>(content, 'values.items', values);

  const teamKicker = contentValue(content, 'team.kicker', 'A focused team, accountable at every step.');
  const teamHeading = contentValue(content, 'team.heading', 'The People Behind DRL');
  const teamIntro = contentValue(content, 'team.intro', '');
  const teamItems = contentValue<
    Array<{ name: string; role: string; description: string; email?: string; image?: string }>
  >(content, 'team.items', []);

  const testimonialsKicker = contentValue(content, 'testimonials.kicker', 'What clients say about DRL.');
  const testimonialsHeading = contentValue(content, 'testimonials.heading', 'A Testament To Excellence');
  const testimonialsIntro = contentValue(content, 'testimonials.intro', '');
  const testimonialItems = contentValue<
    Array<{ quote: string; name: string; detail?: string; date?: string }>
  >(content, 'testimonials.items', []);

  const recognitionKicker = contentValue(content, 'recognition.kicker', 'Accountability you can stand behind.');
  const recognitionHeading = contentValue(content, 'recognition.heading', 'Recognition & Partners');
  const recognitionIntro = contentValue(content, 'recognition.intro', '');
  const recognitionItems = contentValue<Array<{ title: string; description: string }>>(
    content,
    'recognition.items',
    [],
  );
  const partners = contentValue<Array<{ name: string; logo?: string }>>(content, 'recognition.partners', []);

  const advantageKicker = contentValue(content, 'advantage.kicker', 'Why Choose DRL');
  const advantageHeading = contentValue(content, 'advantage.heading', 'The Drip Emporium Advantage');
  const advantageItems = contentValue<string[]>(content, 'advantage.items', []);

  const leadershipKicker = contentValue(content, 'leadership.kicker', 'Our Leadership');
  const leadershipHeading = contentValue(content, 'leadership.heading', 'Visionary Leadership for the Modern Era');
  const leadershipName = contentValue(content, 'leadership.name', 'Mohamed Drip Emporium');
  const leadershipRole = contentValue(content, 'leadership.role', 'Principal Broker & Founder');
  const leadershipImage = contentValue(content, 'leadership.image', DEFAULT_LEADERSHIP_IMAGE);
  const leadershipParagraphs = contentValue<string[]>(content, 'leadership.paragraphs', LEADERSHIP_PARAGRAPHS);

  const heritageHeading = contentValue(content, 'heritage.heading', 'Our Heritage');
  const heritageSubheading = contentValue(content, 'heritage.subheading', 'Two Decades at the Apex');
  const heritageItems = contentValue<Array<{ year: string; title: string; text: string; image?: string }>>(
    content,
    'heritage.items',
    heritage,
  );

  const ctaHeading = contentValue(content, 'cta.heading', 'Partner with Excellence');
  const ctaBody = contentValue(
    content,
    'cta.body',
    'Whether you are acquiring a legacy estate or divesting from a global portfolio, Drip Emporium provides the discretion, expertise, and results you deserve.',
  );
  const ctaPrimary = contentValue(content, 'cta.primaryLabel', 'Meet our Agents');
  const ctaSecondary = contentValue(content, 'cta.secondaryLabel', 'Contact Us');

  return (
    <EliteLayout active="profile">
      <main className="lp-main-content">
        <section className="lp-about-hero">
          <img className="lp-about-hero-image" src={heroImage} alt="Luxury skyline and architecture" />
          <div className="lp-about-hero-overlay" aria-hidden="true" />
          <div className="lp-container lp-about-hero-content">
            <p>{heroKicker}</p>
            <h1>{heroHeading}</h1>
            <span className="lp-divider" aria-hidden="true" />
            {heroSubheading ? <p className="lp-about-hero-subheading">{heroSubheading}</p> : null}
          </div>
        </section>

        {storyParagraphs.length > 0 || storyStats.length > 0 ? (
          <section className="lp-about-story">
            <div className="lp-container lp-about-story-inner">
              <div className="lp-about-story-copy">
                <h2>{storyHeading}</h2>
                <span className="lp-divider" aria-hidden="true" />
                {storyParagraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
              {storyStats.length > 0 ? (
                <div className="lp-about-stat-grid">
                  {storyStats.map((stat, index) => (
                    <div key={`${stat.label}-${index}`} className="lp-about-stat">
                      <strong>{stat.value}</strong>
                      <span>{stat.label}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {missionVision.length > 0 ? (
          <section className="lp-about-mission">
            <div className="lp-container lp-about-mission-grid">
              {missionVision.map((item, index) => (
                <article key={`${item.title}-${index}`} className="lp-about-mission-card">
                  <p className="lp-about-mission-index">{String(index + 1).padStart(2, '0')}</p>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="lp-about-values">
          <div className="lp-container">
            <div className="lp-heading-center">
              <p className="lp-about-eyebrow">{valuesKicker}</p>
              <h2>{valuesHeading}</h2>
              <span className="lp-divider" aria-hidden="true" />
            </div>
            <ValuesCarousel items={valueItems} />
          </div>
        </section>

        <section className="lp-about-leadership">
          <div className="lp-container lp-about-leadership-grid">
            <div className="lp-about-leadership-image">
              <img src={leadershipImage} alt={`Portrait of ${leadershipName}`} />
              <div className="lp-about-leadership-caption">
                <h3>{leadershipName}</h3>
                <p>{leadershipRole}</p>
              </div>
            </div>
            <div>
              <span>{leadershipKicker}</span>
              <h2>{leadershipHeading}</h2>
              {leadershipParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>

        {teamItems.length > 0 ? (
          <section className="lp-about-team">
            <div className="lp-container">
              <div className="lp-heading-center">
                <p className="lp-about-eyebrow">{teamKicker}</p>
                <h2>{teamHeading}</h2>
                <span className="lp-divider" aria-hidden="true" />
                {teamIntro ? <p className="lp-about-section-intro">{teamIntro}</p> : null}
              </div>
              <div className="lp-about-team-grid">
                {teamItems.map((member, index) => (
                  <article key={`${member.name}-${index}`} className="lp-about-team-card">
                    <div className="lp-about-team-media">
                      {member.image ? (
                        <img src={member.image} alt={member.name} loading="lazy" />
                      ) : (
                        // Initials keep the card rhythm before photos are added.
                        <div className="lp-about-team-initials" aria-hidden="true">
                          {member.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join('')}
                        </div>
                      )}
                    </div>
                    <h3>{member.name}</h3>
                    <p className="lp-about-team-role">{member.role}</p>
                    <p>{member.description}</p>
                    {member.email ? <a href={`mailto:${member.email}`}>{member.email}</a> : null}
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="lp-about-heritage">
          <div className="lp-container">
            <h2>{heritageHeading}</h2>
            <p className="lp-about-heritage-subtitle">{heritageSubheading}</p>
            <div className="lp-heritage-timeline">
              {heritageItems.map((item, index) => (
                <article key={`${item.year}-${index}`} className={`lp-heritage-row ${index % 2 === 1 ? 'is-reversed' : ''}`}>
                  <div className="lp-heritage-copy">
                    <p>{item.year}</p>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                  <div className="lp-heritage-marker" aria-hidden="true" />
                  <div className="lp-heritage-media">
                    {/* Falls back to the original stock image when the slot is empty. */}
                    <img src={item.image || heritage[index % heritage.length]?.image} alt={item.title} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {testimonialItems.length > 0 ? (
          <section className="lp-about-testimonials">
            <div className="lp-container">
              <div className="lp-heading-center">
                <p className="lp-about-eyebrow">{testimonialsKicker}</p>
                <h2>{testimonialsHeading}</h2>
                <span className="lp-divider" aria-hidden="true" />
                {testimonialsIntro ? <p className="lp-about-section-intro">{testimonialsIntro}</p> : null}
              </div>
              <div className="lp-about-testimonial-grid">
                {testimonialItems.map((testimonial, index) => (
                  <figure key={`${testimonial.name}-${index}`} className="lp-about-testimonial">
                    <blockquote>{testimonial.quote}</blockquote>
                    <figcaption>
                      <strong>{testimonial.name}</strong>
                      {testimonial.detail ? <span>{testimonial.detail}</span> : null}
                      {testimonial.date ? <span className="lp-about-testimonial-date">{testimonial.date}</span> : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {recognitionItems.length > 0 || partners.length > 0 ? (
          <section className="lp-about-recognition">
            <div className="lp-container">
              <div className="lp-heading-center">
                <p className="lp-about-eyebrow">{recognitionKicker}</p>
                <h2>{recognitionHeading}</h2>
                <span className="lp-divider" aria-hidden="true" />
                {recognitionIntro ? <p className="lp-about-section-intro">{recognitionIntro}</p> : null}
              </div>
              {recognitionItems.length > 0 ? (
                <div className="lp-about-recognition-grid">
                  {recognitionItems.map((item, index) => (
                    <article key={`${item.title}-${index}`} className="lp-about-recognition-card">
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </article>
                  ))}
                </div>
              ) : null}
              {partners.length > 0 ? (
                <div className="lp-about-partner-row">
                  {partners.map((partner, index) => (
                    <div key={`${partner.name}-${index}`} className="lp-about-partner">
                      {/* Falls back to the name as text until a logo is uploaded. */}
                      {partner.logo ? (
                        <img src={partner.logo} alt={partner.name} loading="lazy" />
                      ) : (
                        <span>{partner.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {advantageItems.length > 0 ? (
          <section className="lp-about-advantage">
            <div className="lp-container lp-about-advantage-inner">
              <div>
                <p className="lp-about-eyebrow">{advantageKicker}</p>
                <h2>{advantageHeading}</h2>
                <span className="lp-divider" aria-hidden="true" />
              </div>
              <ul className="lp-about-advantage-list">
                {advantageItems.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section className="lp-about-cta">
          <div className="lp-container">
            <h2>{ctaHeading}</h2>
            <p>{ctaBody}</p>
            <div className="lp-about-cta-actions">
              <button type="button">{ctaPrimary}</button>
              <button type="button" className="is-outline">{ctaSecondary}</button>
            </div>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
