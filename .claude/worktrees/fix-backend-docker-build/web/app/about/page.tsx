import { EliteLayout } from '../components/elite-layout';

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

export default function AboutPage() {
  return (
    <EliteLayout active="profile">
      <main className="lp-main-content">
        <section className="lp-about-hero">
          <img
            className="lp-about-hero-image"
            src="/images/agent-shared.jpg"
            alt="Luxury skyline and architecture"
          />
          <div className="lp-about-hero-overlay" aria-hidden="true" />
          <div className="lp-container lp-about-hero-content">
            <p>Established 2004</p>
            <h1>A Legacy of Excellence in Luxury Real Estate.</h1>
            <span className="lp-divider" aria-hidden="true" />
          </div>
        </section>

        <section className="lp-about-values">
          <div className="lp-container lp-service-grid">
            {values.map((value) => (
              <article key={value.title} className="lp-service-card">
                <div className="lp-service-icon" aria-hidden="true" />
                <h3>{value.title}</h3>
                <p>{value.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-about-leadership">
          <div className="lp-container lp-about-leadership-grid">
            <div className="lp-about-leadership-image">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDIKczsAPZvCfpTK2a7dZd8A1dBwkkgvQkNZNPczqilEmXoXnaBfRp1spNS6-7xJmNMLaPDo1UeSZRJd0v6i5XQJZxoEDkdq3QQMyRDg5wz1OeR4fAjsYGt8JtkeBYjMJxDG0kOR3BaOml-nvlcCa1HOlBps3nV-1zAipttAZS47r_gGFtxarhBZYL3FYIq4LQ0DPGRVU2O1wsE6OwUfohpOxcXP8ziQqmVMNdUblv0i0rAGuyEI3bf"
                alt="Portrait of Mohamed Dirrir"
              />
              <div className="lp-about-leadership-caption">
                <h3>Mohamed Dirrir</h3>
                <p>Principal Broker & Founder</p>
              </div>
            </div>
            <div>
              <span>Our Leadership</span>
              <h2>Visionary Leadership for the Modern Era</h2>
              <p>
                Mohamed Dirrir brings over 20 years of unparalleled experience in the luxury real estate sector. His
                journey began with a vision to redefine the brokerage experience into an editorial, high-touch
                consultancy for the world&apos;s most discerning buyers.
              </p>
              <p>
                Under his guidance, Dirrir Realtor Limited has facilitated billions in transactions, specializing in
                off-market assets and architectural masterpieces. His philosophy is built on the pillars of absolute
                integrity and a relentless pursuit of perfection.
              </p>
              <p>
                Today, Mohamed continues to lead the firm by hand-selecting each professional advisor to ensure the DRL
                standard of excellence is maintained across every territory we serve.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-about-heritage">
          <div className="lp-container">
            <h2>Our Heritage</h2>
            <p className="lp-about-heritage-subtitle">Two Decades at the Apex</p>
            <div className="lp-heritage-timeline">
              {heritage.map((item, index) => (
                <article key={item.year} className={`lp-heritage-row ${index % 2 === 1 ? 'is-reversed' : ''}`}>
                  <div className="lp-heritage-copy">
                    <p>{item.year}</p>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                  <div className="lp-heritage-marker" aria-hidden="true" />
                  <div className="lp-heritage-media">
                    <img src={item.image} alt={item.title} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-about-cta">
          <div className="lp-container">
            <h2>Partner with Excellence</h2>
            <p>
              Whether you are acquiring a legacy estate or divesting from a global portfolio, Dirrir Realtor Limited
              provides the discretion, expertise, and results you deserve.
            </p>
            <div className="lp-about-cta-actions">
              <button type="button">Meet our Agents</button>
              <button type="button" className="is-outline">Contact Us</button>
            </div>
          </div>
        </section>
      </main>
    </EliteLayout>
  );
}
