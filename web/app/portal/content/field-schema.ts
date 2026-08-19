/**
 * Describes the editable shape of each public page so the CMS can render a form
 * without hand-writing one per page.
 *
 * This mirrors the defaults the API serves (page-content.defaults.ts). Adding a
 * field here makes it editable; the public page decides how to render it, and
 * falls back to its built-in copy when a value is blank.
 */

export type FieldType = 'text' | 'textarea' | 'image' | 'stringList' | 'lineList' | 'boolean';

export type Field = {
  /** Dot path into the page's content document, e.g. "hero.heading". */
  path: string;
  label: string;
  type: FieldType;
  help?: string;
  /** Advisory target size for image fields; upload is never blocked. */
  recommendedWidth?: number;
  recommendedHeight?: number;
};

export type RepeatableSection = {
  /** Path to the array, e.g. "services.items". */
  path: string;
  label: string;
  /** Fields on each entry, relative to the entry. */
  fields: Field[];
  /** Shape used when adding a new entry. List fields start as empty arrays. */
  blank: Record<string, string | string[]>;
  addLabel: string;
  min?: number;
};

export type Section = {
  key: string;
  title: string;
  description?: string;
  fields?: Field[];
  repeatable?: RepeatableSection;
};

export type PageSchema = {
  slug: string;
  label: string;
  /** Where the public page lives, so editors can preview their change. */
  href: string;
  sections: Section[];
};

const CARD_FIELDS: Field[] = [
  { path: 'title', label: 'Title', type: 'text' },
  { path: 'description', label: 'Description', type: 'textarea' },
];

const LINK_FIELDS: Field[] = [
  { path: 'label', label: 'Label', type: 'text' },
  {
    path: 'href',
    label: 'Link',
    type: 'text',
    help: 'A path such as /listings, or /services#property-sales to jump to a section.',
  },
];

/**
 * Title and description fields for one public page.
 *
 * Share copy is optional throughout: left blank, the card falls back to the
 * page's own title and description, which is right more often than not.
 */
function seoFields(page: string): Field[] {
  return [
    {
      path: `${page}.title`,
      label: 'Page title',
      type: 'text',
      help: 'Shown in the browser tab and as the search result heading. The site name is added automatically. Aim for under 60 characters.',
    },
    {
      path: `${page}.description`,
      label: 'Meta description',
      type: 'textarea',
      help: 'The grey text under the title in search results. Aim for 120-160 characters.',
    },
    {
      path: `${page}.shareTitle`,
      label: 'Share title',
      type: 'text',
      help: 'Used on WhatsApp, Facebook and X. Leave blank to reuse the page title.',
    },
    {
      path: `${page}.shareDescription`,
      label: 'Share description',
      type: 'textarea',
      help: 'Leave blank to reuse the meta description.',
    },
  ];
}

