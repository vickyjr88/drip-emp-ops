import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PettyCashBoxService } from '../petty-cash-box/petty-cash-box.service';
import { CreatePettyCashReconciliationDto } from './dto/create-petty-cash-reconciliation.dto';
import { PettyCashReconciliationQueryDto } from './dto/petty-cash-reconciliation-query.dto';
import { paginate } from '../common/pagination.util';

@Injectable()
export class PettyCashReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boxService: PettyCashBoxService,
  ) {}

  async create(dto: CreatePettyCashReconciliationDto) {
    const { balance: expectedBalance } = await this.boxService.currentBalance(dto.boxId);
    const variance = dto.countedBalance - expectedBalance;

    return this.prisma.pettyCashReconciliation.create({
      data: {
        boxId: dto.boxId,
        periodEnd: new Date(dto.periodEnd),
        expectedBalance,
        countedBalance: dto.countedBalance,
        variance,
        notes: dto.notes,
        reconciledBy: dto.reconciledBy || 'system',
      },
    });
  }

  findAll(query: PettyCashReconciliationQueryDto) {
    const { skip, take, boxId } = query;
    const where: Prisma.PettyCashReconciliationWhereInput = boxId ? { boxId } : {};
    return paginate(
      (args) =>
        this.prisma.pettyCashReconciliation.findMany({ where, orderBy: [{ periodEnd: 'desc' }, { id: 'asc' }], ...args }),
      () => this.prisma.pettyCashReconciliation.count({ where }),
      skip,
      take,
    );
  }

  async findOne(id: string) {
    const record = await this.prisma.pettyCashReconciliation.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Petty cash reconciliation ${id} not found`);
    }
    return record;
  }
}
