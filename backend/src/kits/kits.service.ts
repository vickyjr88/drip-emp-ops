import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PriceTier, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import sharp from 'sharp';
import type { Metadata } from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorefrontService } from '../storefront/storefront.service';
import { PageContentService } from '../page-content/page-content.service';
import { MediaService } from '../media/media.service';
import {
  CLUB_SEEDS, DEFAULT_PRINT_PRICING, KIT_FONTS, KIT_PATTERNS, KIT_TEMPLATES, KIT_TEMPLATE_KEYS, KIT_VIEWBOX, KitColors,
  PrintPricing, TEE_PALETTE, editionsFor, fontKeysFor,
} from './kit-catalogue';
import { DesignSpec, cleanDesign, describeDesign, isPersonalised, printFee } from './kit-design';
import { CreateKitDto, UpdateClubDto, UpdateKitDto } from './dto/kits.dto';
import { KitsFlagService } from './kits.flag';

const KITS_CATEGORY_SLUG = 'kits';
const SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL'];

/** Reads a fee typed in the CMS: whole shillings, never negative; anything else falls back to the built-in default. */
export function parsePrintPricing(content: any): PrintPricing {
  const read = (value: unknown, fallback: number) => {
    const text = String(value ?? '');
    // "KES 900" and "1,000" are fine; text with no digit in it, or a negative number, is not a fee.
    if (!/\d/.test(text) || /-\s*\d/.test(text)) return fallback;
    const n = Number(text.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
  };
  const print = content?.print ?? {};
  return {
    nameFeeKes: read(print.nameFee, DEFAULT_PRINT_PRICING.nameFeeKes),
    numberFeeKes: read(print.numberFee, DEFAULT_PRINT_PRICING.numberFeeKes),
    nameAndNumberFeeKes: read(print.nameAndNumberFee, DEFAULT_PRINT_PRICING.nameAndNumberFeeKes),
    artworkFeeKes: read(print.artworkFee, DEFAULT_PRINT_PRICING.artworkFeeKes),
    textFeeKes: read(print.textFee, DEFAULT_PRINT_PRICING.textFeeKes),
  };
}

const slugify = (value: string) =>
  value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const KIT_INCLUDE = {
  kit: { include: { club: true } },
  category: { select: { name: true, slug: true, attributes: { select: { key: true, label: true } }, parent: { select: { name: true, slug: true } } } },
  variants: { orderBy: { name: 'asc' } },
} satisfies Prisma.ProductInclude;

type KitProductRow = Prisma.ProductGetPayload<{ include: typeof KIT_INCLUDE }>;

@Injectable()
export class KitsService implements OnModuleInit {
  private readonly logger = new Logger(KitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storefront: StorefrontService,
    private readonly pageContent: PageContentService,
    private readonly media: MediaService,
    readonly flag: KitsFlagService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureSeed();
    } catch (error) {
      // The tables may not exist yet (migration pending); the line is off by default, so this is not fatal.
      this.logger.warn(`Kits seed skipped: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** Creates the Kits category (with its size picker) and the starter clubs, only where they are missing. */
  async ensureSeed() {
    const category = await this.prisma.productCategory.upsert({
      where: { slug: KITS_CATEGORY_SLUG },
      update: {},
      create: { name: 'Kits and T-shirts', slug: KITS_CATEGORY_SLUG, description: 'Jerseys and custom T-shirts', isActive: true },
    });
    const hasSize = await this.prisma.categoryAttribute.findFirst({ where: { categoryId: category.id, key: 'size' } });
    if (!hasSize) {
      await this.prisma.categoryAttribute.create({ data: { categoryId: category.id, key: 'size', label: 'Size', options: SIZES, sortOrder: 0 } });
    }

    const existing = new Set((await this.prisma.kitClub.findMany({ select: { slug: true } })).map((c) => c.slug));
    const missing = CLUB_SEEDS.map((seed, index) => ({ seed, index })).filter(({ seed }) => !existing.has(seed.slug));
    if (missing.length) {
      await this.prisma.kitClub.createMany({
        data: missing.map(({ seed, index }) => {
          const editions = editionsFor(seed.home);
          return {
            slug: seed.slug,
            name: seed.name,
            aliases: seed.aliases,
            league: seed.league,
            home: editions.home as unknown as Prisma.InputJsonValue,
            away: editions.away as unknown as Prisma.InputJsonValue,
            third: editions.third as unknown as Prisma.InputJsonValue,
            fontKeys: fontKeysFor(index),
            sortOrder: index,
          };
        }),
        skipDuplicates: true,
      });
      this.logger.log(`Kits: added ${missing.length} starter club(s)`);
    }
  }

  // -------------------------------------------------------------------------
  // Settings visible to the public site
  // -------------------------------------------------------------------------

  async pricing(): Promise<PrintPricing> {
    return parsePrintPricing((await this.pageContent.findOne('kits')).content);
  }

  async config() {
    const [content, enabled] = await Promise.all([this.pageContent.findOne('kits'), this.flag.isEnabled()]);
    const c = content.content;
    return {
      enabled,
      fonts: KIT_FONTS.map(({ key, label, family, fontsource, weight }) => ({ key, label, family, fontsource, weight })),
      templates: KIT_TEMPLATES,
      patterns: KIT_PATTERNS,
      teePalette: TEE_PALETTE,
      viewBox: KIT_VIEWBOX,
      pricing: parsePrintPricing(c),
      leadTime: c.leadTime,
      returnsNote: c.returnsNote,
      fanVersionNote: c.fanVersionNote,
      listing: c.listing,
      designCenter: c.designCenter,
    };
  }

  // -------------------------------------------------------------------------
  // Public catalogue
  // -------------------------------------------------------------------------

  /** The colours the design center starts from for this kit. */
  private coloursOf(row: KitProductRow): KitColors {
    const kit = row.kit!;
    if (kit.club) {
      const edition = kit.edition === 'AWAY' ? kit.club.away : kit.edition === 'THIRD' ? kit.club.third : kit.club.home;
      return edition as unknown as KitColors;
    }
    return (kit.colors as unknown as KitColors | null) ?? { primary: '#f5f5f2', secondary: '#161616', trim: '#161616', pattern: 'solid', sleeves: 'primary' };
  }

  private async shapeKits(rows: KitProductRow[], user?: { priceTier?: PriceTier }) {
    const shaped = await this.storefront.shapeProducts(rows, user);
    return shaped.map((product, i) => {
      const row = rows[i];
      const kit = row.kit!;
      return {
        ...product,
        kit: {
          kind: kit.kind,
          club: kit.club ? { slug: kit.club.slug, name: kit.club.name, league: kit.club.league } : null,
          season: kit.season,
          edition: kit.edition,
          templateKey: kit.templateKey,
          colors: this.coloursOf(row),
          allowName: kit.allowName,
          allowNumber: kit.allowNumber,
          allowArtwork: kit.allowArtwork,
          photoFront: kit.photoFront,
          photoBack: kit.photoBack,
          printAreas: kit.printAreas,
          fontKeys: kit.club?.fontKeys ?? [],
        },
      };
    });
  }

  async list(
    query: { kind?: string; league?: string; club?: string; size?: string; search?: string; minPrice?: string; maxPrice?: string; inStockOnly?: string; sort?: string },
    user?: { priceTier?: PriceTier },
  ) {
    const phrase = (query.search ?? '').trim().toLowerCase();
    const words = phrase.split(/\s+/).filter(Boolean);
    const where: Prisma.ProductWhereInput = {
      line: 'KIT',
      isActive: true,
      kit: {
        is: {
          ...(query.kind === 'JERSEY' || query.kind === 'TSHIRT' ? { kind: query.kind } : {}),
          ...(query.club || query.league
            ? { club: { is: { isActive: true, ...(query.club ? { slug: query.club } : {}), ...(query.league ? { league: query.league } : {}) } } }
            : {}),
        },
      },
      ...(query.size ? { variants: { some: { isActive: true, attributes: { path: ['size'], equals: query.size } } } } : {}),
      // Every search word must match something: the name, the club's name or one of its nicknames, the brand or the
      // description. A club nickname ("man u", "gunners", "spurs") is matched whole as well as word by word.
      ...(words.length
        ? {
            AND: words.map((word) => ({
              OR: [
                { name: { contains: word, mode: 'insensitive' as const } },
                { description: { contains: word, mode: 'insensitive' as const } },
                { kit: { is: { club: { is: { name: { contains: word, mode: 'insensitive' as const } } } } } },
                { kit: { is: { club: { is: { aliases: { has: word } } } } } },
                { kit: { is: { club: { is: { aliases: { has: phrase } } } } } },
                { variants: { some: { isActive: true, sku: { contains: word, mode: 'insensitive' as const } } } },
              ],
            })),
          }
        : {}),
    };

    const rows = await this.prisma.product.findMany({ where, include: KIT_INCLUDE, orderBy: { createdAt: 'desc' } });
    let shaped = await this.shapeKits(rows, user);

    if (query.minPrice) shaped = shaped.filter((p) => p.priceTo >= Number(query.minPrice));
    if (query.maxPrice) shaped = shaped.filter((p) => p.priceFrom <= Number(query.maxPrice));
    if (query.inStockOnly === 'true') shaped = shaped.filter((p) => p.anyInStock);

    const bySort: Record<string, (a: any, b: any) => number> = {
      'price-asc': (a, b) => a.priceFrom - b.priceFrom,
      'price-desc': (a, b) => b.priceFrom - a.priceFrom,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    const comparator = bySort[query.sort || ''] || (() => 0);
    shaped.sort((a, b) => comparator(a, b));
    return shaped;
  }

  async bySlug(slug: string, user?: { priceTier?: PriceTier }) {
    const row = await this.prisma.product.findFirst({ where: { slug, line: 'KIT', isActive: true }, include: KIT_INCLUDE });
    if (!row || !row.kit) throw new NotFoundException(`No kit at "${slug}"`);
    const [shaped] = await this.shapeKits([row], user);

    const clubId = row.kit.clubId;
    const related = await this.prisma.product.findMany({
      where: {
        line: 'KIT',
        isActive: true,
        id: { not: row.id },
        kit: { is: clubId ? { clubId } : { kind: row.kit.kind } },
      },
      include: KIT_INCLUDE,
      take: 6,
      orderBy: { createdAt: 'desc' },
    });
    return { ...shaped, related: await this.shapeKits(related, user) };
  }

  /** Clubs worth showing: with at least one kit on sale, or (for the design center) every active club. */
  async clubs(options: { all?: boolean } = {}) {
    const clubs = await this.prisma.kitClub.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { kits: { where: { product: { isActive: true, line: 'KIT' } }, select: { id: true } } },
    });
    return clubs
      .map((club) => ({
        slug: club.slug,
        name: club.name,
        aliases: club.aliases,
        league: club.league,
        home: club.home,
        away: club.away,
        third: club.third,
        fontKeys: club.fontKeys,
        kitCount: club.kits.length,
      }))
      .filter((club) => options.all || club.kitCount > 0);
  }

  async clubPage(slug: string, user?: { priceTier?: PriceTier }) {
    const club = await this.prisma.kitClub.findFirst({ where: { slug, isActive: true } });
    if (!club) throw new NotFoundException('No such club');
    const rows = await this.prisma.product.findMany({
      where: { line: 'KIT', isActive: true, kit: { is: { clubId: club.id } } },
      include: KIT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const sameLeague = await this.prisma.kitClub.findMany({
      where: { isActive: true, league: club.league, id: { not: club.id } },
      orderBy: [{ sortOrder: 'asc' }],
      take: 12,
      select: { slug: true, name: true },
    });
    return {
      club: { slug: club.slug, name: club.name, aliases: club.aliases, league: club.league, home: club.home, away: club.away, third: club.third, fontKeys: club.fontKeys },
      products: await this.shapeKits(rows, user),
      relatedClubs: sameLeague,
    };
  }

  // -------------------------------------------------------------------------
  // Designs (public: a shopper need not sign in)
  // -------------------------------------------------------------------------

  /** Validates a design for a kit, prices it and stores it. The stored copy is the cleaned one, never the raw request. */
  async saveDesign(productSlug: string, rawSpec: unknown) {
    const row = await this.prisma.product.findFirst({ where: { slug: productSlug, line: 'KIT', isActive: true }, include: { kit: true } });
    if (!row?.kit) throw new NotFoundException('That shirt is not available.');
    const spec = cleanDesign({ ...(rawSpec as object), productSlug }, row.kit);
    const fee = printFee(spec, await this.pricing());
    const design = await this.prisma.kitDesign.create({
      data: { token: randomBytes(12).toString('base64url'), productSlug, spec: spec as unknown as Prisma.InputJsonValue },
    });
    return { token: design.token, feeKes: fee, personalised: isPersonalised(spec), spec };
  }

  /**
   * For checkout: the saved design for this shirt, re-validated under today's rules and priced under today's fees.
   * Refused when the line is off, the design is for a different shirt, or it no longer passes the shirt's rules.
   */
  async designForCheckout(token: string, productId: string) {
    if (!(await this.flag.isEnabled())) throw new BadRequestException('Personalised shirts are not available right now.');
    const design = await this.prisma.kitDesign.findUnique({ where: { token } });
    if (!design) throw new NotFoundException('That design was not found. Please design the shirt again.');
    const product = await this.prisma.product.findFirst({ where: { id: productId, line: 'KIT', isActive: true }, include: { kit: true } });
    if (!product?.kit) throw new BadRequestException('That item cannot be personalised.');
    if (design.productSlug !== product.slug) throw new BadRequestException('That design was made for a different shirt.');
    const spec = cleanDesign(design.spec, product.kit);
    return { designId: design.id, spec, fee: printFee(spec, await this.pricing()) };
  }

  async getDesign(token: string) {
    const design = await this.prisma.kitDesign.findUnique({ where: { token } });
    if (!design) throw new NotFoundException('That design was not found.');
    const spec = design.spec as unknown as DesignSpec;
    return {
      token: design.token,
      productSlug: design.productSlug,
      spec,
      previewUrl: design.previewUrl,
      feeKes: printFee(spec, await this.pricing()),
    };
  }

  /** Re-encodes an uploaded picture to a bounded PNG. Anything sharp cannot read, and SVG, is refused. */
  private async normaliseImage(buffer: Buffer, maxSide: number): Promise<{ data: Buffer; width: number; height: number }> {
    let meta: Metadata;
    try {
      meta = await sharp(buffer, { limitInputPixels: 50_000_000 }).metadata();
    } catch {
      throw new BadRequestException('That file is not a picture we can read. Use a PNG, JPEG, WebP or GIF image.');
    }
    if (!meta.format || !['jpeg', 'png', 'webp', 'gif', 'avif', 'heif'].includes(meta.format)) {
      throw new BadRequestException('Use a PNG, JPEG, WebP or GIF image.');
    }
    const out = await sharp(buffer, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height };
  }

  /** Artwork a shopper places on a shirt. Stored as a document (never listed in the media library), always PNG. */
  async uploadArtwork(file: { buffer: Buffer }) {
    const image = await this.normaliseImage(file.buffer, 2400);
    const stored = await this.media.uploadProjectAsset(
      { originalname: 'kit-artwork.png', mimetype: 'image/png', buffer: image.data },
      { purpose: 'DOCUMENT', uploadedBy: 'kits-design-center' },
    );
    return { url: stored.url, width: image.width, height: image.height };
  }

  /** The picture of the finished shirt the browser drew. Attached once; a design is not altered after it is saved. */
  async attachPreview(token: string, file: { buffer: Buffer }) {
    const design = await this.prisma.kitDesign.findUnique({ where: { token } });
    if (!design) throw new NotFoundException('That design was not found.');
    if (design.previewUrl) throw new BadRequestException('This design already has a preview.');
    const image = await this.normaliseImage(file.buffer, 1400);
    const stored = await this.media.uploadProjectAsset(
      { originalname: 'kit-preview.png', mimetype: 'image/png', buffer: image.data },
      { purpose: 'DOCUMENT', uploadedBy: 'kits-design-center' },
    );
    await this.prisma.kitDesign.update({ where: { id: design.id }, data: { previewUrl: stored.url } });
    return { previewUrl: stored.url };
  }

  // -------------------------------------------------------------------------
  // Staff (portal)
  // -------------------------------------------------------------------------

  async adminList() {
    const rows = await this.prisma.product.findMany({ where: { line: 'KIT' }, include: KIT_INCLUDE, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      sku: row.sku,
      isActive: row.isActive,
      isFeatured: row.isFeatured,
      imageUrls: row.imageUrls,
      kit: row.kit
        ? {
            kind: row.kit.kind,
            club: row.kit.club ? { slug: row.kit.club.slug, name: row.kit.club.name } : null,
            season: row.kit.season,
            edition: row.kit.edition,
            templateKey: row.kit.templateKey,
            allowName: row.kit.allowName,
            allowNumber: row.kit.allowNumber,
            allowArtwork: row.kit.allowArtwork,
          }
        : null,
      variants: row.variants.map((v) => ({ id: v.id, sku: v.sku, name: v.name, priceKes: Number(v.priceKes), isActive: v.isActive, isDropShip: v.isDropShip })),
    }));
  }

  private async clubIdFor(slug: string | null | undefined): Promise<string | null> {
    if (!slug) return null;
    const club = await this.prisma.kitClub.findUnique({ where: { slug } });
    if (!club) throw new BadRequestException(`No club "${slug}".`);
    return club.id;
  }

  private assertTemplate(kind: 'JERSEY' | 'TSHIRT', templateKey: string) {
    const template = KIT_TEMPLATES.find((t) => t.key === templateKey);
    if (!template || !KIT_TEMPLATE_KEYS.includes(templateKey)) throw new BadRequestException('Unknown shirt template.');
    if (template.kind !== kind) throw new BadRequestException(`That template is for a ${template.kind === 'JERSEY' ? 'jersey' : 'T-shirt'}.`);
  }

  private async uniqueSlug(base: string, ignoreId?: string) {
    const root = slugify(base) || 'kit';
    let candidate = root;
    for (let n = 2; ; n++) {
      const clash = await this.prisma.product.findFirst({ where: { slug: candidate, ...(ignoreId ? { id: { not: ignoreId } } : {}) }, select: { id: true } });
      if (!clash) return candidate;
      candidate = `${root}-${n}`;
    }
  }

  async adminCreate(dto: CreateKitDto) {
    this.assertTemplate(dto.kind, dto.templateKey);
    const clubId = await this.clubIdFor(dto.clubSlug);
    const category = await this.prisma.productCategory.findUnique({ where: { slug: KITS_CATEGORY_SLUG } });
    const prefix = (dto.skuPrefix || slugify(dto.name)).toUpperCase().replace(/-+/g, '-').slice(0, 40);
    const images = dto.imageUrls?.filter(Boolean) ?? [];

    try {
      const created = await this.prisma.product.create({
        data: {
          line: 'KIT',
          sku: prefix,
          name: dto.name,
          slug: await this.uniqueSlug(dto.slug || dto.name),
          description: dto.description,
          brand: null,
          categoryId: category?.id,
          imageUrls: images as unknown as Prisma.InputJsonValue,
          featuredImageUrl: images[0],
          isActive: dto.isActive ?? true,
          variants: {
            create: dto.sizes.map((size) => ({
              sku: `${prefix}-${size.size.toUpperCase().replace(/[^A-Z0-9]+/g, '')}`,
              name: size.size,
              attributes: { size: size.size },
              priceKes: new Prisma.Decimal(size.priceKes),
              ...(size.costKes !== undefined ? { costKes: new Prisma.Decimal(size.costKes) } : {}),
              isDropShip: size.isDropShip ?? false,
            })),
          },
          kit: {
            create: {
              kind: dto.kind,
              clubId,
              season: dto.season,
              edition: dto.edition ?? 'NONE',
              templateKey: dto.templateKey,
              colors: (dto.colors ?? undefined) as Prisma.InputJsonValue | undefined,
              photoFront: dto.photoFront,
              photoBack: dto.photoBack,
              printAreas: (dto.printAreas ?? undefined) as Prisma.InputJsonValue | undefined,
              allowName: dto.allowName ?? dto.kind === 'JERSEY',
              allowNumber: dto.allowNumber ?? dto.kind === 'JERSEY',
              allowArtwork: dto.allowArtwork ?? dto.kind === 'TSHIRT',
            },
          },
        },
        include: KIT_INCLUDE,
      });
      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('A product with that SKU already exists. Use a different SKU prefix.');
      }
      throw error;
    }
  }

  async adminUpdate(id: string, dto: UpdateKitDto) {
    const row = await this.prisma.product.findFirst({ where: { id, line: 'KIT' }, include: { kit: true } });
    if (!row?.kit) throw new NotFoundException('Kit not found');
    if (dto.templateKey) this.assertTemplate(row.kit.kind, dto.templateKey);
    const clubId = dto.clubSlug === undefined ? undefined : await this.clubIdFor(dto.clubSlug);
    const images = dto.imageUrls?.filter(Boolean);

    await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(images ? { imageUrls: images as unknown as Prisma.InputJsonValue, featuredImageUrl: images[0] ?? null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
        kit: {
          update: {
            ...(clubId !== undefined ? { clubId } : {}),
            ...(dto.season !== undefined ? { season: dto.season } : {}),
            ...(dto.edition !== undefined ? { edition: dto.edition } : {}),
            ...(dto.templateKey !== undefined ? { templateKey: dto.templateKey } : {}),
            ...(dto.colors !== undefined ? { colors: (dto.colors ?? Prisma.DbNull) as Prisma.InputJsonValue } : {}),
            ...(dto.allowName !== undefined ? { allowName: dto.allowName } : {}),
            ...(dto.allowNumber !== undefined ? { allowNumber: dto.allowNumber } : {}),
            ...(dto.allowArtwork !== undefined ? { allowArtwork: dto.allowArtwork } : {}),
            ...(dto.photoFront !== undefined ? { photoFront: dto.photoFront } : {}),
            ...(dto.photoBack !== undefined ? { photoBack: dto.photoBack } : {}),
            ...(dto.printAreas !== undefined ? { printAreas: (dto.printAreas ?? Prisma.DbNull) as Prisma.InputJsonValue } : {}),
          },
        },
      },
    });
    return (await this.adminList()).find((kit) => kit.id === id);
  }

  async adminClubs() {
    const clubs = await this.prisma.kitClub.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { kits: true } } },
    });
    return clubs.map((club) => ({ ...club, kitCount: club._count.kits, _count: undefined }));
  }

  async adminUpdateClub(slug: string, dto: UpdateClubDto) {
    const club = await this.prisma.kitClub.findUnique({ where: { slug } });
    if (!club) throw new NotFoundException('Club not found');
    if (dto.fontKeys && dto.fontKeys.some((key) => !KIT_FONTS.some((font) => font.key === key))) {
      throw new BadRequestException('Unknown font.');
    }
    return this.prisma.kitClub.update({
      where: { slug },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.aliases !== undefined ? { aliases: dto.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean) } : {}),
        ...(dto.fontKeys !== undefined ? { fontKeys: dto.fontKeys } : {}),
        ...(dto.home ? { home: dto.home as Prisma.InputJsonValue } : {}),
        ...(dto.away ? { away: dto.away as Prisma.InputJsonValue } : {}),
        ...(dto.third ? { third: dto.third as Prisma.InputJsonValue } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  /** Every personalised order line, newest first, for the print queue. */
  async printQueue(status?: string) {
    const lines = await this.prisma.orderLine.findMany({
      where: { designId: { not: null }, ...(status ? { printStatus: status as any } : {}), order: { status: { not: 'CANCELLED' } } },
      include: { order: { select: { orderNumber: true, customerName: true, customerPhone: true, placedAt: true, status: true } }, design: true },
      orderBy: { order: { placedAt: 'desc' } },
      take: 300,
    });
    return lines.map((line) => {
      const spec = (line.customisation ?? line.design?.spec) as unknown as DesignSpec | null;
      return {
        id: line.id,
        orderNumber: line.order.orderNumber,
        orderStatus: line.order.status,
        customerName: line.order.customerName,
        customerPhone: line.order.customerPhone,
        placedAt: line.order.placedAt,
        description: line.description,
        quantity: line.quantity,
        printFee: Number(line.printFee),
        printStatus: line.printStatus,
        printNotes: line.printNotes,
        designToken: line.design?.token ?? null,
        previewUrl: line.design?.previewUrl ?? null,
        summary: spec ? describeDesign(spec) : '',
        spec,
      };
    });
  }

  async setPrintStatus(lineId: string, status: 'AWAITING_REVIEW' | 'APPROVED' | 'PRINTED' | 'READY', notes?: string) {
    const line = await this.prisma.orderLine.findUnique({ where: { id: lineId } });
    if (!line || !line.designId) throw new NotFoundException('That order line has no design.');
    return this.prisma.orderLine.update({ where: { id: lineId }, data: { printStatus: status, ...(notes !== undefined ? { printNotes: notes } : {}) } });
  }
}
