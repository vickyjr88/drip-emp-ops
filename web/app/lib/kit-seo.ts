/**
 * Titles, descriptions, on-page copy, questions and structured data for every Kits page, in one place so the wording
 * is consistent and testable (backend/test/kits-seo.test.ts checks lengths and that nothing claims to be official).
 *
 * The line sells FAN-VERSION shirts in club colours. Copy never says "official", "authentic" or "licensed", and every
 * page carries the fan-version notice. Search terms people actually type are worked in naturally: "football jersey",
 * "football shirt", "soccer jersey", "kit", "custom name and number", "price in Kenya", "Nairobi".
 */

import type { KitClub, KitConfig, KitProduct, League } from './kits';
import { EDITION_LABELS, clubPath, kitPath, leagueByKey, leaguePath } from './kits';

const SITE_NAME = 'Drip Emporium';
const kes = (value: number) => (Number.isFinite(value) && value > 0 ? `KSh ${Math.round(value).toLocaleString('en-KE')}` : '');

const fromPrice = (kits: KitProduct[]) => {
  const prices = kits.map((k) => k.priceFrom).filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : 0;
};

/** Keeps a meta description inside what search results show, cutting at a word and never mid-sentence junk. */
export function clip(text: string, max = 158): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\-–]$/, '')}…`;
}

export type FaqItem = { question: string; answer: string };

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export function kitTitle(product: KitProduct): string {
  const price = kes(product.priceFrom);
  const suffix = price ? ` Price in Kenya: ${price}` : ' in Kenya';
  // Search results show about 60 characters. The "(Fan Version)" tag is dropped from the title when it would not fit; the
  // description and the page itself always carry it.
  const name = product.name.length + suffix.length > 66 ? product.name.replace(/\s*\(Fan Version\)/i, '') : product.name;
  return `${name}${suffix}`;
}

export function kitDescription(product: KitProduct, config: KitConfig | null): string {
  const { kit } = product;
  const price = kes(product.priceFrom);
  const person = kit.kind === 'JERSEY' && (kit.allowName || kit.allowNumber) ? ' Add your own name and number, with a choice of lettering styles.' : kit.allowArtwork ? ' Add your own text or artwork and preview it before you order.' : '';
  const stock = product.sizesInStock.length ? ` In stock in ${product.sizesInStock.join(', ')}.` : ' Made to order.';
  return clip(`${product.name}${price ? ` from ${price}` : ''} in Kenya.${person}${stock} Fan-version shirt, delivered across Kenya from Nairobi.${config ? '' : ''}`);
}

export function kitFaqs(product: KitProduct, config: KitConfig | null): FaqItem[] {
  const { kit } = product;
  const club = kit.club?.name;
  const price = kes(product.priceFrom);
  const faqs: FaqItem[] = [];
  faqs.push({
    question: `How much is the ${product.name} in Kenya?`,
    answer: price
      ? `The ${product.name} starts from ${price} at Drip Emporium. Adding a name, number or artwork is a separate print fee that you see in the design center before you pay.`
      : `Message us for today's price on the ${product.name}.`,
  });
  faqs.push({
    question: club ? `Is this the official ${club} shirt?` : 'Is this an official club shirt?',
    answer: config?.fanVersionNote || 'No. This is a fan-version shirt in club colours: an independent product, not endorsed by or affiliated with any club, league or kit maker.',
  });
  if (kit.allowName || kit.allowNumber) {
    faqs.push({
      question: `Can I put my name and number on the ${product.name}?`,
      answer: `Yes. Open the design center, type a name (up to 12 letters) and a number from 0 to 99, choose a lettering style and see the back of the shirt before you order.`,
    });
  }
  if (kit.allowArtwork) {
    faqs.push({
      question: 'Can I print my own design on it?',
      answer: 'Yes. Upload a picture or add text in the design center, place it on the shirt, and preview the front and back before you order.',
    });
  }
  faqs.push({
    question: 'How long does a personalised shirt take?',
    answer: config?.leadTime || 'Personalised shirts are made to order. Allow 5 to 7 working days for printing, plus delivery.',
  });
  faqs.push({
    question: 'Can I return a personalised shirt?',
    answer: config?.returnsNote || 'Personalised items are printed just for you, so they cannot be returned or exchanged unless they arrive faulty or misprinted.',
  });
  faqs.push({
    question: 'Do you deliver across Kenya?',
    answer: 'Yes. We deliver from Nairobi across Kenya, and you can also collect from our shop at Dubai Merchants Mall, Ronald Ngala Street.',
  });
  return faqs;
}

