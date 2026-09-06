import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination.util';
import { CreateBlogPostDto, UpdateBlogPostDto } from './dto/blog-post.dto';
import { BlogPostQueryDto } from './dto/blog-post-query.dto';

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertSlugFree(slug: string, excludeId?: string) {
    const existing = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`A post already uses the slug "${slug}".`);
    }
  }

  async create(dto: CreateBlogPostDto) {
    const slug = dto.slug.trim().toLowerCase();
    await this.assertSlugFree(slug);

    return this.prisma.blogPost.create({
      data: {
        title: dto.title.trim(),
        slug,
        excerpt: dto.excerpt.trim(),
        body: dto.body,
        coverImageUrl: dto.coverImageUrl?.trim() || null,
        author: dto.author?.trim() || undefined,
        publishedAt: dto.publish ? new Date() : null,
      },
    });
  }

  /** Staff listing: every post, drafts included by default. */
  async findAll(query: BlogPostQueryDto) {
    const { skip, take, search } = query;
    const where: Prisma.BlogPostWhereInput = search?.trim()
      ? {
          OR: [
            { title: { contains: search.trim(), mode: 'insensitive' } },
            { slug: { contains: search.trim(), mode: 'insensitive' } },
          ],
        }
      : {};

    return paginate(
      (args) => this.prisma.blogPost.findMany({ ...args, where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }),
      () => this.prisma.blogPost.count({ where }),
      skip,
      take,
    );
  }

  /** Public listing: published posts only, newest first. */
  async findPublished({ skip = 0, take = 25 }: { skip?: number; take?: number } = {}) {
    const where: Prisma.BlogPostWhereInput = { publishedAt: { not: null } };
    return paginate(
      (args) => this.prisma.blogPost.findMany({ ...args, where, orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }] }),
      () => this.prisma.blogPost.count({ where }),
      skip,
      take,
    );
  }

  async findOne(id: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return post;
  }

  /** Public read by slug -- a draft is treated as not found, same as a
   *  nonexistent slug, so an unpublished URL never confirms its own existence. */
  async findPublishedBySlug(slug: string) {
    return this.prisma.blogPost.findFirst({ where: { slug, publishedAt: { not: null } } });
  }

  async update(id: string, dto: UpdateBlogPostDto) {
    const post = await this.findOne(id);
    const nextSlug = dto.slug ? dto.slug.trim().toLowerCase() : undefined;
    if (nextSlug) await this.assertSlugFree(nextSlug, id);

    return this.prisma.blogPost.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
        ...(dto.excerpt !== undefined ? { excerpt: dto.excerpt.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.coverImageUrl !== undefined ? { coverImageUrl: dto.coverImageUrl.trim() || null } : {}),
        ...(dto.author !== undefined ? { author: dto.author.trim() || 'Drip Emporium' } : {}),
        ...(dto.publish !== undefined
          ? { publishedAt: dto.publish ? post.publishedAt ?? new Date() : null }
          : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.blogPost.delete({ where: { id } });
    return { success: true };
  }
}
