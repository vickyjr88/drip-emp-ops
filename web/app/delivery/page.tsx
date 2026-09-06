import type { Metadata } from 'next';
import { seoMetadata } from '../lib/page-metadata';
import { LegalPage } from '../components/legal-page';

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    key: 'delivery',
    path: '/delivery',
    title: 'Delivery',
    description: 'How delivery works at Drip Emporium: countrywide, arranged and costed after you order.',
  });
}

// Rendered per request so CMS edits appear without a rebuild.
export const dynamic = 'force-dynamic';

const DEFAULT_BODY = `Countrywide delivery

We deliver countrywide. Delivery is not charged at checkout because the cost depends on where the parcel is going -- place your order and we will call you to arrange delivery and confirm the cost separately.

Collection in Nairobi

If you would rather collect in person, both our Nairobi shops on Ronald Ngala Street are open for collection once your order is confirmed.

Order tracking

We will keep you updated by phone or WhatsApp from the moment your order is confirmed until it is delivered or collected. Contact us any time for a status update on an order already placed.`;

export default function DeliveryPage() {
  return (
    <LegalPage
      slug="delivery"
      defaultHeading="Delivery"
      defaultKicker="Delivery"
      defaultIntro="Countrywide delivery, arranged and confirmed with you after you order."
      defaultBody={DEFAULT_BODY}
    />
  );
}