// ---------------------------------------------------------------------------
// Club
// ---------------------------------------------------------------------------

export function clubTitle(club: { name: string }, kits: KitProduct[]): string {
  const price = kes(fromPrice(kits));
  return price ? `${club.name} Jersey in Kenya: Fan Version from ${price}` : `${club.name} Jerseys in Kenya: Custom Name & Number`;
}

export function clubDescription(club: { name: string }, kits: KitProduct[]): string {
  const price = kes(fromPrice(kits));
  return clip(`${club.name} football jerseys in Nairobi, Kenya${price ? ` from ${price}` : ''}. Fan-version home, away and third shirts with your own name and number. Preview it, then order with delivery across Kenya.`);
}

export function clubHeading(club: { name: string }): string {
  return `${club.name} Jerseys in Kenya`;
}

export function clubIntro(club: { name: string; aliases: string[] }, kits: KitProduct[], league: League | undefined): string {
  const price = kes(fromPrice(kits));
  const nick = club.aliases.length ? ` (also searched as ${club.aliases.slice(0, 3).join(', ')})` : '';
  const editions = Array.from(new Set(kits.map((k) => EDITION_LABELS[k.kit.edition]).filter(Boolean)));
  return `${club.name}${nick} fan-version football jerseys, sold from Nairobi with delivery across Kenya. ${
    kits.length
      ? `We have ${kits.length} ${club.name} ${kits.length === 1 ? 'shirt' : 'shirts'}${editions.length ? ` (${editions.join(', ').toLowerCase()})` : ''}${price ? `, from ${price}` : ''}.`
      : `Design a ${club.name} shirt below and we will make it for you.`
  } Add your own name and number in a lettering style you choose, and see the back of the shirt before you order.${league ? ` ${club.name} play in the ${league.name}, ${league.place}.` : ''}`;
}

export function clubFaqs(club: { name: string }, kits: KitProduct[], config: KitConfig | null): FaqItem[] {
  const price = kes(fromPrice(kits));
  return [
    {
      question: `How much is a ${club.name} jersey in Kenya?`,
      answer: price
        ? `${club.name} fan-version jerseys at Drip Emporium start from ${price}. Printing a name and number is an extra fee shown in the design center before you pay.`
        : `Message us for today's price on ${club.name} jerseys, or design one in the design center.`,
    },
    {
      question: `Is this the official ${club.name} shirt?`,
      answer: config?.fanVersionNote || `No. These are fan-version shirts in ${club.name}'s colours: independent products, not endorsed by or affiliated with the club, its league or any kit maker.`,
    },
    {
      question: `Can I add my name and number to a ${club.name} jersey?`,
      answer: 'Yes. Choose a name of up to 12 letters, a number from 0 to 99 and a lettering style in the design center, and preview the back of the shirt before you order.',
    },
    {
      question: 'How long does printing take?',
      answer: config?.leadTime || 'Personalised shirts are made to order. Allow 5 to 7 working days for printing, plus delivery.',
    },
    {
      question: `Do you deliver ${club.name} jerseys outside Nairobi?`,
      answer: 'Yes. We deliver across Kenya, and you can collect from our shop at Dubai Merchants Mall, Ronald Ngala Street, Nairobi.',
    },
  ];
}

// ---------------------------------------------------------------------------
// League
// ---------------------------------------------------------------------------

