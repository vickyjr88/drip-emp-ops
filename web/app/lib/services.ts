import type { ServiceIconKey } from '../components/service-icons';

/**
 * The firm's actual service lines, matching dripemporium.store/services.
 *
 * Shared by the home page teaser and the services page so the two cannot drift.
 * `icon` keys into ServiceIcon; the CMS edits titles and descriptions but not
 * icons, so the icon is resolved by position against this list.
 */
export type ServiceDefinition = {
  /** Stable id used as the anchor target and jump-nav href. */
  anchor: string;
  title: string;
  /** Short label for the jump nav, where full titles are too long. */
  navLabel: string;
  description: string;
  features: string[];
  image: string;
  icon: ServiceIconKey;
};

export const SERVICES: ServiceDefinition[] = [
  {
    anchor: 'property-sales',
    title: 'Property Sales',
    navLabel: 'Property Sales',
    icon: 'sales',
    description:
      "Looking to buy a home or investment property in Nairobi? We offer a curated selection of apartments, houses, townhouses, and land across the city's most sought-after locations.",
    features: ['Personalised property matching', 'Accompanied viewings', 'Market analysis', 'Legal guidance'],
    image: '',
  },
  {
    anchor: 'rentals-lettings',
    title: 'Rentals & Lettings',
    navLabel: 'Rentals',
    icon: 'rentals',
    description:
      'Whether you need a furnished apartment for a short stay or an unfurnished family home for the long term, we have options to suit every lifestyle.',
    features: ['Verified listings', 'Lease negotiation', 'Move-in coordination', 'Tenant support'],
    image: '',
  },
  {
    anchor: 'property-advisory',
    title: 'Property Advisory & Consultation',
    navLabel: 'Advisory',
    icon: 'advisory',
    description:
      "Not sure where to invest? Our advisory team offers data-driven insights on Nairobi's property market to help you make smart decisions.",
    features: ['Neighbourhood analysis', 'Yield projections', 'Valuations', 'Consultation sessions'],
    image: '',
  },
  {
    anchor: 'diaspora-investment',
    title: 'Diaspora Investment Services',
    navLabel: 'Diaspora',
    icon: 'diaspora',
    description:
      'For clients living abroad, investing in Nairobi property has never been easier. We handle everything remotely so you can build your portfolio from anywhere.',
    features: ['Virtual tours', 'Transaction management', 'Progress updates', 'Remote support'],
    image: '',
  },
  {
    anchor: 'property-management',
    title: 'Property Management',
    navLabel: 'Management',
    icon: 'management',
    description:
      "Own a property in Nairobi but don't have time to manage it? Let us handle tenant placement, rent collection, and property maintenance on your behalf.",
    features: ['Tenant screening', 'Rent collection', 'Maintenance', 'Lease renewal'],
    image: '',
  },
];

/**
 * Builds a URL-safe anchor from a title, for cards added through the CMS that
 * have no anchor of their own. Falling back to the index keeps the id stable
 * and unique even when a title is empty or non-latin.
 */
export function anchorFor(service: { anchor?: string; title?: string }, index: number): string {
  if (service.anchor) return service.anchor;
  const slug = (service.title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `service-${index + 1}`;
}

/**
 * The home page shows a teaser rather than the full list; the services page
 * carries all five.
 */
export const HOME_SERVICES = SERVICES.slice(0, 3);

/** Falls back to the first icon so a CMS-added card still renders one. */
export function iconForIndex(index: number): ServiceIconKey {
  return SERVICES[index]?.icon ?? SERVICES[0].icon;
}
