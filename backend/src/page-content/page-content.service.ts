import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_CONTENT,
  IMAGE_SLOTS,
  PAGE_LABELS,
  PAGE_SLUGS,
  PageSlug,
} from './page-content.defaults';

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Fills gaps in `stored` from `defaults`, recursing into nested objects.
 *
 * Arrays are taken wholesale from the stored document rather than merged
 * element-wise: an editor who deletes the third service card means to have two
 * cards, and a positional merge would silently resurrect the removed one.
 */
function mergeWithDefaults(defaults: any, stored: any): any {
  if (stored === undefined || stored === null) {
    return defaults;
  }

  if (!isPlainObject(defaults) || !isPlainObject(stored)) {
    return stored;
  }

  const merged: Record<string, any> = { ...defaults };
  for (const key of Object.keys(stored)) {
    merged[key] = mergeWithDefaults(defaults[key], stored[key]);
  }
  return merged;
}

@Injectable()
export class PageContentService {
  constructor(private readonly prisma: PrismaService) {}

  private assertSlug(slug: string): PageSlug {
    if (!(PAGE_SLUGS as readonly string[]).includes(slug)) {
      throw new BadRequestException(
        `Unknown page "${slug}". Editable pages are: ${PAGE_SLUGS.join(', ')}.`,
      );
    }
    return slug as PageSlug;
  }

  /** Slugs, labels and image-slot guidance, for building the editor UI. */
  listPages() {
    return PAGE_SLUGS.map((slug) => ({
      slug,
      label: PAGE_LABELS[slug],
      imageSlots: IMAGE_SLOTS[slug],
    }));
  }

  /**
   * Always returns a complete document: stored values layered over the built-in
   * defaults. A page that has never been edited still renders real copy.
   */
  async findOne(slug: string) {
    const pageSlug = this.assertSlug(slug);
    const record = await this.prisma.pageContent.findUnique({ where: { slug: pageSlug } });

    return {
      slug: pageSlug,
      label: PAGE_LABELS[pageSlug],
      imageSlots: IMAGE_SLOTS[pageSlug],
      content: mergeWithDefaults(DEFAULT_CONTENT[pageSlug], record?.content ?? null),
      isCustomised: Boolean(record),
      updatedAt: record?.updatedAt ?? null,
      updatedBy: record?.updatedBy ?? null,
    };
  }

  async findAll() {
    return Promise.all(PAGE_SLUGS.map((slug) => this.findOne(slug)));
  }

  async upsert(slug: string, content: unknown, updatedBy?: string) {
    const pageSlug = this.assertSlug(slug);
    if (!isPlainObject(content)) {
      throw new BadRequestException('content must be an object.');
    }

    await this.prisma.pageContent.upsert({
      where: { slug: pageSlug },
      update: { content: content as any, updatedBy: updatedBy || 'system' },
      create: { slug: pageSlug, content: content as any, updatedBy: updatedBy || 'system' },
    });

    return this.findOne(pageSlug);
  }

  /** Drops customisations so the page reverts to the built-in copy. */
  async reset(slug: string) {
    const pageSlug = this.assertSlug(slug);
    await this.prisma.pageContent.deleteMany({ where: { slug: pageSlug } });
    return this.findOne(pageSlug);
  }
}