export function leagueTitle(league: League, kits: KitProduct[]): string {
  return league.key === 'NATIONAL'
    ? 'National Team Football Jerseys in Kenya: Custom Name & Number'
    : league.key === 'KENYA'
      ? 'Kenyan Football Jerseys: Harambee Stars, Gor Mahia & AFC Leopards'
      : `${league.name} Jerseys in Kenya: Fan Versions with Custom Name & Number`;
}

export function leagueDescription(league: League, clubs: Array<{ name: string }>, kits: KitProduct[]): string {
  const price = kes(fromPrice(kits));
  const names = clubs.slice(0, 4).map((c) => c.name).join(', ');
  return clip(`${league.name} football jerseys in Nairobi, Kenya${price ? ` from ${price}` : ''}: ${names}${clubs.length > 4 ? ' and more' : ''}. Fan-version shirts with your own name and number, delivered across Kenya.`);
}

export function leagueIntro(league: League, clubs: Array<{ name: string }>): string {
  return `Fan-version ${league.name} football jerseys, sold from Nairobi with delivery across Kenya. Pick a club${clubs.length ? ` (${clubs.length} to choose from)` : ''}, add your own name and number in a lettering style you choose, and preview the shirt front and back before you order.`;
}

export function leagueFaqs(league: League, config: KitConfig | null): FaqItem[] {
  return [
    {
      question: `Where can I buy ${league.name} jerseys in Nairobi?`,
      answer: `At Drip Emporium, Dubai Merchants Mall, Shop F53, Ronald Ngala Street, Nairobi CBD (open every day 08:00 to 20:00), or online with delivery across Kenya.`,
    },
    {
      question: `Are these official ${league.name} shirts?`,
      answer: config?.fanVersionNote || 'No. They are fan-version shirts in club colours: independent products, not endorsed by or affiliated with any club, league or kit maker.',
    },
    {
      question: 'Can I get my name and number printed?',
      answer: 'Yes. Use the design center to type a name and number, swap the lettering style and preview the back of the shirt.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Listing and design center
// ---------------------------------------------------------------------------

export function listingTitle(config: KitConfig | null): string {
  return config?.listing.heading || 'Football Jerseys & Custom T-Shirts in Nairobi, Kenya';
}

export function listingDescription(kits: KitProduct[]): string {
  const price = kes(fromPrice(kits));
  return clip(`Fan-version football jerseys and custom printed T-shirts in Nairobi${price ? ` from ${price}` : ''}. Premier League, La Liga, Kenyan and national teams. Add your name and number, preview it, order with delivery across Kenya.`);
}

export function listingFaqs(config: KitConfig | null): FaqItem[] {
  return [
    {
      question: 'Where can I get a football jersey with my name on it in Nairobi?',
      answer: 'At Drip Emporium. Pick a club in the design center, type your name and number, choose a lettering style and order. We print it for you and deliver across Kenya, or you can collect from our shop on Ronald Ngala Street.',
    },
    {
      question: 'Are these original club jerseys?',
      answer: config?.fanVersionNote || 'No. They are fan-version shirts in club colours: independent products, not endorsed by or affiliated with any club, league or kit maker.',
    },
    {
      question: 'How much does it cost to print a name and number?',
      answer: config
        ? `Printing a name and number costs ${kes(config.pricing.nameAndNumberFeeKes)} on top of the shirt (a name alone is ${kes(config.pricing.nameFeeKes)}, a number alone ${kes(config.pricing.numberFeeKes)}). The design center shows the total before you pay.`
        : 'The design center shows the print fee before you pay.',
    },
    {
      question: 'Can I print my own design on a T-shirt?',
      answer: 'Yes. Upload a picture or add text in the design center, place it where you want it on the front or back, and preview it before you order.',
    },
    {
      question: 'How long does a custom shirt take?',
      answer: config?.leadTime || 'Personalised shirts are made to order. Allow 5 to 7 working days for printing, plus delivery.',
    },
  ];
}

export function designTitle(config: KitConfig | null): string {
  return config?.designCenter.heading ? `${config.designCenter.heading}: Name, Number & Custom Print` : 'Custom Jersey & T-Shirt Maker: Add Your Name, Number or Design';
}

export const DESIGN_DESCRIPTION = 'Design a football jersey with your name and number, or a custom T-shirt with your own text or art. Pick the lettering, preview it and order in Kenya.';

export function designFaqs(config: KitConfig | null): FaqItem[] {
  return [
    ...listingFaqs(config).slice(2),
    {
      question: 'Which lettering styles can I choose?',
      answer: 'Ten open-licence sport lettering styles, from tall condensed capitals to heavy block and retro slab. They are look-alikes for the kind of lettering clubs use, and are not any club\'s own typeface.',
    },
    {
      question: 'What can I put on a jersey?',
      answer: 'A name of up to 12 letters and a number from 0 to 99 on the back. Names and numbers are checked before printing, and we may contact you if something cannot be printed.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

export function faqSchema(faqs: FaqItem[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
  };
}

export function breadcrumbSchema(crumbs: Array<{ name: string; url: string }>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
}

export function itemListSchema(kits: KitProduct[], absolute: (path: string) => string, name: string) {
  return {
    '@type': 'ItemList',
    name,
    numberOfItems: kits.length,
    itemListElement: kits.slice(0, 50).map((k, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absolute(kitPath(k.slug)),
      name: k.name,
    })),
  };
}

export function kitProductSchema(product: KitProduct, absolute: (path: string) => string) {
  const url = absolute(kitPath(product.slug));
  return {
    '@type': 'Product',
    '@id': `${url}#product`,
    url,
    name: product.name,
    ...(product.variants[0]?.sku ? { sku: product.variants[0].sku } : {}),
    category: product.kit.kind === 'JERSEY' ? 'Football jerseys' : 'T-shirts',
    // Every kit has an image: its photos, or the drawn-shirt PNG when staff have not added any.
    image: product.imageUrls.length ? product.imageUrls : [absolute(`/kits/image/${product.slug}`)],
    ...(product.description ? { description: product.description } : {}),
    ...(product.kit.club ? { about: { '@type': 'SportsTeam', name: product.kit.club.name, sport: 'Football' } } : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'KES',
      lowPrice: product.priceFrom,
      highPrice: product.priceTo,
      offerCount: product.variants.length,
      availability: product.anyInStock ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
      url,
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': `${absolute('/')}#organization` },
    },
  };
}

export function designApplicationSchema(absolute: (path: string) => string) {
  return {
    '@type': 'WebApplication',
    name: 'Drip Emporium Jersey and T-Shirt Design Center',
    url: absolute('/design'),
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'KES' },
    provider: { '@id': `${absolute('/')}#organization` },
    featureList: ['Add a name and number to a football jersey', 'Choose lettering styles', 'Upload artwork or add text to a T-shirt', 'Preview front and back'],
  };
}

export function designHowTo(absolute: (path: string) => string) {
  return {
    '@type': 'HowTo',
    name: 'How to design a custom football jersey or T-shirt',
    totalTime: 'PT3M',
    step: [
      { '@type': 'HowToStep', position: 1, name: 'Choose your shirt', text: 'Pick a jersey and a club, or a plain T-shirt and a colour.', url: absolute('/design') },
      { '@type': 'HowToStep', position: 2, name: 'Add your name and number', text: 'Type a name of up to 12 letters and a number from 0 to 99, or add your own text or artwork.', url: absolute('/design') },
      { '@type': 'HowToStep', position: 3, name: 'Choose the lettering', text: 'Swap between lettering styles and see the shirt change.', url: absolute('/design') },
      { '@type': 'HowToStep', position: 4, name: 'Preview and order', text: 'Check the front and back, choose your size, and add it to your cart.', url: absolute('/design') },
    ],
  };
}

export { clubPath, leaguePath, leagueByKey };
export { SITE_NAME };
