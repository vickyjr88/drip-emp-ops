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
        title: 'Featured residences heading',
        description: 'The listings themselves come from live inventory, not from here.',
        fields: [
          { path: 'featured.heading', label: 'Heading', type: 'text' },
          { path: 'featured.subheading', label: 'Subheading', type: 'textarea' },
        ],
      },
      {
        key: 'hero-feature',
        title: 'Hero featured property',
        description:
          'Shows a real listing at the top of the page. The property itself is whichever unit is marked featured with the lowest homepage order; only the labels are set here.',
        fields: [
          { path: 'heroFeature.enabled', label: 'Show featured property', type: 'boolean' },
          { path: 'heroFeature.eyebrow', label: 'Eyebrow', type: 'text' },
          { path: 'heroFeature.ctaLabel', label: 'Primary button', type: 'text' },
          { path: 'heroFeature.browseLabel', label: 'Second button', type: 'text' },
          { path: 'heroFeature.talkLabel', label: 'Third button', type: 'text' },
        ],
      },
      {
        key: 'home-about',
        title: 'About the firm',
        description: 'The credibility block: who stands behind the firm and who it serves.',
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
        key: 'home-stats',
        title: 'Track record figures',
        description:
          'Typed in rather than counted from the portal, so they are not published before the numbers are worth showing. Leave hidden until then — an empty figure reads worse than no section.',
        fields: [{ path: 'stats.enabled', label: 'Show', type: 'boolean' }],
        repeatable: {
          path: 'stats.items',
          label: 'Figure',
          fields: [
            { path: 'value', label: 'Figure', type: 'text' },
            { path: 'label', label: 'Label', type: 'text' },
          ],
          blank: { value: '', label: '' },
          addLabel: 'Add figure',
        },
      },
      {
        key: 'home-portfolio',
        title: 'Delivered portfolio',
        description:
          'Completed projects, as a track record. Add at least one entry before showing it.',
        fields: [
          { path: 'portfolio.enabled', label: 'Show', type: 'boolean' },
          { path: 'portfolio.eyebrow', label: 'Eyebrow', type: 'text' },
          { path: 'portfolio.heading', label: 'Heading', type: 'text' },
          { path: 'portfolio.subheading', label: 'Subheading', type: 'textarea' },
        ],
        repeatable: {
          path: 'portfolio.items',
          label: 'Project',
          fields: [
            { path: 'name', label: 'Project name', type: 'text' },
            { path: 'location', label: 'Location', type: 'text' },
            { path: 'summary', label: 'Summary', type: 'text' },
            {
              path: 'image',
              label: 'Image',
              type: 'image',
              recommendedWidth: 1200,
              recommendedHeight: 900,
            },
          ],
          blank: { name: '', location: '', summary: '', image: '' },
          addLabel: 'Add completed project',
        },
      },
      {
        key: 'home-report',
        title: 'Market report',
        description:
          'Needs a document to link to. Upload it under Site Content or paste a URL; the section stays hidden until there is one.',
        fields: [
          { path: 'report.enabled', label: 'Show', type: 'boolean' },
          { path: 'report.eyebrow', label: 'Eyebrow', type: 'text' },
          { path: 'report.heading', label: 'Heading', type: 'text' },
          { path: 'report.body', label: 'Body', type: 'textarea' },
          { path: 'report.releaseLabel', label: 'Release label', type: 'text' },
          { path: 'report.releaseTitle', label: 'Release title', type: 'text' },
          {
            path: 'report.fileUrl',
            label: 'Report file URL',
            type: 'text',
            help: 'Paste a link to the PDF. The button is hidden while this is blank.',
          },
          { path: 'report.ctaLabel', label: 'Button label', type: 'text' },
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
          { path: 'hero.subheading', label: 'Subheading', type: 'textarea' },
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
        ],
      },
      {
        key: 'story-stats',
        title: 'Headline statistics',
        description: 'Shown beside Our Story. Four reads best; the grid is two across.',
        repeatable: {
          path: 'story.stats',
          label: 'Statistic',
          fields: [
            { path: 'value', label: 'Value', type: 'text', help: 'e.g. "100+"' },
            { path: 'label', label: 'Label', type: 'text', help: 'e.g. "Happy Clients"' },
          ],
          blank: { value: '', label: '' },
          addLabel: 'Add statistic',
        },
      },
      {
        key: 'mission-vision',
        title: 'Mission & Vision',
        description: 'Numbered cards, side by side.',
        repeatable: {
          path: 'missionVision.items',
          label: 'Statement',
          fields: CARD_FIELDS,
          blank: { title: '', description: '' },
          addLabel: 'Add statement',
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
        key: 'leadership',
        title: 'Leadership',
        fields: [
          { path: 'leadership.kicker', label: 'Kicker', type: 'text' },
          { path: 'leadership.heading', label: 'Heading', type: 'text' },
          { path: 'leadership.name', label: 'Name', type: 'text' },
          { path: 'leadership.role', label: 'Role', type: 'text' },
          {
            path: 'leadership.image',
            label: 'Portrait',
            type: 'image',
            recommendedWidth: 800,
            recommendedHeight: 1000,
            help: 'Portrait orientation — the frame is taller than it is wide.',
          },
          {
            path: 'leadership.paragraphs',
            label: 'Biography paragraphs',
            type: 'stringList',
            help: 'One paragraph per line. Blank lines are ignored.',
          },
        ],
      },
      {
        key: 'team-intro',
        title: 'Team heading',
        fields: [
          { path: 'team.kicker', label: 'Kicker', type: 'text' },
          { path: 'team.heading', label: 'Heading', type: 'text' },
          { path: 'team.intro', label: 'Intro', type: 'textarea' },
        ],
      },
      {
        key: 'team-items',
        title: 'Team members',
        repeatable: {
          path: 'team.items',
          label: 'Member',
          fields: [
            { path: 'name', label: 'Name', type: 'text' },
            { path: 'role', label: 'Role', type: 'text' },
            { path: 'description', label: 'Description', type: 'textarea' },
            { path: 'email', label: 'Email', type: 'text', help: 'Optional. Shown as a mailto link.' },
            {
              path: 'image',
              label: 'Photo',
              type: 'image',
              recommendedWidth: 600,
              recommendedHeight: 600,
              help: 'Square crop. Initials are shown until a photo is uploaded.',
            },
          ],
          blank: { name: '', role: '', description: '', email: '', image: '' },
          addLabel: 'Add member',
        },
      },
      {
        key: 'testimonials-intro',
        title: 'Testimonials heading',
        fields: [
          { path: 'testimonials.kicker', label: 'Kicker', type: 'text' },
          { path: 'testimonials.heading', label: 'Heading', type: 'text' },
          { path: 'testimonials.intro', label: 'Intro', type: 'textarea' },
        ],
      },
      {
        key: 'testimonials-items',
        title: 'Testimonials',
        repeatable: {
          path: 'testimonials.items',
          label: 'Testimonial',
          fields: [
            { path: 'quote', label: 'Quote', type: 'textarea' },
            { path: 'name', label: 'Client name', type: 'text' },
            {
              path: 'detail',
              label: 'Client detail',
              type: 'text',
              help: 'e.g. "First-time homebuyer · Parklands, Nairobi"',
            },
            { path: 'date', label: 'Date', type: 'text', help: 'e.g. "March 2026"' },
          ],
          blank: { quote: '', name: '', detail: '', date: '' },
          addLabel: 'Add testimonial',
        },
      },
      {
        key: 'recognition-intro',
        title: 'Recognition heading',
        fields: [
          { path: 'recognition.kicker', label: 'Kicker', type: 'text' },
          { path: 'recognition.heading', label: 'Heading', type: 'text' },
          { path: 'recognition.intro', label: 'Intro', type: 'textarea' },
        ],
      },
      {
        key: 'recognition-items',
        title: 'Recognition cards',
        repeatable: {
          path: 'recognition.items',
          label: 'Recognition',
          fields: CARD_FIELDS,
          blank: { title: '', description: '' },
          addLabel: 'Add recognition',
        },
      },
      {
        key: 'recognition-partners',
        title: 'Partners',
        description: 'Logos sit in a single muted row. The name shows as text until a logo is uploaded.',
        repeatable: {
          path: 'recognition.partners',
          label: 'Partner',
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
          addLabel: 'Add partner',
        },
      },
      {
        key: 'advantage',
        title: 'The Drip Emporium Advantage',
        fields: [
          { path: 'advantage.kicker', label: 'Kicker', type: 'text' },
          { path: 'advantage.heading', label: 'Heading', type: 'text' },
          {
            path: 'advantage.items',
            label: 'Advantages',
            type: 'lineList',
            help: 'One per line. Shown as a ticked list.',
          },
        ],
      },
      {
        key: 'heritage-intro',
        title: 'Heritage heading',
        fields: [
          { path: 'heritage.heading', label: 'Heading', type: 'text' },
          { path: 'heritage.subheading', label: 'Subheading', type: 'text' },
        ],
      },
      {
        key: 'heritage-items',
        title: 'Heritage timeline',
        repeatable: {
          path: 'heritage.items',
          label: 'Milestone',
          fields: [
            { path: 'year', label: 'Year', type: 'text' },
            { path: 'title', label: 'Title', type: 'text' },
            { path: 'text', label: 'Text', type: 'textarea' },
            {
              path: 'image',
              label: 'Image',
              type: 'image',
              recommendedWidth: 800,
              recommendedHeight: 600,
            },
          ],
          blank: { year: '', title: '', text: '', image: '' },
          addLabel: 'Add milestone',
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
    slug: 'services',
    label: 'Services',
    href: '/services',
    sections: [
      {
        key: 'hero',
        title: 'Hero',
        fields: [
          { path: 'hero.kicker', label: 'Kicker', type: 'text' },
          { path: 'hero.heading', label: 'Heading', type: 'textarea' },
          { path: 'hero.intro', label: 'Intro', type: 'textarea' },
        ],
      },
      {
        key: 'services-items',
        title: 'Service sections',
        description:
          'Each entry renders as a full-width section with its own image, alternating left and right down the page, and gets a jump-nav link at the top.',
        repeatable: {
          path: 'services.items',
          label: 'Service',
          fields: [
            { path: 'title', label: 'Title', type: 'text' },
            {
              path: 'navLabel',
              label: 'Jump nav label',
              type: 'text',
              help: 'Short label for the menu at the top. Falls back to the title if left blank.',
            },
            {
              path: 'anchor',
              label: 'Anchor id',
              type: 'text',
              help: 'Used for the #link, e.g. "property-sales". Generated from the title if left blank. Changing it breaks existing shared links.',
            },
            { path: 'description', label: 'Description', type: 'textarea' },
            {
              path: 'features',
              label: 'Feature list',
              type: 'lineList',
              help: 'One feature per line. Shown as a ticked list; 3-4 reads best.',
            },
            {
              path: 'image',
              label: 'Section image',
              type: 'image',
              recommendedWidth: 1200,
              recommendedHeight: 900,
              help: 'Landscape 4:3. Leave blank to show an icon placeholder instead.',
            },
          ],
          blank: { title: '', navLabel: '', anchor: '', description: '', features: [], image: '' },
          addLabel: 'Add service',
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