export const PAGE_SCHEMAS: PageSchema[] = [
  {
    slug: 'home',
    label: 'Home',
    href: '/',
    sections: [
      {
        key: 'hero',
        title: 'Hero',
        description: 'The banner at the top of the home page, behind the search bar.',
        fields: [
          {
            path: 'hero.heading',
            label: 'Heading',
            type: 'textarea',
            help: 'Line breaks are preserved on the page.',
          },
          { path: 'hero.subheading', label: 'Subheading', type: 'textarea' },
          {
            path: 'hero.backgroundImage',
            label: 'Background image',
            type: 'image',
            recommendedWidth: 1920,
            recommendedHeight: 1080,
            help: 'Leave empty to keep the default background from the stylesheet.',
          },
        ],
      },
      {
        key: 'services-intro',
        title: 'Services heading',
        fields: [
          { path: 'services.heading', label: 'Heading', type: 'text' },
          { path: 'services.subheading', label: 'Subheading', type: 'textarea' },
        ],
      },
      {
        key: 'services-items',
        title: 'Service cards',
        repeatable: {
          path: 'services.items',
          label: 'Service',
          fields: CARD_FIELDS,
          blank: { title: '', description: '' },
          addLabel: 'Add service',
        },
      },
      {
        key: 'featured',
        title: 'Featured products heading',
        description: 'The products themselves come from live inventory, not from here.',
        fields: [
          { path: 'featured.heading', label: 'Heading', type: 'text' },
          { path: 'featured.subheading', label: 'Subheading', type: 'textarea' },
        ],
      },
      {
        key: 'home-trust',
        title: 'Why Shop With Us',
        description: 'Trust badges shown right under the hero -- what a first-time visitor checks before buying.',
        fields: [
          { path: 'trust.heading', label: 'Heading', type: 'text' },
          { path: 'trust.subheading', label: 'Subheading', type: 'textarea' },
        ],
        repeatable: {
          path: 'trust.items',
          label: 'Badge',
          fields: CARD_FIELDS,
          blank: { title: '', description: '' },
          addLabel: 'Add badge',
        },
      },
      {
        key: 'home-about',
        title: 'About the shop',
        description: 'The credibility block: who stands behind the shop and who it serves.',
        fields: [
          { path: 'about.heading', label: 'Heading', type: 'text' },
          { path: 'about.body', label: 'Body', type: 'textarea' },
          {
            path: 'about.image',
            label: 'Image',
            type: 'image',
            recommendedWidth: 1200,
            recommendedHeight: 900,
          },
          { path: 'about.linkLabel', label: 'Link label', type: 'text' },
          { path: 'about.linkHref', label: 'Link target', type: 'text' },
        ],
      },
      {
        key: 'home-brands',
        title: 'Brands We Carry',
        description: 'Logos sit in a single muted row. The name shows as text until a logo is uploaded.',
        fields: [{ path: 'brands.heading', label: 'Heading', type: 'text' }],
        repeatable: {
          path: 'brands.items',
          label: 'Brand',
          fields: [
            { path: 'name', label: 'Name', type: 'text' },
            {
              path: 'logo',
              label: 'Logo',
              type: 'image',
              recommendedWidth: 400,
              recommendedHeight: 160,
              help: 'Wide transparent PNG works best. Rendered in greyscale.',
            },
          ],
          blank: { name: '', logo: '' },
          addLabel: 'Add brand',
        },
      },
      {
        key: 'home-mid-cta',
        title: 'Mid-page call to action',
        description:
          'A second, sharper ask partway down the page -- reaches a shopper who never scrolls to the closing CTA at the bottom.',
        fields: [
          { path: 'midCta.enabled', label: 'Show', type: 'boolean' },
          { path: 'midCta.heading', label: 'Heading', type: 'text' },
          { path: 'midCta.body', label: 'Body', type: 'textarea' },
          { path: 'midCta.ctaLabel', label: 'Button label', type: 'text' },
        ],
      },
      {
        key: 'cta',
        title: 'Closing call to action',
        fields: [
          { path: 'cta.heading', label: 'Heading', type: 'text' },
          { path: 'cta.body', label: 'Body', type: 'textarea' },
          { path: 'cta.primaryLabel', label: 'Primary button label', type: 'text' },
          { path: 'cta.secondaryLabel', label: 'Secondary button label', type: 'text' },
          { path: 'cta.secondaryHref', label: 'Secondary button link', type: 'text' },
        ],
      },
    ],
  },

  {
    slug: 'about',
    label: 'About',
    href: '/about',
    sections: [
      {
        key: 'hero',
        title: 'Hero',
        fields: [
          { path: 'hero.kicker', label: 'Kicker', type: 'text' },
          { path: 'hero.heading', label: 'Heading', type: 'textarea' },
          { path: 'hero.intro', label: 'Intro', type: 'textarea' },
          {
            path: 'hero.image',
            label: 'Hero image',
            type: 'image',
            recommendedWidth: 1920,
            recommendedHeight: 1080,
          },
        ],
      },
      {
        key: 'story',
        title: 'Our Story',
        fields: [
          { path: 'story.heading', label: 'Heading', type: 'text' },
          {
            path: 'story.paragraphs',
            label: 'Paragraphs',
            type: 'stringList',
            help: 'One paragraph per block, separated by a blank line.',
          },
          {
            path: 'story.image',
            label: 'Story image',
            type: 'image',
            recommendedWidth: 1000,
            recommendedHeight: 1200,
            help: 'Sits beside the story. Leave blank to run the text full width.',
          },
        ],
      },
      {
        key: 'gallery',
        title: 'Shop photos',
        description: 'A row of photos between the story and the values. Hidden while empty.',
        fields: [{ path: 'gallery.heading', label: 'Heading', type: 'text' }],
        repeatable: {
          path: 'gallery.items',
          label: 'Photo',
          fields: [
            {
              path: 'image',
              label: 'Photo',
              type: 'image',
              recommendedWidth: 900,
              recommendedHeight: 900,
              help: 'Square crop works best.',
            },
            { path: 'caption', label: 'Caption', type: 'text', help: 'Optional.' },
          ],
          blank: { image: '', caption: '' },
          addLabel: 'Add photo',
        },
      },
      {
        key: 'values-heading',
        title: 'Core values heading',
        fields: [
          { path: 'values.kicker', label: 'Kicker', type: 'text' },
          { path: 'values.heading', label: 'Heading', type: 'text' },
        ],
      },
      {
        key: 'values',
        title: 'Core values',
        repeatable: {
          path: 'values.items',
          label: 'Value',
          fields: CARD_FIELDS,
          blank: { title: '', description: '' },
          addLabel: 'Add value',
        },
      },
      {
        key: 'cta',
        title: 'Closing call to action',
        fields: [
          { path: 'cta.heading', label: 'Heading', type: 'text' },
          { path: 'cta.body', label: 'Body', type: 'textarea' },
          { path: 'cta.primaryLabel', label: 'Primary button label', type: 'text' },
          { path: 'cta.secondaryLabel', label: 'Secondary button label', type: 'text' },
        ],
      },
    ],
  },


  {
    slug: 'areas',
    label: 'Areas',
    href: '/areas',
    sections: [
      {
        key: 'areas-hero',
        title: 'Hero',
        fields: [
          { path: 'hero.kicker', label: 'Kicker', type: 'text' },
          { path: 'hero.heading', label: 'Heading', type: 'text' },
          { path: 'hero.intro', label: 'Intro', type: 'textarea' },
        ],
      },
      {
        key: 'areas-items',
        title: 'Neighbourhoods',
        description:
          'Each entry renders as a full-width section with its own image, alternating down the page, and gets a jump-nav link at the top. Edit, reorder or remove them freely; clearing the list entirely restores the six built into the site.',
        repeatable: {
          path: 'areas.items',
          label: 'Neighbourhood',
          fields: [
            { path: 'name', label: 'Name', type: 'text' },
            {
              path: 'navLabel',
              label: 'Jump nav label',
              type: 'text',
              help: 'Short label for the menu at the top. Falls back to the name.',
            },
            {
              path: 'anchor',
              label: 'Anchor id',
              type: 'text',
              help: 'Used for the #link, e.g. "westlands". Generated from the name if blank. Changing it breaks existing shared links.',
            },
            { path: 'kicker', label: 'Kicker', type: 'text' },
            { path: 'description', label: 'Description', type: 'textarea' },
            {
              path: 'highlights',
              label: 'Highlights',
              type: 'lineList',
              help: 'One landmark or draw per line; four reads best.',
            },
            { path: 'saleRange', label: 'Sale range', type: 'text' },
            { path: 'rentRange', label: 'Rent range', type: 'text' },
            {
              path: 'filterValue',
              label: 'Properties filter',
              type: 'text',
              help: 'Matched against a project location, so "Westlands" finds "Westlands, Nairobi". Leave blank to link to all properties.',
            },
            {
              path: 'image',
              label: 'Image',
              type: 'image',
              recommendedWidth: 1600,
              recommendedHeight: 1200,
            },
          ],
          blank: {
            name: '',
            navLabel: '',
            anchor: '',
            kicker: '',
            description: '',
            highlights: [],
            saleRange: '',
            rentRange: '',
            filterValue: '',
            image: '',
          },
          addLabel: 'Add neighbourhood',
        },
      },
      {
        key: 'areas-cta',
        title: 'Closing call to action',
        fields: [
          { path: 'cta.heading', label: 'Heading', type: 'text' },
          { path: 'cta.body', label: 'Body', type: 'textarea' },
          { path: 'cta.primaryLabel', label: 'Primary button label', type: 'text' },
          { path: 'cta.secondaryLabel', label: 'Secondary button label', type: 'text' },
        ],
      },
    ],
  },

  {
    slug: 'terms',
    label: 'Terms',
    href: '/terms',
    sections: [
      {
        key: 'terms-hero',
        title: 'Hero',
        fields: [
          { path: 'hero.kicker', label: 'Kicker', type: 'text' },
          { path: 'hero.heading', label: 'Heading', type: 'text' },
          { path: 'hero.intro', label: 'Intro', type: 'textarea' },
        ],
      },
      {
        key: 'terms-body',
        title: 'Policy sections',
        description:
          'The page says the policy is not published until at least one section is added. Within a section, leave a blank line between paragraphs.',
        fields: [
          {
            path: 'body.lastUpdated',
            label: 'Last updated',
            type: 'text',
            help: 'Shown above the first section, e.g. "14 August 2026". Hidden while blank.',
          },
        ],
        repeatable: {
          path: 'body.sections',
          label: 'Section',
          fields: [
            { path: 'heading', label: 'Heading', type: 'text' },
            { path: 'body', label: 'Body', type: 'textarea' },
          ],
          blank: { heading: '', body: '' },
          addLabel: 'Add section',
        },
      },
    ],
  },

  {
    slug: 'privacy',
    label: 'Privacy',
    href: '/privacy',
    sections: [
      {
        key: 'privacy-hero',
        title: 'Hero',
        fields: [
          { path: 'hero.kicker', label: 'Kicker', type: 'text' },
          { path: 'hero.heading', label: 'Heading', type: 'text' },
          { path: 'hero.intro', label: 'Intro', type: 'textarea' },
        ],
      },
      {
        key: 'privacy-body',
        title: 'Policy sections',
        description:
          'The page says the policy is not published until at least one section is added. Within a section, leave a blank line between paragraphs.',
        fields: [
          {
            path: 'body.lastUpdated',
            label: 'Last updated',
            type: 'text',
            help: 'Shown above the first section, e.g. "14 August 2026". Hidden while blank.',
          },
        ],
        repeatable: {
          path: 'body.sections',
          label: 'Section',
          fields: [
            { path: 'heading', label: 'Heading', type: 'text' },
            { path: 'body', label: 'Body', type: 'textarea' },
          ],
          blank: { heading: '', body: '' },
          addLabel: 'Add section',
        },
      },
    ],
  },

  {
    slug: 'seo',
    label: 'SEO',
    href: '/',
    sections: [
      {
        key: 'seo-home',
        title: 'Home',
        description:
          'The home page keeps the site-wide title, so its page title field is not used. Its description is what search engines show.',
        fields: seoFields('home'),
      },
      { key: 'seo-properties', title: 'Properties', fields: seoFields('properties') },
      { key: 'seo-listings', title: 'Listings', fields: seoFields('listings') },
      { key: 'seo-areas', title: 'Areas', fields: seoFields('areas') },
      { key: 'seo-services', title: 'Services', fields: seoFields('services') },
      { key: 'seo-about', title: 'About', fields: seoFields('about') },
      { key: 'seo-contact', title: 'Contact', fields: seoFields('contact') },
      { key: 'seo-terms', title: 'Terms', fields: seoFields('terms') },
      { key: 'seo-privacy', title: 'Privacy', fields: seoFields('privacy') },
    ],
  },

  {
    slug: 'header',
    label: 'Header',
    // Site-wide, like the footer; the home page is a fair preview.
    href: '/',
    sections: [
      {
        key: 'header-brand',
        title: 'Brand wordmark',
        description: 'The text at the top left of every public page, linking home.',
        fields: [{ path: 'brand.wordmark', label: 'Wordmark', type: 'text' }],
      },
      {
        key: 'header-nav',
        title: 'Navigation links',
        description:
          'Shown across the top on desktop and in the menu on mobile, in this order.',
        repeatable: {
          path: 'nav.items',
          label: 'Link',
          fields: LINK_FIELDS,
          blank: { label: '', href: '' },
          addLabel: 'Add link',
        },
      },
      {
        key: 'header-cta',
        title: 'Header button',
        description: 'The highlighted button to the right of the navigation.',
        fields: [
          { path: 'cta.label', label: 'Button label', type: 'text' },
          { path: 'cta.href', label: 'Button link', type: 'text' },
        ],
      },
      {
        key: 'header-enquiries',
        title: 'Enquiry contact',
        description:
          'Used by the WhatsApp and call buttons on listings and the properties page. The WhatsApp number is digits only, with the country code and no plus sign.',
        fields: [
          { path: 'enquiries.whatsapp', label: 'WhatsApp number', type: 'text' },
          { path: 'enquiries.phone', label: 'Phone (as displayed)', type: 'text' },
        ],
      },
    ],
  },

  {
    slug: 'footer',
    label: 'Footer',
    // Site-wide rather than a page of its own; the home page is a fair preview.
    href: '/',
    sections: [
      {
        key: 'brand',
        title: 'Brand blurb',
        description: 'The left-hand column of the footer, shown on every public page.',
        fields: [
          { path: 'brand.heading', label: 'Heading', type: 'text' },
          { path: 'brand.description', label: 'Description', type: 'textarea' },
        ],
      },
      {
        key: 'quick-links-heading',
        title: 'Quick links heading',
        fields: [{ path: 'quickLinks.heading', label: 'Heading', type: 'text' }],
      },
      {
        key: 'quick-links',
        title: 'Quick links',
        repeatable: {
          path: 'quickLinks.items',
          label: 'Link',
          fields: LINK_FIELDS,
          blank: { label: '', href: '' },
          addLabel: 'Add link',
        },
      },
      {
        key: 'footer-services-heading',
        title: 'Services column heading',
        fields: [{ path: 'services.heading', label: 'Heading', type: 'text' }],
      },
      {
        key: 'footer-services',
        title: 'Services links',
        description: 'Anchor links such as /services#property-sales jump straight to that section.',
        repeatable: {
          path: 'services.items',
          label: 'Link',
          fields: LINK_FIELDS,
          blank: { label: '', href: '' },
          addLabel: 'Add link',
        },
      },
      {
        key: 'footer-contact',
        title: 'Contact column',
        description: 'The email and phone become mailto: and tel: links automatically.',
        fields: [
          { path: 'contact.heading', label: 'Heading', type: 'text' },
          { path: 'contact.email', label: 'Email', type: 'text' },
          { path: 'contact.phone', label: 'Phone', type: 'text' },
          { path: 'contact.address', label: 'Address', type: 'textarea' },
        ],
      },
      {
        key: 'footer-bottom',
        title: 'Bottom bar',
        fields: [{ path: 'bottom.copyright', label: 'Copyright', type: 'text' }],
      },
      {
        key: 'footer-bottom-links',
        title: 'Bottom bar links',
        repeatable: {
          path: 'bottom.links',
          label: 'Link',
          fields: LINK_FIELDS,
          blank: { label: '', href: '' },
          addLabel: 'Add link',
        },
      },
      {
        key: 'footer-legal',
        title: 'Legal links',
        description:
          'Privacy policy, terms and similar. These pages do not exist yet, so add a link only once its page does.',
        repeatable: {
          path: 'bottom.legalLinks',
          label: 'Link',
          fields: LINK_FIELDS,
          blank: { label: '', href: '' },
          addLabel: 'Add legal link',
        },
      },
      {
        key: 'footer-social',
        title: 'Social profiles',
        description: 'Each link is hidden while its address is blank.',
        fields: [
          { path: 'social.heading', label: 'Heading', type: 'text' },
          { path: 'social.facebook', label: 'Facebook URL', type: 'text' },
          { path: 'social.instagram', label: 'Instagram URL', type: 'text' },
          { path: 'social.tiktok', label: 'TikTok URL', type: 'text' },
          { path: 'social.linkedin', label: 'LinkedIn URL', type: 'text' },
        ],
      },
    ],
  },

  {
    slug: 'contact',
    label: 'Contact',
    href: '/contact',
    sections: [
      {
        key: 'form',
        title: 'Inquiry form',
        fields: [
          { path: 'form.heading', label: 'Heading', type: 'text' },
          {
            path: 'form.intro',
            label: 'Intro paragraph',
            type: 'textarea',
            help: 'Shown under the heading, above the first field. Leave blank to hide it.',
          },
        ],
      },
      {
        key: 'agent',
        title: 'Agent card',
        description: 'The card beside the form, with the photo, name and role.',
        fields: [
          { path: 'agent.name', label: 'Name', type: 'text' },
          { path: 'agent.role', label: 'Role', type: 'text' },
          {
            path: 'agent.image',
            label: 'Photo',
            type: 'image',
            recommendedWidth: 800,
            recommendedHeight: 800,
            help: 'Square. Leave blank to keep the built-in photo.',
          },
        ],
      },
      {
        key: 'details',
        title: 'Contact details',
        description: 'Used for the call and email links as well as the displayed text.',
        fields: [
          { path: 'details.phone', label: 'Phone', type: 'text' },
          { path: 'details.email', label: 'Email', type: 'text' },
          { path: 'details.officeName', label: 'Office name', type: 'text' },
          { path: 'details.officeAddress', label: 'Office address', type: 'textarea' },
        ],
      },
      {
        key: 'highlights',
        title: 'Why work with us',
        repeatable: {
          path: 'highlights.items',
          label: 'Highlight',
          fields: CARD_FIELDS,
          blank: { title: '', description: '' },
          addLabel: 'Add highlight',
        },
      },
    ],
  },
];

/** Reads a dot path such as "hero.heading" out of a content document. */
export function getAtPath(source: any, path: string): any {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), source);
}

/** Returns a copy of `source` with `path` set, creating intermediate objects. */
export function setAtPath(source: any, path: string, value: any): any {
  const [head, ...rest] = path.split('.');
  const base = source && typeof source === 'object' ? source : {};
  if (rest.length === 0) {
    return { ...base, [head]: value };
  }
  return { ...base, [head]: setAtPath(base[head], rest.join('.'), value) };
}
