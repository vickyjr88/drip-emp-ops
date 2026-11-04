/** One image in the media library, as the API returns it (see backend MediaService.view). */
export type MediaItem = {
  id: string;
  objectKey: string;
  url: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  /** When the picture last changed. A crop keeps the image's address, so this is what tells a browser to refetch. */
  updatedAt: string;
  /** True once the image has been cropped: the previous version exists and can be restored. */
  hasPreviousVersion: boolean;
};

export type MediaLibraryPage = { items: MediaItem[]; nextCursor: string | null; total: number };

export function formatBytes(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The identity of an image in a stored URL: the host a URL was written with can differ, the object key cannot. */
export function objectKeyOf(url: string): string {
  const match = /\/media\/([^/?#]+)/.exec(url || '');
  return match ? match[1] : url;
}

/**
 * The address to DISPLAY an image from. Cropping keeps an image's address, so a browser may still hold the old
 * picture; the version marker makes it fetch the new one. Never store this: what is saved in a product, page or post is
 * the plain `url`, which always serves the current picture.
 */
export function freshUrl(item: Pick<MediaItem, 'url' | 'updatedAt'>): string {
  const stamp = Date.parse(item.updatedAt);
  return Number.isFinite(stamp) ? `${item.url}?v=${stamp}` : item.url;
}
