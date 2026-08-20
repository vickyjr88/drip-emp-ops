/**
 * Page titles and meta descriptions, editable from the CMS.
 *
 * Every marketing page previously wrote its description out three times -- for
 * the meta tag, the Open Graph card and the Twitter card -- so changing the
 * copy meant editing three strings in three places and any one of them could
 * be missed. They are one entry here instead, and the share cards fall back to
 * the page description unless they are deliberately given their own.
 *
 * Stored under the "seo" CMS document, keyed by page. Each page passes the
 * copy compiled into it as the fallback, so search results are unchanged until
 * someone edits them, and a page still describes itself correctly if the API
 * is unreachable.
 */

import type { Metadata } from 'next';
import { contentValue, fetchPageContent } from './page-content';
import { previewFor } from './preview-image';

export type SeoDefaults = {
  /** Slugged into the CMS document, e.g. "about". */
  key: string;
  /** Canonical path for this page, e.g. "/about". */
  path: string;
  /**
   * Browser and search-result title. The root layout appends the brand, so
   * this should not repeat it. Blank means "use the layout's default title",
   * which is what the home page wants.
   */
  title?: string;
  description: string;
  /** Share-card title when it should differ; usually it carries the brand. */
  shareTitle?: string;
  /** Share-card description when it should differ from the meta description. */
  shareDescription?: string;
  /**
   * The page's own share image (e.g. a hero background), when it has one.
   * Takes priority over the borrowed-from-portfolio fallback in previewFor.
   */
  image?: string | null;
};

/**
 * Builds a page's Metadata from CMS values, falling back to what it shipped.
 *
 * Returns the same shape every page assembled by hand, so the only change at
 * the call site is which strings it names.
 */
export async function seoMetadata(defaults: SeoDefaults): Promise<Metadata> {
  const [content, preview] = await Promise.all([
    fetchPageContent('seo'),
    previewFor(defaults.path, defaults.image),
  ]);

  const base = `${defaults.key}.`;
  const title = contentValue(content, `${base}title`, defaults.title ?? '');
  const description = contentValue(content, `${base}description`, defaults.description);
  // Share copy defaults to the page's own: a card that repeats the meta
  // description is right far more often than one left blank.
  const shareTitle = contentValue(content, `${base}shareTitle`, defaults.shareTitle ?? title);
  const shareDescription = contentValue(
    content,
    `${base}shareDescription`,
    defaults.shareDescription ?? description,
  );

  return {
    // Omitted rather than set empty, so the home page keeps the root layout's
    // default title instead of rendering the bare brand template.
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: defaults.path },
    openGraph: {
      ...preview,
      ...(shareTitle ? { title: shareTitle } : {}),
      description: shareDescription,
    },
    twitter: {
      card: preview.images ? 'summary_large_image' : 'summary',
      ...(shareTitle ? { title: shareTitle } : {}),
      description: shareDescription,
      images: preview.images?.map((image) => image.url),
    },
  };
}
