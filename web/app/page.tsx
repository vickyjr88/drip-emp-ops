import type { Metadata } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from './lib/site';
import { seoMetadata } from './lib/page-metadata';
import { contentValue, fetchPageContent } from './lib/page-content';
import HomeClient from './home-client';

/**
 * Server wrapper for the home page. The page itself is interactive (search,
 * carousels), but title, description and structured data must be server-
 * rendered or a crawler sees an empty shell.
 */

export async function generateMetadata(): Promise<Metadata> {
  const content = await fetchPageContent('home');
  // No title: home uses the layout's default rather than the "%s | Brand"
  // template, so it reads as the site rather than a section of it.
  return seoMetadata({
    key: 'home',
    path: '/',
    description: SITE_DESCRIPTION,
    shareTitle: `${SITE_NAME} | Quality Affordable Sneakers & Streetwear in Nairobi`,
    image: contentValue(content, 'hero.backgroundImage', ''),
  });
}

export default function HomePage() {
  // FAQPage structured data lives on /faq, not here -- it's sourced from the
  // same content a visitor actually sees there, so an assistant quoting an
  // answer links to the page that contains it rather than a duplicate that
  // could drift out of sync.
  return <HomeClient />;
}
