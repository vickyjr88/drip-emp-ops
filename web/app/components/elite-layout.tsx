import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { WhatsAppFloat } from './whatsapp-float';

// 'none' is for pages that sit outside the primary nav -- the 404, for
// instance -- so nothing is highlighted rather than an arbitrary tab.
type NavKey = 'search' | 'shop' | 'services' | 'profile' | 'contact' | 'portal' | 'none';


export function EliteLayout({
  active,
  children,
}: {
  active: NavKey;
  children: React.ReactNode;
}) {
  return (
    <div className="lp-page">
      <SiteHeader active={active} />

      {children}

      <SiteFooter />

      <WhatsAppFloat />

    </div>
  );
}
