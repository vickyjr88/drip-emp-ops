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
export const PAGE_SLUGS = ['home', 'about', 'faq', 'contact', 'terms', 'privacy', 'header', 'footer', 'seo'] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

export const PAGE_LABELS: Record<PageSlug, string> = {
  home: 'Home',
  about: 'About',
  faq: 'FAQ',
  contact: 'Contact',
  terms: 'Terms',
  privacy: 'Privacy',
  header: 'Header',
  footer: 'Footer',
  seo: 'SEO',
};

export const IMAGE_SLOTS: Record<PageSlug, ImageSlot[]> = {
  // FAQ is all prose; there is nothing on it an image would improve.
  faq: [],
  home: [
    {
      key: 'about.image',
      label: 'About section image',
      recommendedWidth: 1200,
      recommendedHeight: 900,
      note: 'Sits beside the "About the shop" copy.',
    },
    {
      key: 'hero.backgroundImage',
      label: 'Hero background',
      recommendedWidth: 1920,
      recommendedHeight: 1080,
      note: 'Full-bleed banner behind the search bar. Landscape works best.',
    },
    {
      key: 'brands.items[].logo',
      label: 'Brand logo',
      recommendedWidth: 400,
      recommendedHeight: 160,
      note: 'Wide transparent PNG works best. The brand name shows as text until a logo is uploaded.',
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
      key: 'story.image',
      label: 'Story image',
      recommendedWidth: 1000,
      recommendedHeight: 1200,
      note: 'Sits beside "Our Story". Portrait or square works better than wide here.',
    },
    {
      key: 'gallery.items[].image',
      label: 'Gallery photo',
      recommendedWidth: 900,
      recommendedHeight: 900,
      note: 'Square crop. Shown in a row between the story and the values.',
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
  // Empty on purpose. The FAQ page carries its own answers and falls back to
  // them whenever no question has been saved, so seeding them here as well
  // would be a second copy to keep in step with the first.
  faq: {},
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
      heading: 'Featured Products',
      subheading: 'The pairs we would point you to first. Sizes move fast.',
    },
    // Trust badges, directly under the hero: what a first-time visitor checks
    // before they trust a shop enough to add something to a cart. Four reads
    // best in the grid; more will still lay out but crowd a phone screen.
    trust: {
      heading: 'Why Shop With Us',
      subheading: '',
      items: [
        { title: '100% Authentic', description: 'Genuine stock only, from Nike, Adidas, Jordan and Puma. No fakes, no stories.' },
        { title: 'Trending Styles', description: 'New drops and the pairs everyone is asking for, kept in stock.' },
        { title: 'Easy Shopping', description: 'Buy online with card or M-Pesa, or walk in and try the pair on first.' },
        { title: 'Fast & Reliable Delivery', description: 'Nationwide delivery, free on orders over KES 15,000.' },
      ],
    },
    // A single fixed list rather than pulled from the live catalogue, so a
    // brand the shop is about to bring in can be shown before the first pair
    // lands, and a brand that sells out is not silently dropped from the row.
    brands: {
      heading: 'Brands We Carry',
      items: [
        { name: 'Nike', logo: '' },
        { name: 'Adidas', logo: '' },
        { name: 'Puma', logo: '' },
        { name: 'Vans', logo: '' },
        { name: 'Converse', logo: '' },
        { name: 'New Balance', logo: '' },
      ],
    },
    // A second, sharper ask partway down the page -- the closing CTA at the
    // very bottom only reaches whoever scrolls that far. Free delivery is the
    // single strongest reason to buy now rather than "think about it".
    midCta: {
      enabled: true,
      heading: 'Free Delivery on Orders Over KES 15,000',
      body: 'Nationwide, on us. Shop the full range and check out in minutes.',
      ctaLabel: 'Shop Now',
    },
    cta: {
      heading: 'Cannot find your size?',
      body: 'Message us — stock moves between our two shops and we will tell you straight away what we have.',
      primaryLabel: 'WhatsApp Us',
      secondaryLabel: 'Visit a Shop',
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
      image: '',
    },
    // A handful of shop photos -- the shelf, the storefront, a fitting in
    // progress. Hidden entirely until at least one is uploaded, same as every
    // other optional band on this site.
    gallery: {
      heading: 'Inside the Shop',
      items: [],
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
    // Key is "properties" rather than "shop" -- a naming leftover from before
    // this was a shoe shop -- but it is what /shop/page.tsx actually reads,
    // so it stays rather than risk losing content already edited under it.
    properties: {
      title: 'Shop All Sneakers & Streetwear',
      description:
        'Browse sneakers, boots, casuals, sandals and officials from Nike, Adidas, Jordan and Puma. Free delivery on orders over KES 15,000.',
      shareTitle: 'Shop Sneakers & Streetwear | Drip Emporium',
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
      label: 'Contact A Team',
      href: '/contact',
    },
    // Used by the enquiry buttons on product pages, the cart and checkout,
    // which each carried their own copy of the number before this existed.
    enquiries: {
      whatsapp: '254113206481',
      phone: '+254 113 206 481',
    },
  },

  footer: {
    brand: {
      heading: 'Drip Emporium',
      description:
        'Genuine sneakers and streetwear from Nike, Adidas, Jordan and Puma. Two shops on Ronald Ngala Street, Nairobi.',
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
        'Tell us what you are after and we will come back to you the same day. Naming the shoe, your size and which shop is nearest saves a round of messages.',
    },
    // The card beside the form. Was hardcoded in the page, including the
    // photograph, so none of it could be changed without a deploy.
    agent: {
      name: 'Drip Emporium',
      role: 'Customer Care',
      image: '',
    },
    details: {
      phone: '+254 113 206 481',
      email: 'info@dripemporium.store',
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
