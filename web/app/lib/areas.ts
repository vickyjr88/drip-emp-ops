/**
 * The neighbourhoods the firm covers, matching dripemporium.store/areas.
 *
 * Deliberately shaped like SERVICES in ./services.ts: a typed list with a
 * stable anchor, a short nav label and the body content, shared by the areas
 * page and anything that teases it, so the two cannot drift.
 *
 * `filterValue` is what gets appended to /properties?location=… . It is kept
 * separate from `name` because the filter matches against a project's stored
 * location, which is written as "Westlands, Nairobi" -- matching on the bare
 * neighbourhood is what makes the link work.
 */

export type AreaDefinition = {
  /** Stable id used as the anchor target and jump-nav href. */
  anchor: string;
  name: string;
  /** Short label for the jump nav. */
  navLabel: string;
  /** Shown above the name, e.g. "Premium Neighbourhood". */
  kicker: string;
  description: string;
  /** Four landmarks or draws, as the reference page lists them. */
  highlights: string[];
  /** Indicative ranges. Free text: these move, and a number implies precision. */
  saleRange?: string;
  rentRange?: string;
  image: string;
  /** Value passed to /properties?location=… */
  filterValue: string;
};

export const AREAS: AreaDefinition[] = [
  {
    anchor: 'westlands',
    name: 'Westlands',
    navLabel: 'Westlands',
    kicker: 'Premium Neighbourhood',
    description:
      "Nairobi's commercial heart, where corporate headquarters sit beside some of the city's best restaurants and nightlife. Apartments here trade on convenience: a short commute, everything within walking distance, and rental demand that rarely softens. Popular with professionals and expatriates, and the strongest yields in the city for well-finished one and two-bedroom units.",
    highlights: ['Sarit Centre & Westgate', 'Diplomatic Blue Zone', 'Nairobi Expressway access', 'Restaurant and nightlife strip'],
    saleRange: 'KES 8M – 120M',
    rentRange: 'KES 60,000 – 350,000',
    image:
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80',
    filterValue: 'Westlands',
  },
  {
    anchor: 'kilimani',
    name: 'Kilimani',
    navLabel: 'Kilimani',
    kicker: 'Premium Neighbourhood',
    description:
      'Leafy streets that have absorbed more new apartment stock than anywhere else in Nairobi, and still the first place many buyers look. Central without being in the CBD, well served by schools and clinics, and close enough to Yaya Centre and the Kilimani strip that residents rarely need to drive. Good depth of supply means real choice on layout and finish.',
    highlights: ['Yaya Centre', 'Kilimani schools & clinics', 'Argwings Kodhek corridor', 'Short drive to the CBD'],
    saleRange: 'KES 6M – 90M',
    rentRange: 'KES 45,000 – 250,000',
    image:
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80',
    filterValue: 'Kilimani',
  },
  {
    anchor: 'lavington',
    name: 'Lavington',
    navLabel: 'Lavington',
    kicker: 'Premium Neighbourhood',
    description:
      'Older, quieter and greener than its neighbours, with larger plots and a settled family character. Townhouses and low-rise apartments dominate rather than towers, and the schools are a large part of why people move here and then stay. Prices reflect scarcity: little new land, and owners who are in no hurry to sell.',
    highlights: ['Lavington Green', 'International schools', 'Mature tree cover', 'Low-rise, low-density'],
    saleRange: 'KES 15M – 200M',
    rentRange: 'KES 80,000 – 400,000',
    image:
      'https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=1600&q=80',
    filterValue: 'Lavington',
  },
  {
    anchor: 'parklands',
    name: 'Parklands',
    navLabel: 'Parklands',
    kicker: 'Established Neighbourhood',
    description:
      'One of the oldest residential quarters in the city and still one of the best connected, with the Aga Khan Hospital, City Park and the Westlands business district all close. A strong community feel, plenty of amenities within walking distance, and apartment stock ranging from long-established blocks to recent developments.',
    highlights: ['Aga Khan Hospital', 'City Park', 'Diverse dining', 'Walkable amenities'],
    saleRange: 'KES 7M – 80M',
    rentRange: 'KES 40,000 – 200,000',
    image:
      'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1600&q=80',
    filterValue: 'Parklands',
  },
  {
    anchor: 'kileleshwa',
    name: 'Kileleshwa',
    navLabel: 'Kileleshwa',
    kicker: 'Established Neighbourhood',
    description:
      'Central, residential and steadily redeveloping, with new apartment blocks replacing older bungalows along Laikipia and Othaya roads. Quieter than Kilimani while being just as close to town, which suits families who want space without a long commute.',
    highlights: ['Laikipia Road corridor', 'Quiet residential streets', 'Close to Kilimani & Lavington', 'Growing new-build supply'],
    saleRange: 'KES 8M – 95M',
    rentRange: 'KES 50,000 – 260,000',
    image:
      'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1600&q=80',
    filterValue: 'Kileleshwa',
  },
  {
    anchor: 'other-areas',
    name: 'Other Areas',
    navLabel: 'Elsewhere',
    kicker: 'Wider Nairobi',
    description:
      'We also transact across Riverside, South B and C, Ngong Road, Eastleigh and the wider metro. If you have somewhere specific in mind that is not listed here, tell us -- coverage is broader than the neighbourhoods we profile, and off-market stock often sits outside the obvious postcodes.',
    highlights: ['Riverside', 'South B & C', 'Ngong Road', 'Eastleigh'],
    image:
      'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=1600&q=80',
    filterValue: '',
  },
];

/** Mirrors anchorFor in ./services.ts. */
export function areaAnchorFor(area: { anchor?: string; name?: string }, index: number): string {
  if (area.anchor) return area.anchor;
  const slug = (area.name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `area-${index + 1}`;
}

/** Link to the properties list, filtered when the area has a filter value. */
export function propertiesHrefFor(area: AreaDefinition): string {
  return area.filterValue
    ? `/properties?location=${encodeURIComponent(area.filterValue)}`
    : '/properties';
}
