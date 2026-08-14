import Link from 'next/link';

type NavKey = 'search' | 'listings' | 'services' | 'profile' | 'contact' | 'portal';

function navClass(active: boolean) {
  return active ? 'is-active' : '';
}

export function EliteLayout({
  active,
  children,
}: {
  active: NavKey;
  children: React.ReactNode;
}) {
  return (
    <div className="lp-page">
      <header className="lp-header">
        <div className="lp-container lp-header-inner">
          <Link href="/" className="lp-brand" aria-label="Dirrir Realtor home">
            Dirrir Realtor
          </Link>
          <nav className="lp-nav" aria-label="Primary">
            <Link className={navClass(active === 'search')} href="/">
              Home
            </Link>
            <Link className={navClass(active === 'listings')} href="/listings">
              Listings
            </Link>
            <Link className={navClass(active === 'services')} href="/services">
              Services
            </Link>
            <Link className={navClass(active === 'profile')} href="/about">
              About
            </Link>
            <Link className={navClass(active === 'portal')} href="/portal">
              Portal
            </Link>
          </nav>
          <Link className="lp-button lp-button-primary lp-header-cta" href="/contact">
            Contact Professional
          </Link>
        </div>
      </header>

      {children}

      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <section className="lp-footer-brand">
              <h3>Dirrir Realtor</h3>
              <p>
                Your professional partner in luxury real estate, providing unparalleled expertise and exclusive
                opportunities since 2004.
              </p>
            </section>

            <section>
              <h4>Quick Links</h4>
              <Link href="/">Home</Link>
              <Link href="/listings">Search Listings</Link>
              <Link href="/about">About Our Firm</Link>
              <Link href="/contact">Contact Agent</Link>
              <Link href="/portal">Client Portal</Link>
            </section>

            <section>
              <h4>Services</h4>
              <Link href="/services">Property Sales</Link>
              <Link href="/services">Elite Lettings</Link>
              <Link href="/services">Wealth Management</Link>
              <Link href="/services">Investment Advisory</Link>
            </section>

            <section>
              <h4>Contact Us</h4>
              <a href="mailto:concierge@dirrirrealtor.com">concierge@dirrirrealtor.com</a>
              <a href="tel:+15550123456">+1 (555) 012-3456</a>
              <p>500 Luxury Ave, Suite 100</p>
            </section>
          </div>

          <div className="lp-footer-bottom">
            <span>© 2024 Dirrir Realtor Limited. All Rights Reserved.</span>
            <div>
              <Link href="/about">About</Link>
              <Link href="/listings">Listings</Link>
              <Link href="/contact">Contact</Link>
              <Link href="/portal">Portal</Link>
            </div>
          </div>
        </div>
      </footer>

      <nav className="lp-mobile-nav" aria-label="Mobile navigation">
        <Link className={navClass(active === 'search')} href="/">
          Home
        </Link>
        <Link className={navClass(active === 'listings')} href="/listings">
          Listings
        </Link>
        <Link className={navClass(active === 'services')} href="/services">
          Services
        </Link>
        <Link className={navClass(active === 'profile')} href="/about">
          About
        </Link>
        <Link className={navClass(active === 'portal')} href="/portal">
          Portal
        </Link>
      </nav>
    </div>
  );
}
