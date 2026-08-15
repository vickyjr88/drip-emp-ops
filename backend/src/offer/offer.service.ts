import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OfferStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfferDto, OfferLineDto, UpdateOfferDto } from './dto/offer.dto';

/** Below this, stock is old enough to be worth clearing. */
const DEAD_STOCK_DAYS = 60;

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stock that is not selling, worst first.
   *
   * "Dead" is days since the last sale, not age of the stock: a pair that
   * arrived a year ago and sells every month is not dead, and one that landed
   * in March and has never moved is. Anything never sold at all is ranked by
   * how long it has been on the shelf instead, which is the same question
   * asked of a variant with no history.
   */
  async deadStock(days = DEAD_STOCK_DAYS) {
    const cutoff = new Date(Date.now() - days * 86400000);

    const levels = await this.prisma.stockLevel.findMany({
      where: { quantity: { gt: 0 } },
      include: {
        store: { select: { id: true, code: true, name: true } },
        variant: {
          include: { product: { select: { id: true, name: true, brand: true, slug: true } } },
        },
      },
    });

    // One query for every variant's last sale, rather than one per row.
    const lastSales = await this.prisma.stockMovement.groupBy({
      by: ['variantId'],
      where: { type: 'SALE' },
      _max: { createdAt: true },
    });
    const lastSaleBy = new Map(lastSales.map((row) => [row.variantId, row._max.createdAt]));

    const rows = levels
      .map((level) => {
        const lastSold = lastSaleBy.get(level.variantId) ?? null;
        const since = lastSold ?? level.variant.createdAt;
        const daysIdle = Math.floor((Date.now() - since.getTime()) / 86400000);
        const cost = level.variant.costKes ? Number(level.variant.costKes) : null;

        return {
          variantId: level.variantId,
          sku: level.variant.sku,
          size: level.variant.name,
          productId: level.variant.product.id,
          productName: level.variant.product.name,
          brand: level.variant.product.brand,
          slug: level.variant.product.slug,
          storeId: level.store.id,
          storeName: level.store.name,
          quantity: level.quantity,
          priceKes: Number(level.variant.priceKes),
          costKes: cost,
          // What is tied up in it. Cost, not retail: this is money the shop
          // has already spent and cannot get back until the stock moves.
          tiedUp: cost === null ? null : round2(cost * level.quantity),
          lastSoldAt: lastSold ? lastSold.toISOString() : null,
          neverSold: !lastSold,
          daysIdle,
          onOffer: false,
        };
      })
      .filter((row) => {
        const idleEnough = row.lastSoldAt
          ? new Date(row.lastSoldAt) < cutoff
          : row.daysIdle >= days;
        return idleEnough;
      })
      .sort((a, b) => (b.tiedUp ?? 0) - (a.tiedUp ?? 0) || b.daysIdle - a.daysIdle);

    // Flag anything already discounted so the shop does not mark it twice.
    const live = await this.activeOfferLines(rows.map((row) => row.variantId));
    for (const row of rows) row.onOffer = live.has(row.variantId);

    return {
      days,
      rows,
      totals: {
        variants: rows.length,
        units: rows.reduce((sum, row) => sum + row.quantity, 0),
        tiedUp: round2(rows.reduce((sum, row) => sum + (row.tiedUp ?? 0), 0)),
        costUnknown: rows.filter((row) => row.tiedUp === null).length,
      },
    };
  }

  /** Variant ids currently discounted by a live offer. */
  private async activeOfferLines(variantIds: string[]) {
    if (!variantIds.length) return new Set<string>();
    const now = new Date();
    const lines = await this.prisma.offerLine.findMany({
      where: {
        variantId: { in: variantIds },
        offer: {
          status: OfferStatus.ACTIVE,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
      },
      select: { variantId: true },
    });
    return new Set(lines.map((line) => line.variantId));
  }

  async create(dto: CreateOfferDto, actor = 'system') {
    const hasPercent = dto.percentOff !== undefined && dto.percentOff !== null;
    const hasFixed = dto.fixedPriceKes !== undefined && dto.fixedPriceKes !== null;
    if (hasPercent === hasFixed) {
      throw new BadRequestException(
        'Give either a percentage off or a fixed price, not both and not neither.',
      );
    }
    if (dto.startsAt && dto.endsAt && new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('The offer would end before it starts.');
    }

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: dto.lines.map((line) => line.variantId) } },
    });
    if (variants.length !== new Set(dto.lines.map((l) => l.variantId)).size) {
      throw new BadRequestException('One or more of those products no longer exists.');
    }

    const priced = dto.lines.map((line) => {
      const variant = variants.find((v) => v.id === line.variantId)!;
      const was = Number(variant.priceKes);
      const price = line.offerPriceKes ?? this.resolvePrice(was, dto);
      if (price >= was) {
        throw new BadRequestException(
          `${variant.sku}: the offer price is not below the current price of ${was}.`,
        );
      }
      return { variantId: variant.id, offerPriceKes: price, wasPriceKes: was, variant };
    });

    // Selling below cost is sometimes the point -- clearing stock beats
    // holding it -- so this warns rather than refuses, and names what.
    const belowCost = priced.filter(
      (line) => line.variant.costKes !== null && line.offerPriceKes < Number(line.variant.costKes),
    );
    if (belowCost.length) {
      this.logger.warn(
        `Offer "${dto.name}" prices ${belowCost.length} item(s) below cost: ${belowCost
          .map((line) => line.variant.sku)
          .join(', ')}`,
      );
    }

    const offer = await this.prisma.offer.create({
      data: {
        name: dto.name,
        label: dto.label,
        percentOff: hasPercent ? new Prisma.Decimal(dto.percentOff!) : null,
        fixedPriceKes: hasFixed ? new Prisma.Decimal(dto.fixedPriceKes!) : null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        notes: dto.notes,
        createdBy: actor,
        lines: {
          create: priced.map((line) => ({
            variantId: line.variantId,
            offerPriceKes: new Prisma.Decimal(line.offerPriceKes),
            wasPriceKes: new Prisma.Decimal(line.wasPriceKes),
          })),
        },
      },
    });

    return this.findOne(offer.id, belowCost.map((line) => line.variant.sku));
  }

  private resolvePrice(retail: number, dto: { percentOff?: number; fixedPriceKes?: number }) {
    if (dto.fixedPriceKes !== undefined && dto.fixedPriceKes !== null) return dto.fixedPriceKes;
    return round2(retail * (1 - (dto.percentOff ?? 0) / 100));
  }

  async findAll(includeEnded = false) {
    const offers = await this.prisma.offer.findMany({
      where: includeEnded ? undefined : { status: { not: OfferStatus.ENDED } },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
    return offers.map((offer) => this.decorate(offer));
  }

  async findOne(id: string, belowCostSkus: string[] = []) {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            variant: {
              select: {
                id: true, sku: true, name: true, costKes: true,
                product: { select: { name: true, brand: true, slug: true } },
              },
            },
          },
        },
      },
    });
    if (!offer) throw new NotFoundException(`Offer ${id} not found`);
    return { ...this.decorate(offer), belowCostSkus };
  }

  async update(id: string, dto: UpdateOfferDto) {
    await this.findOne(id);
    const offer = await this.prisma.offer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
      },
      include: { lines: true },
    });
    return this.decorate(offer);
  }

  /** Adds variants to an existing offer at its current terms. */
  async addLines(id: string, lines: OfferLineDto[]) {
    const offer = await this.prisma.offer.findUnique({ where: { id } });
    if (!offer) throw new NotFoundException(`Offer ${id} not found`);

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: lines.map((line) => line.variantId) } },
    });

    for (const line of lines) {
      const variant = variants.find((v) => v.id === line.variantId);
      if (!variant) continue;
      const was = Number(variant.priceKes);
      const price =
        line.offerPriceKes ??
        this.resolvePrice(was, {
          percentOff: offer.percentOff ? Number(offer.percentOff) : undefined,
          fixedPriceKes: offer.fixedPriceKes ? Number(offer.fixedPriceKes) : undefined,
        });
      if (price >= was) continue;

      await this.prisma.offerLine.upsert({
        where: { offerId_variantId: { offerId: id, variantId: variant.id } },
        create: {
          offerId: id,
          variantId: variant.id,
          offerPriceKes: new Prisma.Decimal(price),
          wasPriceKes: new Prisma.Decimal(was),
        },
        update: {
          offerPriceKes: new Prisma.Decimal(price),
          wasPriceKes: new Prisma.Decimal(was),
        },
      });
    }
    return this.findOne(id);
  }

  async removeLine(id: string, variantId: string) {
    await this.prisma.offerLine.deleteMany({ where: { offerId: id, variantId } });
    return this.findOne(id);
  }

  /**
   * Ends an offer rather than deleting it.
   *
   * Prices a shopper saw are part of the record; a cleared offer would leave
   * an order line at a price nothing explains.
   */
  async end(id: string) {
    await this.findOne(id);
    const offer = await this.prisma.offer.update({
      where: { id },
      data: { status: OfferStatus.ENDED, endsAt: new Date() },
      include: { lines: true },
    });
    return this.decorate(offer);
  }

  private decorate(offer: any) {
    const now = new Date();
    const started = !offer.startsAt || offer.startsAt <= now;
    const notFinished = !offer.endsAt || offer.endsAt >= now;
    const lines = offer.lines || [];

    return {
      ...offer,
      percentOff: offer.percentOff ? Number(offer.percentOff) : null,
      fixedPriceKes: offer.fixedPriceKes ? Number(offer.fixedPriceKes) : null,
      lines: lines.map((line: any) => ({
        ...line,
        offerPriceKes: Number(line.offerPriceKes),
        wasPriceKes: Number(line.wasPriceKes),
        saving: round2(Number(line.wasPriceKes) - Number(line.offerPriceKes)),
      })),
      itemCount: lines.length,
      // Live means published *and* inside its window: a scheduled offer is
      // ACTIVE before it starts, and should not read as running.
      isLive: offer.status === OfferStatus.ACTIVE && started && notFinished,
      // Expiry is derived, so nothing has to run on a timer.
      hasExpired: Boolean(offer.endsAt && offer.endsAt < now),
    };
  }
}
