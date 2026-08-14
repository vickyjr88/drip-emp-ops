import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PettyCashBoxService } from '../petty-cash-box/petty-cash-box.service';
import { CreatePettyCashReconciliationDto } from './dto/create-petty-cash-reconciliation.dto';

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

  findAll(boxId?: string) {
    return this.prisma.pettyCashReconciliation.findMany({
      where: boxId ? { boxId } : {},
      orderBy: { periodEnd: 'desc' },
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.pettyCashReconciliation.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Petty cash reconciliation ${id} not found`);
    }
    return record;
  }
}
