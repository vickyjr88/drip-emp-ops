import { BadRequestException } from '@nestjs/common';

/**
 * A tap on a share button, as the Share page reports it. Pure, so what is accepted can be tested: the endpoint takes a few short words from a browser and
 * stores nothing else, so anything unknown is refused rather than kept.
 */

/** whatsapp, facebook, x and telegram open that app's share screen; `share` is the phone's own share sheet; `link` is a copied address; `download` is a picture saved to send by hand. */
export const SHARE_EVENT_CHANNELS = ['whatsapp', 'facebook', 'x', 'telegram', 'share', 'link', 'download'] as const;
export type ShareEventChannel = (typeof SHARE_EVENT_CHANNELS)[number];

/** PRODUCT: a search result's link. PICTURE: a status picture for a product. KIT: an item of the day's Status kit. */
export const SHARE_EVENT_KINDS = ['PRODUCT', 'PICTURE', 'KIT'] as const;
export type ShareEventKind = (typeof SHARE_EVENT_KINDS)[number];

const SLUG = /^[a-z0-9][a-z0-9-]{0,118}$/i;

export type CleanShareEvent = { channel: ShareEventChannel; kind: ShareEventKind; productSlug: string | null };

export function cleanShareEvent(body: unknown): CleanShareEvent {
  const b = (body ?? {}) as Record<string, unknown>;
  const channel = typeof b.channel === 'string' ? b.channel.trim().toLowerCase() : '';
  const kind = typeof b.kind === 'string' ? b.kind.trim().toUpperCase() : 'PRODUCT';
  if (!(SHARE_EVENT_CHANNELS as readonly string[]).includes(channel)) throw new BadRequestException('Unknown share channel.');
  if (!(SHARE_EVENT_KINDS as readonly string[]).includes(kind)) throw new BadRequestException('Unknown kind of share.');
  let productSlug: string | null = null;
  if (b.productSlug !== undefined && b.productSlug !== null && b.productSlug !== '') {
    const slug = typeof b.productSlug === 'string' ? b.productSlug.trim() : '';
    if (!SLUG.test(slug)) throw new BadRequestException('That product address is not valid.');
    productSlug = slug.toLowerCase();
  }
  return { channel: channel as ShareEventChannel, kind: kind as ShareEventKind, productSlug };
}
