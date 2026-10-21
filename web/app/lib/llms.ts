/**
 * /llms.txt and /llms-full.txt: a plain-text briefing about the shop for AI assistants and answer
 * engines (llmstxt.org). The short file says who we are, where, and which pages answer which question;
 * the full file also carries every FAQ answer, so an assistant that reads one file still gets the
 * delivery, payment, sizing and returns answers in full.
 *
 * Built from the same sources as the pages themselves (the CMS contact details, the FAQ list, the live
 * catalogue and blog), so it cannot drift out of step with what a visitor sees.
 */
import { contentValue, fetchPageContent } from './page-content';
import { fetchBlogPosts } from './blog';
import { fetchCategories, fetchProducts } from './shop';
import { fetchFaqs } from '../components/faq-page';
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, STORE_ADDRESS, STORE_HOURS } from './site';

const oneLine = (text: string | null | undefined, max = 160) => {
  const clean = (text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).replace(/\s+\S*$/, '').trimEnd()}…`;
};

const INFORMATION_PAGES: Array<{ path: string; title: string; about: string }> = [
  { path: '/about', title: 'About us', about: 'Who we are, what we stock and how we trade.' },
  { path: '/faq', title: 'FAQs', about: 'Delivery, collection, payment, sizing, authenticity, exchanges and reseller pricing.' },
  { path: '/delivery', title: 'Delivery', about: 'Countrywide delivery: how it is arranged and costed after you order.' },
  { path: '/contact', title: 'Contact', about: 'Phone, WhatsApp, email and the shop address.' },
  { path: '/terms', title: 'Terms of service', about: 'The terms that apply to orders.' },
  { path: '/privacy', title: 'Privacy policy', about: 'How personal information is handled.' },
];

export async function buildLlmsTxt({ full }: { full: boolean }): Promise<string> {
  const [contact, header, footer, categories, products, blog, faqs] = await Promise.all([
    fetchPageContent('contact'),
    fetchPageContent('header'),
    fetchPageContent('footer'),
    fetchCategories(),
    fetchProducts(),
    fetchBlogPosts({ take: 200 }),
    full ? fetchFaqs() : Promise.resolve([]),
  ]);

  // The same numbers the Contact page and the WhatsApp buttons show, read from the same CMS documents.
  const phone = contentValue(contact, 'details.phone', contentValue(header, 'enquiries.phone', '+254 113 206 481'));
  const whatsappDigits = contentValue(header, 'enquiries.whatsapp', '254113206481').replace(/[^\d]/g, '');
  const email = contentValue(contact, 'details.email', 'hello@dripemporium.store');
  const samePhoneAndWhatsapp = phone.replace(/[^\d]/g, '').replace(/^0/, '254') === whatsappDigits;

  const prices = products.flatMap((p) => [p.priceFrom, p.priceTo]).filter((n) => Number.isFinite(n) && n > 0);
  // Brands with at least three products: a single odd value in the product data (a style name typed
  // into the brand field) should not be quoted as a brand we stock.
  const brandCounts = new Map<string, number>();
  for (const p of products) if (p.brand?.trim()) brandCounts.set(p.brand.trim(), (brandCounts.get(p.brand.trim()) ?? 0) + 1);
  const brands = Array.from(brandCounts.entries()).filter(([, n]) => n >= 3).map(([b]) => b).sort();
  const socials: Array<[string, string]> = [
    ['Facebook', 'facebook'], ['Instagram', 'instagram'], ['TikTok', 'tiktok'], ['X', 'x'],
  ]
    .map(([label, key]) => [label, contentValue(footer, `social.${key}`, '')] as [string, string])
    .filter(([, url]) => Boolean(url));

  const head: Array<string | null> = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `- Location: ${STORE_ADDRESS}`,
    `- Opening hours: ${STORE_HOURS}`,
    // One line when calls and WhatsApp go to the same number (as they do now), two when they differ.
    samePhoneAndWhatsapp ? `- Phone and WhatsApp: ${phone}` : `- Phone: ${phone}`,
    whatsappDigits && !samePhoneAndWhatsapp ? `- WhatsApp: +${whatsappDigits}` : null,
    `- Email: ${email}`,
    `- Delivery: countrywide across Kenya; the cost depends on the destination and is confirmed after you order. You can also collect from the shop.`,
    '- Currency: Kenyan shillings (KES)',
    prices.length ? `- Prices: KSh ${Math.round(Math.min(...prices)).toLocaleString('en-KE')} to KSh ${Math.round(Math.max(...prices)).toLocaleString('en-KE')}` : null,
    brands.length ? `- Main brands: ${brands.join(', ')}` : null,
    ...socials.map(([label, url]) => `- ${label}: ${url}`),
    '',
    '## Shop',
    '',
    `- [All products](${absoluteUrl('/shop')}): ${products.length} products currently listed`,
    ...categories
      .filter((c) => c.productCount > 0)
      .map((c) => `- [${c.name}](${absoluteUrl(`/shop/category/${c.slug}`)}): ${c.productCount} products`),
    '',
  ];
  const lines: string[] = head.filter((line): line is string => line !== null);

  const posts = blog.items ?? [];
  if (posts.length) {
    lines.push('## Guides', '');
    for (const post of posts) lines.push(`- [${post.title}](${absoluteUrl(`/blog/${post.slug}`)}): ${oneLine(post.excerpt)}`);
    lines.push('');
  }

  lines.push('## Information', '');
  for (const page of INFORMATION_PAGES) lines.push(`- [${page.title}](${absoluteUrl(page.path)}): ${page.about}`);
  lines.push('');

  if (full) {
    const answered = faqs.filter((f) => f.question?.trim() && f.answer?.trim());
    if (answered.length) {
      lines.push('## Frequently asked questions', '');
      for (const item of answered) lines.push(`### ${item.question!.trim()}`, '', item.answer!.trim(), '');
    }
  }

  lines.push(
    '## For machines',
    '',
    `- [Sitemap](${absoluteUrl('/sitemap.xml')}): every product, category, guide and page`,
    `- [Product feed](${absoluteUrl('/product-feed.xml')}): structured product data with prices and availability`,
    ...(full ? [] : [`- [Full version](${absoluteUrl('/llms-full.txt')}): this file plus every FAQ answer`]),
    '',
  );

  return lines.join('\n');
}

/** Same headers for both files: plain text, cached for an hour (the sources change slowly). */
export function llmsResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600',
    },
  });
}
