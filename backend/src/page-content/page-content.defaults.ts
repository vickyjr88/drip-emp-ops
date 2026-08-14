/**
 * Built-in copy for the public marketing pages.
 *
 * These mirror what the pages shipped with, and act as the fallback whenever a
 * page has never been edited or a stored document is missing fields. Keeping
 * them here (rather than only in the React components) means the API can always
 * answer with a complete document, so the CMS form and the public site agree on
 * the shape of a page.
 *
 * `imageSlots` drives the editor's size guidance -- it is advisory only and is
 * not enforced on upload, since an editor may knowingly use a different crop.
 */

export type ImageSlot = {
  key: string;
  label: string;
  recommendedWidth: number;
  recommendedHeight: number;
  note?: string;
};

// "footer" is not a page, but it is site-wide editable copy and fits the same
// slug-keyed document model, so it rides along rather than needing its own
// table and endpoints.
export const PAGE_SLUGS = ['home', 'about', 'services', 'areas', 'contact', 'terms', 'privacy', 'header', 'footer', 'seo'] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

export const PAGE_LABELS: Record<PageSlug, string> = {
  home: 'Home',
  about: 'About',
  services: 'Services',
  areas: 'Areas',
  contact: 'Contact',
  terms: 'Terms',
  privacy: 'Privacy',
  header: 'Header',
  footer: 'Footer',
  seo: 'SEO',
};

export const IMAGE_SLOTS: Record<PageSlug, ImageSlot[]> = {
  home: [
    {
      key: 'about.image',
      label: 'About section image',
      recommendedWidth: 1200,
      recommendedHeight: 900,
      note: 'Sits beside the "Real Estate Done Right" copy.',
    },
    {
      key: 'hero.backgroundImage',
      label: 'Hero background',
      recommendedWidth: 1920,
      recommendedHeight: 1080,
      note: 'Full-bleed banner behind the search bar. Landscape works best.',
    },
  ],
  about: [
    {
      key: 'hero.image',
      label: 'Hero background',
      recommendedWidth: 1920,
      recommendedHeight: 1080,
    },
    {
      key: 'leadership.image',
      label: 'Leadership portrait',
      recommendedWidth: 800,
      recommendedHeight: 1000,
      note: 'Portrait orientation; the frame is taller than it is wide.',
    },
    {
      key: 'heritage.items[].image',
      label: 'Heritage entry',
      recommendedWidth: 800,
      recommendedHeight: 600,
    },
    {
      key: 'team.items[].image',
      label: 'Team member',
      recommendedWidth: 600,
      recommendedHeight: 600,
      note: 'Square crop; faces sit best centred.',
    },
    {
      key: 'recognition.partners[].logo',
      label: 'Partner logo',
      recommendedWidth: 400,
      recommendedHeight: 160,
      note: 'Wide transparent PNG. The partner name shows as text until a logo is uploaded.',
    },
  ],
  areas: [
    {
      key: 'hero.image',
      label: 'Hero background',
      recommendedWidth: 1920,
      recommendedHeight: 1080,
    },
  ],
  terms: [],
  privacy: [],
  header: [],
  footer: [],
  seo: [],
  services: [
    {
      key: 'services.items[].image',
      label: 'Service section',
      recommendedWidth: 1200,
      recommendedHeight: 900,
      note: 'Landscape 4:3, shown beside each service. Leave blank for an icon placeholder.',
    },
  ],
  contact: [
    {
      key: 'agent.image',
      label: 'Agent photo',
      recommendedWidth: 800,
      recommendedHeight: 800,
      note: 'Square. Shown in the card beside the inquiry form.',
    },
  ],
};

