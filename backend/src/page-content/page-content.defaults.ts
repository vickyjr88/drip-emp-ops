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
export const PAGE_SLUGS = ['home', 'about', 'contact', 'terms', 'privacy', 'header', 'footer', 'seo'] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

export const PAGE_LABELS: Record<PageSlug, string> = {
  home: 'Home',
  about: 'About',
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
  terms: [],
  privacy: [],
  header: [],
  footer: [],
  seo: [],
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
      intro:
        'A Nairobi sneaker and streetwear shop, trading from two stores on Ronald Ngala Street.',
      image: '',
    },
    story: {
      kicker: 'Our Story',
      heading: 'Built on the Right Pair',
      paragraphs: [
        'Drip Emporium started with a simple frustration: finding a genuine pair in your size, at a price that made sense, without trekking across town for it.',
        'We stock sneakers, boots, casuals, sandals and officials from Nike, Adidas, Jordan, Puma, Calvin Klein, Tommy Hilfiger and BOSS. Everything on the shelf is what it says it is, priced so you do not have to negotiate to feel fairly treated.',
        'Two shops, EUR 36 to 46, and a WhatsApp line that gets answered. If we do not have your size in one shop, we will tell you whether the other one does.',
      ],
    },
    values: {
      kicker: 'What We Stand For',
      heading: 'How We Trade',
      items: [
        {
          title: 'Genuine Stock',
          description:
            'What is on the shelf is what it claims to be. No stories about why this pair is different.',
        },
        {
          title: 'Straight Pricing',
          description:
            'Marked prices you can trust, and room to talk when a deal makes sense for both of us.',
        },
        {
          title: 'Try Before You Pay',
          description:
            'Walk in, try the pair on, decide then. Nobody buys shoes they have not put on.',
        },
        {
          title: 'We Answer',
          description:
            'WhatsApp and phone during shop hours, 08:00 to 20:00. Asking about a size should not take a day.',
        },
      ],
    },
    cta: {
      heading: 'Come and try a pair on',
      body:
        'Dubai Merchants Mall shop F53 and Palms Mall shop BF75, Ronald Ngala Street. Open 08:00 to 20:00.',
      primaryLabel: 'Get Directions',
      secondaryLabel: 'Shop Online',
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
        { label: 'Shop', href: '/shop' },
        { label: 'About', href: '/about' },
        { label: 'Contact', href: '/contact' },
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
        { label: 'Shop All', href: '/shop' },
        { label: 'About Us', href: '/about' },
        { label: 'Contact', href: '/contact' },
        { label: 'Staff Portal', href: '/portal' },
      ],
    },
    services: {
      heading: 'Shop',
      // Categories, linking into the shop's own filter rather than to anchors
      // on a services page that no longer describes what is sold.
      items: [
        { label: 'Sneakers', href: '/shop?category=sneakers' },
        { label: 'Boots', href: '/shop?category=boots' },
        { label: 'Casuals', href: '/shop?category=casuals' },
        { label: 'Sandals', href: '/shop?category=sandals' },
        { label: 'Officials', href: '/shop?category=officials' },
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
        { label: 'Shop', href: '/shop' },
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
        { title: 'Ask About Your Size', description: 'Tell us the shoe and the size; we answer straight away.' },
        { title: 'Genuine Stock', description: 'Nike, Adidas, Jordan and Puma, priced honestly.' },
        { title: 'Two Shops, One Street', description: 'Ronald Ngala Street, open 08:00 to 20:00 daily.' },
      ],
    },
  },
};
