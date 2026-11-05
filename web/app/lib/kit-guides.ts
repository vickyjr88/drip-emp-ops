/**
 * Buying guides for the Kits line. They answer the questions people search before buying a jersey or a custom T-shirt in
 * Kenya, link into the shop and the design center, and make no claim the shop cannot stand behind: the shirts are
 * fan-version, fees and lead times are quoted from the design center (they change), and nothing is called official.
 */

export type KitGuide = {
  slug: string;
  title: string;
  description: string;
  /** ISO date the text was last reviewed; the sitemap's lastmod. */
  updated: string;
  intro: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
};

export const KIT_GUIDES: KitGuide[] = [
  {
    slug: 'fan-version-vs-official-football-jerseys',
    title: 'Fan Version vs Official Football Jerseys: What Is the Difference?',
    description: 'What a fan-version football jersey is, how it differs from an official club shirt, and how to decide which one is right for you.',
    updated: '2026-11-06',
    intro: 'Shopping for a football jersey in Kenya you will see two kinds: official shirts and fan versions. They are different products, and it helps to know which one you are buying.',
    sections: [
      {
        heading: 'What an official shirt is',
        paragraphs: [
          'An official shirt is made under licence from the club and carries the club crest, the sponsor and the kit maker\'s mark. It is sold through the club and licensed retailers and is priced accordingly.',
        ],
      },
      {
        heading: 'What a fan version is',
        paragraphs: [
          'A fan-version shirt is an independent product made in a club\'s colours. It does not carry the club\'s crest, sponsor or the kit maker\'s mark, and it is not endorsed by or affiliated with the club, its league or any kit maker. At Drip Emporium every kit page says so plainly.',
          'Fan versions cost less, which is why many supporters buy them for everyday wear, for matchday in the stands, for five-a-side or as a gift.',
        ],
      },
      {
        heading: 'Which should you choose?',
        paragraphs: [
          'If you want the exact licensed shirt with the crest, buy official. If you want the colours at a lower price, and especially if you want your own name and number printed, a fan version is a sensible choice. You can see exactly how it will look before you order in our design center.',
        ],
      },
    ],
  },
  {
    slug: 'how-to-add-a-name-and-number-to-a-jersey',
    title: 'How to Add Your Name and Number to a Football Jersey',
    description: 'Step by step: choosing a name and number, picking a lettering style, checking the preview and ordering a personalised football jersey in Kenya.',
    updated: '2026-11-06',
    intro: 'Putting your name and number on a football jersey takes about three minutes in our design center. Here is what to know before you start.',
    sections: [
      {
        heading: 'Step by step',
        paragraphs: [
          'Open the design center, choose Football jersey, and pick your club and whether you want the home, away or third kit. Type the name you want on the back and a number from 0 to 99. Choose a lettering style and a colour, check the front and back, pick your size and add it to your cart.',
        ],
      },
      {
        heading: 'Rules for names and numbers',
        paragraphs: [
          'A name can be up to 12 characters: letters, spaces, hyphens, apostrophes and full stops. It is printed in capitals, the way it appears on a match shirt. A number is one or two digits, 0 to 99. Names and numbers are checked before printing, and we may contact you if something cannot be printed.',
        ],
      },
      {
        heading: 'Check the spelling',
        paragraphs: [
          'Personalised shirts are printed just for you, so they cannot be returned unless they arrive faulty or misprinted. Read the preview twice. If you are unsure, message us on WhatsApp before you order.',
        ],
      },
    ],
  },
  {
    slug: 'football-jersey-lettering-styles-explained',
    title: 'Football Jersey Lettering Styles Explained: Names, Numbers and Fonts',
    description: 'Why jersey names and numbers look the way they do, how lettering styles differ, and how to choose one for your shirt.',
    updated: '2026-11-06',
    intro: 'The name and number on the back of a football shirt are set in a bold, condensed style so they can be read from the stands. Choosing one for your own shirt comes down to a few simple ideas.',
    sections: [
      {
        heading: 'Why jersey lettering looks the way it does',
        paragraphs: [
          'Tall, narrow capitals fit a long name across the shoulders and stay readable at a distance. Heavy block styles read as strong and modern; slab styles feel classic and retro.',
        ],
      },
      {
        heading: 'Clubs\' own typefaces',
        paragraphs: [
          'Many clubs and leagues use their own designed lettering, and those typefaces are licensed. We do not use them. Our design center offers ten open-licence lettering styles that suit the same job, labelled by how they look, such as classic condensed, tall sport, heavy block and retro slab. They are look-alikes in spirit, and are not any club\'s own typeface.',
        ],
      },
      {
        heading: 'Choosing a style',
        paragraphs: [
          'Type your name and number into the design center and the lettering gallery shows your own name in every style, so you can compare them side by side and see the shirt change as you choose. Long names usually look best in a condensed style; a short name and a big number suit heavy block.',
        ],
      },
    ],
  },
  {
    slug: 'custom-t-shirt-printing-in-nairobi',
    title: 'Custom T-Shirt Printing in Nairobi: How to Order Online',
    description: 'How to design and order a custom printed T-shirt in Nairobi: choosing a shirt, adding artwork or text, previewing it and what to expect on turnaround.',
    updated: '2026-11-06',
    intro: 'Whether it is for a gift, a team, a group or an event, you can design a custom T-shirt online and have it delivered anywhere in Kenya.',
    sections: [
      {
        heading: 'Design it yourself',
        paragraphs: [
          'In the design center choose a T-shirt style (crew-neck, V-neck or oversized) and a colour. Add text, or upload a picture, then drag it into place, resize it and rotate it. Switch between the front and back to check everything.',
        ],
      },
      {
        heading: 'Getting good results from your artwork',
        paragraphs: [
          'Use a large, clear picture; it is printed as it appears in the preview. Pictures with a transparent background (PNG) look cleanest. We accept PNG, JPEG, WebP and GIF files up to 8 MB.',
        ],
      },
      {
        heading: 'Price, turnaround and delivery',
        paragraphs: [
          'The design center shows the exact total, the shirt plus the print fee, before you pay. The current printing lead time is shown on every kit page and at checkout. We deliver across Kenya, and you can collect from our shop at Dubai Merchants Mall, Ronald Ngala Street, Nairobi. For larger group orders, message us on WhatsApp.',
        ],
      },
    ],
  },
  {
    slug: 'how-to-choose-your-football-jersey-size',
    title: 'How to Choose Your Football Jersey Size',
    description: 'A simple way to pick the right football jersey size online: measure a shirt you own, compare, and decide between sizes.',
    updated: '2026-11-06',
    intro: 'Buying a jersey online is easy when you know your size. This is the quickest way to work it out.',
    sections: [
      {
        heading: 'Measure a shirt that fits you well',
        paragraphs: [
          'Lay a T-shirt or jersey you like flat, and measure straight across the chest from armpit to armpit, then double it. That is the chest size that suits you. Do the same for length from the top of the shoulder to the hem.',
        ],
      },
      {
        heading: 'Between two sizes?',
        paragraphs: [
          'If you like a looser fit, or you are between two sizes, go up one. Long-sleeve jerseys and oversized T-shirts are cut to sit differently from a short-sleeve jersey, so allow for that. We list sizes from S to 3XL.',
        ],
      },
      {
        heading: 'Still not sure?',
        paragraphs: [
          'Message us on WhatsApp with your usual size in another shirt or your chest measurement and we will tell you which size to order. Remember that a personalised shirt cannot be returned, so it is worth asking first.',
        ],
      },
    ],
  },
  {
    slug: 'football-jersey-gift-ideas-in-kenya',
    title: 'Football Jersey Gift Ideas in Kenya: Personalised Shirts They Will Wear',
    description: 'Gift ideas for football fans in Kenya: a personalised jersey with their name and number, a custom T-shirt, and how to order in time.',
    updated: '2026-11-06',
    intro: 'For anyone who supports a team, a shirt with their own name and number on the back is a gift they will actually wear.',
    sections: [
      {
        heading: 'A jersey with their name on it',
        paragraphs: [
          'Choose their club, pick home, away or third, and add their name and favourite number. You can preview the back of the shirt and send the design link to someone else to check the spelling before you order.',
        ],
      },
      {
        heading: 'A custom T-shirt',
        paragraphs: [
          'For a birthday, a team, a family event or a surprise, design a T-shirt with a message or a picture. Preview the front and back first.',
        ],
      },
      {
        heading: 'Ordering in time',
        paragraphs: [
          'Personalised shirts are made to order, so allow for printing as well as delivery. The current lead time is shown on the kit page and in the design center. Order early for a date that matters, and message us on WhatsApp if you are close to the deadline.',
        ],
      },
    ],
  },
  {
    slug: 'how-to-care-for-a-printed-football-jersey',
    title: 'How to Care for a Printed Football Jersey',
    description: 'Simple washing and drying tips to keep a printed name, number or T-shirt design looking good for longer.',
    updated: '2026-11-06',
    intro: 'A printed shirt lasts longest with a little care. These habits apply to most printed garments.',
    sections: [
      {
        heading: 'Washing',
        paragraphs: [
          'Turn the shirt inside out and wash it in cold or cool water on a gentle cycle. Wash printed shirts with similar colours and avoid harsh bleach and strong detergents.',
        ],
      },
      {
        heading: 'Drying and ironing',
        paragraphs: [
          'Let the shirt dry in the shade rather than in direct sun or a hot dryer. If you need to iron, turn it inside out, use low heat, and never iron directly over the print.',
        ],
      },
    ],
  },
];

export const guideBySlug = (slug: string) => KIT_GUIDES.find((guide) => guide.slug === slug);