export const DEFAULT_CONTENT: Record<PageSlug, Record<string, any>> = {
  home: {
    hero: {
      heading: 'Quality Affordable\nSneakers & Streetwear',
      subheading:
        'Curating the finest sneakers and premium streetwear. Define your look, own your style, stay fresh.',
      backgroundImage: '',
    },
    services: {
      heading: 'Shop By Category',
      subheading: 'Sneakers, boots, casuals, sandals, officials and cleaning agents — all in one place.',
      // A teaser of the full list on /services, kept in the same order so the
      // icons (resolved by position) line up across both pages.
      items: [
        {
          title: 'Sneakers',
          description:
            'Nike, Adidas, Jordan and Puma. Air Force 1, Air Max, Samba, Campus and more, in UK 6 to UK 10.',
        },
        {
          title: 'Boots & Officials',
          description:
            'Smart leather officials and hard-wearing boots for work, weather and everything in between.',
        },
        {
          title: 'Casuals & Sandals',
          description:
            'Everyday wear that goes with anything, plus sandals for when the day is too hot for laces.',
        },
      ],
    },
    featured: {
      heading: 'Featured Residences',
      subheading: 'A curated selection of our most prestigious available properties.',
    },
    // Follows the old site: a featured property carries the hero rather than an
    // empty search form, so a visitor sees real stock before being asked to
    // describe what they want. The search bar stays underneath it.
    heroFeature: {
      enabled: true,
      eyebrow: 'Featured residence',
      ctaLabel: 'View this home',
      browseLabel: 'Browse Properties',
      talkLabel: 'Talk to an Agent',
    },
    // The credibility block the old site carries and this page lacked: who
    // stands behind the firm, before any ask.
    about: {
      heading: 'Quality Affordable Sneakers & Streetwear in Kenya',
      body:
        'Drip Emporium curates the finest sneakers and premium streetwear from Nike, Adidas, Jordan, Puma, Calvin Klein, Tommy Hilfiger and BOSS. Find us at Dubai Merchants Mall shop F53 and Palms Mall shop BF75 on Ronald Ngala Street, Nairobi, or order online. Free nationwide delivery on orders over KES 15,000.',
      image: '',
      linkLabel: 'More About Us',
      linkHref: '/about',
    },
    // Deliberately not auto-counted. The portal has one sold unit and no
    // completed project, so a live count would read "1 property sold" and do
    // more harm than the section is worth. These are typed in, and the whole
    // band hides while they are blank rather than rendering the old site's
    // "0+ Happy Clients".
    stats: {
      enabled: false,
      items: [
        { value: '', label: 'Happy Clients' },
        { value: '', label: 'Properties Sold' },
        { value: '', label: 'Years of Excellence' },
        { value: '', label: 'Star Service' },
      ],
    },
    // Completed work. Hidden until at least one project is marked delivered,
    // for the same reason as the stats.
    portfolio: {
      enabled: false,
      eyebrow: 'Delivered portfolio',
      heading: 'Completed projects — proof of how we build and hand over.',
      subheading:
        'Use this as your reference track record. When you are ready to deploy capital, the ongoing section above is where current allocation opens.',
      items: [],
    },
    // Needs an actual document; the section stays hidden until one is attached
    // rather than advertising a download that 404s.
    report: {
      enabled: false,
      eyebrow: 'Market intelligence',
      heading: 'The East Africa Property Report',
      body:
        "Access our quarterly insights on Nairobi's highest performing real estate sectors. Make your next move with total clarity.",
      releaseLabel: 'Latest release',
      releaseTitle: '',
      fileUrl: '',
      ctaLabel: 'Download Report',
    },
    cta: {
      heading: 'Ready to Find Your Elite Residence?',
      body: 'Our dedicated professionals are standing by to guide you through every step of your real estate journey.',
      primaryLabel: 'Contact Our Experts',
      secondaryLabel: 'Book a Consultation',
      // The secondary button pointed at "#" and did nothing when clicked.
      secondaryHref: '/contact',
    },
  },

  about: {
    hero: {
      kicker: 'Drip Emporium',
      heading: 'Who We Are',
      subheading:
        'A real estate company built on trust, transparency, and a deep understanding of what home means.',
      image: '/images/agent-shared.jpg',
    },
    story: {
      heading: 'Our Story',
      paragraphs: [
        'Drip Emporium is a Nairobi-based real estate advisory and brokerage brand operating under Rabat Properties Limited. Our work is guided by verified listings, transparent process, and long-term value for both homeowners and investors.',
        'Beyond sourcing homes, we provide an integrated support journey across property search, advisory, negotiation, and transaction guidance. This end-to-end approach gives clients one clear, reliable partner from first shortlist to final handover.',
      ],
      stats: [
        { value: '100+', label: 'Happy Clients' },
        { value: '50+', label: 'Properties Sold' },
        { value: '5+', label: 'Prime Nairobi Areas' },
        { value: '01', label: 'Trusted Partner' },
      ],
    },
    missionVision: {
      items: [
        {
          title: 'Mission',
          description:
            'To provide reliable, transparent, and culturally attuned real estate services that help individuals and families find properties they can call home — and investments they can count on.',
        },
        {
          title: 'Vision',
          description:
            "To become East Africa's most trusted real estate partner for diaspora and local investors alike, known for integrity, quality service, and deep community ties.",
        },
      ],
    },
    values: {
      kicker: 'Core Values',
      heading: 'Our DNA',
      items: [
        {
          title: 'Transparency',
          description: 'No hidden fees, no surprises. We keep you informed at every stage.',
        },
        {
          title: 'Integrity',
          description: "We represent properties honestly and act in our clients' best interests.",
        },
        {
          title: 'Community',
          description:
            'We serve a diverse clientele and take pride in connecting people to communities where they belong.',
        },
        {
          title: 'Excellence',
          description: 'From property selection to after-sales support, we deliver a premium experience.',
        },
      ],
    },
    leadership: {
      kicker: 'Our Leadership',
      heading: 'Visionary Leadership for the Modern Era',
      name: 'Mohamed Drip Emporium',
      role: 'Principal Broker & Founder',
      image: '',
      paragraphs: [
        "Mohamed Drip Emporium brings over 20 years of unparalleled experience in the luxury real estate sector. His journey began with a vision to redefine the brokerage experience into an editorial, high-touch consultancy for the world's most discerning buyers.",
        'Under his guidance, Drip Emporium has facilitated billions in transactions, specializing in off-market assets and architectural masterpieces. His philosophy is built on the pillars of absolute integrity and a relentless pursuit of perfection.',
        'Today, Mohamed continues to lead the firm by hand-selecting each professional advisor to ensure the DRL standard of excellence is maintained across every territory we serve.',
      ],
    },
    heritage: {
      heading: 'Our Heritage',
      subheading: 'Two Decades at the Apex',
      items: [
        {
          year: '2004',
          title: 'The Foundation',
          text: 'DRL began as a boutique firm dedicated to historic restoration and preservation sales.',
          image: '',
        },
        {
          year: '2012',
          title: 'Global Expansion',
          text: 'Our first international hub in Geneva marked the transition to a globally recognized brokerage.',
          image: '',
        },
        {
          year: '2024',
          title: 'Digital Mastery',
          text: 'AI-driven valuation and private virtual viewing experiences keep clients at the front of the market.',
          image: '',
        },
      ],
    },
    team: {
      kicker: 'A focused team, accountable at every step.',
      heading: 'The People Behind DRL',
      intro:
        'Clients work directly with senior advisors — not a call-centre queue. Every enquiry is assigned to a named point of contact from first viewing to final handover.',
      items: [
        {
          name: 'Abdulhakim Drip Emporium',
          role: 'Principal · Drip Emporium',
          description:
            'Leads client advisory for families and diaspora investors across Parklands, Kilimani, and Westlands — with a focus on transparent process and long-term value.',
          email: 'hello@dripemporium.store',
          image: '',
        },
        {
          name: 'Rabat Properties',
          role: 'Parent Group',
          description:
            'Operating backbone for sourcing, due diligence, and project delivery — with an established portfolio of Nairobi residential and mixed-use developments.',
          email: 'info@dripemporium.store',
          image: '',
        },
        {
          name: 'Advisory Desk',
          role: 'Sales & Diaspora Support',
          description:
            'Dedicated specialists for viewings, remote consultations, escrow guidance, and transaction coordination — available in local and diaspora time zones.',
          email: 'advisory@dripemporium.store',
          image: '',
        },
      ],
    },
    testimonials: {
      kicker: 'What clients say about DRL.',
      heading: 'A Testament To Excellence',
      intro:
        'A selection of recent client feedback from buyers, renters, and diaspora investors across Parklands, Kilimani, and Westlands.',
      items: [
        {
          quote:
            'Drip Emporium guided us through the home-buying process with clarity and patience. We felt supported at every step and closed with full confidence.',
          name: 'Ayaan Yusuf',
          detail: 'First-time homebuyer · Parklands, Nairobi',
          date: 'March 2026',
        },
        {
          quote:
            'What stood out was the transparency. Pricing, paperwork, and timelines were all clearly explained, which made the entire process stress-free.',
          name: 'Mohamed Hassan',
          detail: 'Investor · Rental portfolio · Kilimani, Nairobi',
          date: 'February 2026',
        },
        {
          quote:
            'As a diaspora client, I needed a trustworthy team on the ground. DRL delivered consistent updates and helped me secure the right investment property.',
          name: 'Safiya Abdullahi',
          detail: 'Diaspora client · UK · London → Westlands',
          date: 'January 2026',
        },
      ],
    },
    recognition: {
      kicker: 'Accountability you can stand behind.',
      heading: 'Recognition & Partners',
      intro:
        'Guided by a transparent operating standard, backed by an established real estate group, and aligned with reputable financial partners across Kenya.',
      items: [
        {
          title: 'Trusted Advisory',
          description: 'Recognised for transparent process across diaspora and local clients.',
        },
        {
          title: 'Verified Listings',
          description: 'Every listing inspected and documented before reaching clients.',
        },
        {
          title: 'Rabat Group',
          description: 'Operating under Rabat Properties Limited — established Nairobi developer.',
        },
        {
          title: '5-Star Service',
          description: 'Consistent feedback from buyers, renters, and investor clients.',
        },
      ],
      // Logos are CMS-uploaded rather than hotlinked: third-party brand assets
      // are not ours to serve from another site, and remote URLs rot. The name
      // renders as styled text until a logo is uploaded.
      partners: [
        { name: 'Rabat Properties', logo: '' },
        { name: 'Housing Finance Kenya', logo: '' },
        { name: 'KCB Mortgage', logo: '' },
        { name: 'Stanbic Bank', logo: '' },
        { name: 'Hass Consult Index', logo: '' },
        { name: 'Knight Frank KE', logo: '' },
      ],
    },
    advantage: {
      kicker: 'Why Choose DRL',
      heading: 'The Drip Emporium Advantage',
      items: [
        'Local expertise across Parklands, Kilimani, Westlands, Lavington, and more.',
        'Clear communication and transparent documentation at every stage.',
        'Dedicated diaspora support — virtual viewings, secure transactions, and remote advisory.',
        'Verified listings only — every property is inspected before it reaches you.',
        'End-to-end support from property search through to move-in day.',
      ],
    },
    cta: {
      heading: 'Partner with Excellence',
      body: 'Whether you are acquiring a legacy estate or divesting from a global portfolio, Drip Emporium provides the discretion, expertise, and results you deserve.',
      primaryLabel: 'Meet our Agents',
      secondaryLabel: 'Contact Us',
    },
  },

  services: {
    hero: {
      kicker: 'Drip Emporium',
      heading: 'What We Do',
      intro:
        "Comprehensive real estate services tailored to your needs — whether you're buying, renting, selling, or investing.",
    },
    services: {
      // Each item renders as a full-width section with its own image and gets
      // an entry in the page's jump nav, keyed by `anchor`.
      items: [
        {
          anchor: 'property-sales',
          title: 'Property Sales',
          navLabel: 'Property Sales',
          description:
            "Looking to buy a home or investment property in Nairobi? We offer a curated selection of apartments, houses, townhouses, and land across the city's most sought-after locations.",
          features: ['Personalised property matching', 'Accompanied viewings', 'Market analysis', 'Legal guidance'],
          image: '',
        },
        {
          anchor: 'rentals-lettings',
          title: 'Rentals & Lettings',
          navLabel: 'Rentals',
          description:
            'Whether you need a furnished apartment for a short stay or an unfurnished family home for the long term, we have options to suit every lifestyle.',
          features: ['Verified listings', 'Lease negotiation', 'Move-in coordination', 'Tenant support'],
          image: '',
        },
        {
          anchor: 'property-advisory',
          title: 'Property Advisory & Consultation',
          navLabel: 'Advisory',
          description:
            "Not sure where to invest? Our advisory team offers data-driven insights on Nairobi's property market to help you make smart decisions.",
          features: ['Neighbourhood analysis', 'Yield projections', 'Valuations', 'Consultation sessions'],
          image: '',
        },
        {
          anchor: 'diaspora-investment',
          title: 'Diaspora Investment Services',
          navLabel: 'Diaspora',
          description:
            'For clients living abroad, investing in Nairobi property has never been easier. We handle everything remotely so you can build your portfolio from anywhere.',
          features: ['Virtual tours', 'Transaction management', 'Progress updates', 'Remote support'],
          image: '',
        },
        {
          anchor: 'property-management',
          title: 'Property Management',
          navLabel: 'Management',
          description:
            "Own a property in Nairobi but don't have time to manage it? Let us handle tenant placement, rent collection, and property maintenance on your behalf.",
          features: ['Tenant screening', 'Rent collection', 'Maintenance', 'Lease renewal'],
          image: '',
        },
      ],
    },
    cta: {
      heading: 'Need a tailored strategy for your next move?',
      body: 'Whether you are selling, leasing, or acquiring, our team can structure the right approach around your property objectives.',
      primaryLabel: 'Contact Our Experts',
      secondaryLabel: 'Explore Listings',
    },
  },

  seo: {
    home: {
      title: '',
      description:
        'Quality affordable sneakers and streetwear in Nairobi. Nike, Adidas, Jordan and Puma at Dubai Merchants Mall and Palms Mall, Ronald Ngala Street.',
      shareTitle: 'Drip Emporium | Quality Affordable Sneakers & Streetwear',
    },
    properties: {
      title: 'Shop All Sneakers & Streetwear',
      description:
        'Browse sneakers, boots, casuals, sandals and officials from Nike, Adidas, Jordan and Puma. Free delivery on orders over KES 15,000.',
      shareTitle: 'Shop Sneakers & Streetwear | Drip Emporium',
    },
    listings: {
      title: 'Sneakers and Streetwear in Nairobi',
      description:
        'Every pair in stock at Drip Emporium, with sizes and prices in KES.',
      shareTitle: 'Sneakers in Nairobi | Drip Emporium',
    },
    areas: {
      title: "Nairobi's Best Neighbourhoods",
      description:
        'Westlands, Kilimani, Lavington, Parklands and Kileleshwa — what makes each Nairobi neighbourhood distinct, with indicative sale and rental ranges.',
      shareTitle: "Nairobi's Best Neighbourhoods | Drip Emporium",
      shareDescription:
        "What makes each of Nairobi's most sought-after residential areas distinct, with indicative prices.",
    },
    services: {
      title: 'Services',
      description:
        'Property sales, lettings, portfolio management and construction oversight for owners and investors in Nairobi.',
      shareTitle: 'Services | Drip Emporium',
    },
    about: {
      title: 'About Us',
      description:
        'Drip Emporium curates the finest sneakers and premium streetwear. Two stores on Ronald Ngala Street, Nairobi.',
      shareTitle: 'About Drip Emporium',
    },
    terms: {
      title: 'Terms of Service',
      description: 'The terms on which the Drip Emporium website and services are offered.',
    },
    privacy: {
      title: 'Privacy Policy',
      description: 'How Drip Emporium collects, uses and protects the information you share.',
    },
    contact: {
      title: 'Contact Us',
      description:
        'Visit Drip Emporium at Dubai Merchants Mall shop F53 or Palms Mall shop BF75, Ronald Ngala Street. Open 08:00 to 20:00.',
      shareTitle: 'Contact Drip Emporium',
    },
  },

  areas: {
    hero: {
      kicker: 'Areas We Cover',
      heading: "Nairobi's Best Neighbourhoods",
      intro:
        "We specialise in Nairobi's most sought-after residential areas. Here is what makes each neighbourhood distinct, and roughly what it costs to buy or rent there.",
      image: '',
    },
    // The neighbourhoods themselves, seeded so an editor opens the Areas tab
    // and sees the six that are actually on the page rather than an empty list
    // they have to recreate. Emptying the list falls back to the copy compiled
    // into the page, so clearing it by accident does not blank the section.
    areas: {
      items: [
        {
          name: "Westlands",
          navLabel: "Westlands",
          anchor: "westlands",
          kicker: "Premium Neighbourhood",
          description: "Nairobi's commercial heart, where corporate headquarters sit beside some of the city's best restaurants and nightlife. Apartments here trade on convenience: a short commute, everything within walking distance, and rental demand that rarely softens. Popular with professionals and expatriates, and the strongest yields in the city for well-finished one and two-bedroom units.",
          highlights: [
            "Sarit Centre & Westgate",
            "Diplomatic Blue Zone",
            "Nairobi Expressway access",
            "Restaurant and nightlife strip"
          ],
          saleRange: "KES 8M – 120M",
          rentRange: "KES 60,000 – 350,000",
          filterValue: "Westlands",
          image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80",
        },
        {
          name: "Kilimani",
          navLabel: "Kilimani",
          anchor: "kilimani",
          kicker: "Premium Neighbourhood",
          description: "Leafy streets that have absorbed more new apartment stock than anywhere else in Nairobi, and still the first place many buyers look. Central without being in the CBD, well served by schools and clinics, and close enough to Yaya Centre and the Kilimani strip that residents rarely need to drive. Good depth of supply means real choice on layout and finish.",
          highlights: [
            "Yaya Centre",
            "Kilimani schools & clinics",
            "Argwings Kodhek corridor",
            "Short drive to the CBD"
          ],
          saleRange: "KES 6M – 90M",
          rentRange: "KES 45,000 – 250,000",
          filterValue: "Kilimani",
          image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80",
        },
        {
          name: "Lavington",
          navLabel: "Lavington",
          anchor: "lavington",
          kicker: "Premium Neighbourhood",
          description: "Older, quieter and greener than its neighbours, with larger plots and a settled family character. Townhouses and low-rise apartments dominate rather than towers, and the schools are a large part of why people move here and then stay. Prices reflect scarcity: little new land, and owners who are in no hurry to sell.",
          highlights: [
            "Lavington Green",
            "International schools",
            "Mature tree cover",
            "Low-rise, low-density"
          ],
          saleRange: "KES 15M – 200M",
          rentRange: "KES 80,000 – 400,000",
          filterValue: "Lavington",
          image: "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=1600&q=80",
        },
        {
          name: "Parklands",
          navLabel: "Parklands",
          anchor: "parklands",
          kicker: "Established Neighbourhood",
          description: "One of the oldest residential quarters in the city and still one of the best connected, with the Aga Khan Hospital, City Park and the Westlands business district all close. A strong community feel, plenty of amenities within walking distance, and apartment stock ranging from long-established blocks to recent developments.",
          highlights: [
            "Aga Khan Hospital",
            "City Park",
            "Diverse dining",
            "Walkable amenities"
          ],
          saleRange: "KES 7M – 80M",
          rentRange: "KES 40,000 – 200,000",
          filterValue: "Parklands",
          image: "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1600&q=80",
        },
        {
          name: "Kileleshwa",
          navLabel: "Kileleshwa",
          anchor: "kileleshwa",
          kicker: "Established Neighbourhood",
          description: "Central, residential and steadily redeveloping, with new apartment blocks replacing older bungalows along Laikipia and Othaya roads. Quieter than Kilimani while being just as close to town, which suits families who want space without a long commute.",
          highlights: [
            "Laikipia Road corridor",
            "Quiet residential streets",
            "Close to Kilimani & Lavington",
            "Growing new-build supply"
          ],
          saleRange: "KES 8M – 95M",
          rentRange: "KES 50,000 – 260,000",
          filterValue: "Kileleshwa",
          image: "https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1600&q=80",
        },
        {
          name: "Other Areas",
          navLabel: "Elsewhere",
          anchor: "other-areas",
          kicker: "Wider Nairobi",
          description: "We also transact across Riverside, South B and C, Ngong Road, Eastleigh and the wider metro. If you have somewhere specific in mind that is not listed here, tell us -- coverage is broader than the neighbourhoods we profile, and off-market stock often sits outside the obvious postcodes.",
          highlights: [
            "Riverside",
            "South B & C",
            "Ngong Road",
            "Eastleigh"
          ],
          saleRange: "",
          rentRange: "",
          filterValue: "",
          image: "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=1600&q=80",
        },
      ],
    },
    cta: {
      heading: 'Not sure which neighbourhood fits?',
      body:
        'Tell us how you live — commute, schools, whether you want quiet or want to walk to dinner — and we will narrow it down.',
      primaryLabel: 'Talk to an Advisor',
      secondaryLabel: 'Browse All Properties',
    },
  },

  terms: {
    hero: {
      kicker: 'Legal',
      heading: 'Terms of Service',
      intro: 'The terms on which this website and our services are offered.',
    },
    body: {
      lastUpdated: '',
      sections: [],
    },
  },

  privacy: {
    hero: {
      kicker: 'Legal',
      heading: 'Privacy Policy',
      intro: 'How we collect, use and protect the information you share with us.',
    },
    body: {
      lastUpdated: '',
      sections: [],
    },
  },

  header: {
    brand: {
      wordmark: 'Drip Emporium',
    },
    nav: {
      items: [
        { label: 'Home', href: '/' },
        { label: 'Properties', href: '/properties' },
        { label: 'Areas', href: '/areas' },
        { label: 'Services', href: '/services' },
        { label: 'About', href: '/about' },
        { label: 'Portal', href: '/portal' },
      ],
    },
    cta: {
      label: 'Contact Professional',
      href: '/contact',
    },
    // Used by the enquiry buttons on listings and the properties index, which
    // each carried their own copy of the number before this existed.
    enquiries: {
      whatsapp: '254113206481',
      phone: '+254 113 206 481',
    },
  },

  footer: {
    brand: {
      heading: 'Drip Emporium',
      description:
        'Your professional partner in Nairobi real estate, providing verified listings, transparent process, and long-term value.',
    },
    quickLinks: {
      heading: 'Quick Links',
      items: [
        { label: 'Home', href: '/' },
        { label: 'Search Listings', href: '/listings' },
        { label: 'About Our Firm', href: '/about' },
        { label: 'Contact Agent', href: '/contact' },
        { label: 'Client Portal', href: '/portal' },
      ],
    },
    services: {
      heading: 'Services',
      items: [
        { label: 'Property Sales', href: '/services#property-sales' },
        { label: 'Rentals & Lettings', href: '/services#rentals-lettings' },
        { label: 'Property Advisory', href: '/services#property-advisory' },
        { label: 'Diaspora Investment', href: '/services#diaspora-investment' },
        { label: 'Property Management', href: '/services#property-management' },
      ],
    },
    contact: {
      heading: 'Contact Us',
      email: 'info@dripemporium.store',
      phone: '+254 113 206 481',
      address: 'Dubai Merchants Mall shop F53 and Palms Mall shop BF75, Ronald Ngala Street, Nairobi',
    },
    // Social profiles, as the old site carries them. Each is hidden while its
    // URL is blank, so an account the firm does not have never renders a link
    // to nowhere.
    social: {
      heading: 'Follow Us',
      facebook: '',
      instagram: '',
      tiktok: '',
      linkedin: '',
    },
    bottom: {
      copyright: '© 2026 Drip Emporium. All Rights Reserved.',
      links: [
        { label: 'About', href: '/about' },
        { label: 'Listings', href: '/listings' },
        { label: 'Contact', href: '/contact' },
        { label: 'Portal', href: '/portal' },
      ],
      // Kept apart from the links above: these are policy pages, and the old
      // site sets them beside the copyright rather than in with navigation.
      legalLinks: [
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms of Service', href: '/terms' },
      ],
    },
  },

  contact: {
    form: {
      heading: 'Send an Inquiry',
      intro:
        'Tell us what you are looking for and we will come back to you within one working day. Whether you are buying, letting or looking for someone to manage a property you already own, it helps to know your budget, preferred areas and timing.',
    },
    // The card beside the form. Was hardcoded in the page, including the
    // photograph, so none of it could be changed without a deploy.
    agent: {
      name: 'Mohamed Drip Emporium',
      role: 'Principal Broker',
      image: '',
    },
    details: {
      phone: '+254 113 206 481',
      email: 'direct@dripemporium.store',
      officeName: 'Dubai Merchants Mall, Shop F53',
      officeAddress: 'Dubai Merchants Mall shop F53 and Palms Mall shop BF75, Ronald Ngala Street, Nairobi',
    },
    highlights: {
      items: [
        { title: 'Personalized Service', description: 'A dedicated advisor for every enquiry.' },
        { title: 'Market Expertise', description: 'Deep local knowledge across prime districts.' },
        { title: 'Exclusive Inventory', description: 'Access to off-market and pre-release residences.' },
      ],
    },
  },
};
