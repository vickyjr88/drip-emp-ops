import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { CreateStoreAccountAssignmentDto } from './dto/account-assignment.dto';

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateStoreDto) {
    return this.prisma.store.create({ data: dto });
  }

  findAll(includeInactive = false) {
    return this.prisma.store.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException(`Store ${id} not found`);
    return store;
  }

  async update(id: string, dto: UpdateStoreDto) {
    await this.findOne(id);
    return this.prisma.store.update({ where: { id }, data: dto });
  }

  /**
   * Stores are closed rather than deleted once they hold anything.
   *
   * An order or a ledger line names the store it happened at, so removing one
   * would either orphan that history or take it with it. Deactivating keeps
   * last year's figures readable while the store stops appearing in pickers.
   */
  async remove(id: string) {
    await this.findOne(id);
    const [orders, movements, lines] = await Promise.all([
      this.prisma.order.count({ where: { storeId: id } }),
      this.prisma.stockMovement.count({ where: { storeId: id } }),
      this.prisma.journalLine.count({ where: { storeId: id } }),
    ]);

    if (orders + movements + lines > 0) {
      throw new BadRequestException(
        `This store has ${orders} order(s), ${movements} stock movement(s) and ${lines} ledger line(s). ` +
          'Deactivate it instead so the history stays intact.',
      );
    }

    return this.prisma.store.delete({ where: { id } });
  }

  /** Headline figures for one store: what is on hand and what has sold. */
  async summary(id: string) {
    await this.findOne(id);
    const [stock, orders, revenue, lowStock] = await Promise.all([
      this.prisma.stockLevel.aggregate({ where: { storeId: id }, _sum: { quantity: true } }),
      this.prisma.order.count({ where: { storeId: id } }),
      this.prisma.order.aggregate({
        where: { storeId: id, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
        _sum: { total: true },
      }),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "StockLevel"
        WHERE "storeId" = ${id} AND "quantity" <= "reorderAt"
      `,
    ]);

    return {
      unitsOnHand: stock._sum.quantity ?? 0,
      orderCount: orders,
      revenue: Number(revenue._sum.total ?? 0),
      needsReorder: Number(lowStock[0]?.count ?? 0),
    };
  }
  /*
   * Per-store bank routing.
   *
   * AccountResolverService already reads these when deciding which bank
   * account a receipt or supplier payment lands in, but nothing could create
   * them: the model outlived its controller. Without this the resolver always
   * fell through to the default Cash and Bank account, so a shop could not
   * bank its own takings separately.
   */

  listAccountAssignments(storeId: string) {
    return this.prisma.storeAccountAssignment.findMany({
      where: { storeId },
      include: { bankAccount: { include: { glAccount: true } } },
      orderBy: { purpose: 'asc' },
    });
  }

  async createAccountAssignment(storeId: string, dto: CreateStoreAccountAssignmentDto) {
    const [store, bankAccount] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId } }),
      this.prisma.bankAccount.findUnique({ where: { id: dto.bankAccountId } }),
    ]);
    if (!store) throw new NotFoundException('Store not found');
    if (!bankAccount) throw new NotFoundException('Bank account not found');

    // One account per purpose per store, so re-assigning replaces rather than
    // erroring -- the screen offers a picker, not an append.
    return this.prisma.storeAccountAssignment.upsert({
      where: { storeId_purpose: { storeId, purpose: dto.purpose } },
      create: { storeId, purpose: dto.purpose, bankAccountId: dto.bankAccountId },
      update: { bankAccountId: dto.bankAccountId },
      include: { bankAccount: { include: { glAccount: true } } },
    });
  }

  async removeAccountAssignment(storeId: string, id: string) {
    const existing = await this.prisma.storeAccountAssignment.findUnique({ where: { id } });
    if (!existing || existing.storeId !== storeId) {
      throw new NotFoundException('Assignment not found for this store');
    }
    await this.prisma.storeAccountAssignment.delete({ where: { id } });
    return { id };
  }
}
