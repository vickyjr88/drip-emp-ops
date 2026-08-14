import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesPostingService } from '../sales-posting/sales-posting.service';
import { RecordMovementDto } from './dto/stock.dto';

/**
 * Which way each movement pushes the shop-floor count.
 *
 * The consignment types are deliberately absent: they move stock between the
 * floor and the consignment bucket and must go through the consignment
 * service, which writes the paperwork alongside. Recording one by hand here
 * would move the count without a pickup behind it.
 */
const DIRECTION: Partial<Record<StockMovementType, 1 | -1>> = {
  PURCHASE: 1,
  RETURN: 1,
  TRANSFER_IN: 1,
  ADJUSTMENT: 1,
  SALE: -1,
  TRANSFER_OUT: -1,
  DAMAGE: -1,
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: SalesPostingService,
  ) {}

  /**
   * Stock across stores, newest movement first.
   *
   * `sellable` is quantity less what unpaid orders are holding, because the
   * number that matters when someone asks "can I buy this" is not the number
   * on the shelf.
   */
  async levels(query: { storeId?: string; variantId?: string; lowOnly?: string }) {
    const rows = await this.prisma.stockLevel.findMany({
      where: {
        ...(query.storeId ? { storeId: query.storeId } : {}),
        ...(query.variantId ? { variantId: query.variantId } : {}),
      },
      include: {
        store: { select: { id: true, code: true, name: true } },
        variant: {
          select: {
            id: true, sku: true, name: true, priceKes: true,
            product: { select: { id: true, name: true, brand: true } },
          },
        },
      },
      orderBy: [{ store: { name: 'asc' } }, { variant: { sku: 'asc' } }],
    });

    const mapped = rows.map((row) => ({
      ...row,
      sellable: row.quantity - row.reserved,
      needsReorder: row.quantity <= row.reorderAt,
    }));

    return query.lowOnly === 'true' ? mapped.filter((row) => row.needsReorder) : mapped;
  }

  async movements(query: { storeId?: string; variantId?: string; take?: number }) {
    return this.prisma.stockMovement.findMany({
      where: {
        ...(query.storeId ? { storeId: query.storeId } : {}),
        ...(query.variantId ? { variantId: query.variantId } : {}),
      },
      include: {
        store: { select: { id: true, code: true, name: true } },
        variant: { select: { id: true, sku: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.take ? Math.min(Number(query.take), 500) : 100,
    });
  }

  /**
   * Records a movement and moves the running total with it, in one transaction.
   *
   * The movement is the record of what happened; StockLevel.quantity is a
   * cache of their sum, kept so a product list does not have to add up a
   * history per row. Writing one without the other is what makes the two
   * disagree, so they are never written apart.
   */
  async record(dto: RecordMovementDto, actor = 'system', tx?: Prisma.TransactionClient) {
    const run = async (client: Prisma.TransactionClient) => {
      const [variant, store] = await Promise.all([
        client.productVariant.findUnique({ where: { id: dto.variantId } }),
        client.store.findUnique({ where: { id: dto.storeId } }),
      ]);
      if (!variant) throw new NotFoundException(`Variant ${dto.variantId} not found`);
      if (!store) throw new NotFoundException(`Store ${dto.storeId} not found`);

      const direction = DIRECTION[dto.type];
      if (!direction) {
        throw new BadRequestException(
          `${dto.type} is recorded by issuing or settling a consignment, not as a manual movement.`,
        );
      }
      const delta = direction * dto.quantity;

      const level = await client.stockLevel.findUnique({
        where: { variantId_storeId: { variantId: dto.variantId, storeId: dto.storeId } },
      });
      const current = level?.quantity ?? 0;

      // Stock is never allowed below zero: a negative count is always a
      // mis-keyed movement, and letting it through hides the mistake.
      if (current + delta < 0) {
        throw new BadRequestException(
          `Only ${current} in stock at ${store.name}; cannot remove ${dto.quantity}.`,
        );
      }

      await client.stockMovement.create({
        data: {
          variantId: dto.variantId,
          storeId: dto.storeId,
          type: dto.type,
          quantity: delta,
          reference: dto.reference,
          notes: dto.notes,
          createdBy: actor,
        },
      });

      const updated = await client.stockLevel.upsert({
        where: { variantId_storeId: { variantId: dto.variantId, storeId: dto.storeId } },
        create: { variantId: dto.variantId, storeId: dto.storeId, quantity: delta },
        update: { quantity: { increment: delta } },
      });

      // Stock arriving is an asset gained and owed for; stock damaged is a
      // loss. Both belong in the ledger, and neither has an order behind it.
      if (dto.type === 'PURCHASE') {
        await this.posting.postStockReceipt(
          { variantId: dto.variantId, storeId: dto.storeId, quantity: dto.quantity,
            reference: dto.reference || 'Stock received' },
          client,
        );
      } else if (dto.type === 'DAMAGE') {
        await this.posting.postShrinkage(
          { variantId: dto.variantId, storeId: dto.storeId, quantity: dto.quantity,
            reference: dto.reference || 'Damage', reason: dto.notes || 'damaged stock' },
          client,
        );
      }

      return updated;
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  async setReorderLevel(variantId: string, storeId: string, reorderAt: number) {
    return this.prisma.stockLevel.upsert({
      where: { variantId_storeId: { variantId, storeId } },
      create: { variantId, storeId, reorderAt },
      update: { reorderAt },
    });
  }
}
