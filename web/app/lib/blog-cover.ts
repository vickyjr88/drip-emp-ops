import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Cover for a post. A picture uploaded in the portal wins. Otherwise a file shipped at
 * public/images/blog/<slug>.jpg is used, so the live posts can show a cover without a database write.
 * Downloaded photographs keep their licence credit; pictures made for the shop have none.
 */

export type BlogCoverCredit = {
  author: string;
  authorUrl: string;
  fileUrl: string;
  license: string;
  licenseUrl: string;
};

export type BlogCover = {
  src: string;
  credit: BlogCoverCredit | null;
};

const BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/';

const CREDITS: Record<string, BlogCoverCredit> = {
  'sneaker-shops-ronald-ngala-street-nairobi': {
    author: 'Bahnfrend',
    authorUrl: 'https://commons.wikimedia.org/wiki/User:Bahnfrend',
    fileUrl: 'https://commons.wikimedia.org/wiki/File:Ronald_Ngala_Street,_2025_(01).jpg',
    license: 'CC BY-SA 4.0',
    licenseUrl: BY_SA,
  },
  'sneaker-size-guide-kenya': {
    author: 'Ser Amantio di Nicolao',
    authorUrl: 'https://commons.wikimedia.org/wiki/User:Ser_Amantio_di_Nicolao',
    fileUrl: 'https://commons.wikimedia.org/wiki/File:Overhead_view_of_a_Brannock_device,_J.C._Penney_store,_Springfield_Town_Center.jpg',
    license: 'CC BY-SA 4.0',
    licenseUrl: BY_SA,
  },
  'ladies-shoes-buying-guide': {
    author: 'Б.Раданова',
    authorUrl: 'https://commons.wikimedia.org/wiki/File:Sandals_(7).jpg',
    fileUrl: 'https://commons.wikimedia.org/wiki/File:Sandals_(7).jpg',
    license: 'CC BY-SA 4.0',
    licenseUrl: BY_SA,
  },
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function blogCover(slug: string, coverImageUrl: string | null | undefined): BlogCover | null {
  const uploaded = coverImageUrl?.trim();
  if (uploaded) return { src: uploaded, credit: null };
  if (!SLUG.test(slug)) return null;
  const file = path.join(process.cwd(), 'public', 'images', 'blog', `${slug}.jpg`);
  if (!existsSync(file)) return null;
  return { src: `/images/blog/${slug}.jpg`, credit: CREDITS[slug] ?? null };
}
