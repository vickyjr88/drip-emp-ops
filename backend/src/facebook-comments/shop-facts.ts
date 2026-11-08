import { Logger } from '@nestjs/common';
import { PageContentService } from '../page-content/page-content.service';
import { DEFAULT_LOCATION, DEFAULT_SITE_URL } from './facebook-comments';

/** The website address used in what the shop posts: the setting, else the storefront's own address (never a local one), else the live site. */
export const siteUrl = () => {
  const own = process.env.STOREFRONT_ORIGIN || '';
  const candidate = process.env.FACEBOOK_REPLY_SITE_URL || (/localhost|127\.0\.0\.1/.test(own) ? '' : own) || DEFAULT_SITE_URL;
  return candidate.replace(/\/+$/, '');
};

/**
 * The facts the shop puts in what it posts and replies on Facebook: the WhatsApp link, the Page address and the shop's location.
 * Read from Site content, which staff edit, unless a setting overrides them.
 */
export async function shopFacts(pages: PageContentService, pageId: string, logger?: Logger) {
  let whatsapp = (process.env.FACEBOOK_REPLY_WHATSAPP || '').replace(/\D/g, '');
  let page = process.env.FACEBOOK_PAGE_URL || '';
  let location = process.env.FACEBOOK_REPLY_LOCATION || '';
  if (!whatsapp || !page || !location) {
    try {
      const [header, footer] = await Promise.all([pages.findOne('header'), pages.findOne('footer')]);
      if (!whatsapp) whatsapp = String((header.content as any)?.enquiries?.whatsapp ?? '').replace(/\D/g, '');
      if (!page) page = String((footer.content as any)?.social?.facebook ?? '');
      if (!location) location = String((footer.content as any)?.contact?.address ?? '').trim();
    } catch (error) {
      logger?.warn(`Could not read the site content: ${(error as Error).message}`);
    }
  }
  return {
    whatsapp: whatsapp ? `https://wa.me/${whatsapp}` : '',
    page: page || `https://www.facebook.com/${pageId}`,
    location: location || DEFAULT_LOCATION,
    site: siteUrl(),
  };
}
