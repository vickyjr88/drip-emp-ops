import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBankReconciliationDto } from './dto/create-bank-reconciliation.dto';

@Injectable()
export class BankReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateBankReconciliationDto) {
    const variance = dto.statementBalance - dto.systemBalance;
    return this.prisma.bankReconciliation.create({
      data: {
        bankAccountId: dto.bankAccountId,
        statementDate: new Date(dto.statementDate),
        statementBalance: dto.statementBalance,
        systemBalance: dto.systemBalance,
        clearedJournalLineIds: dto.clearedJournalLineIds || [],
        status: Math.abs(variance) < 0.01 ? 'COMPLETED' : 'IN_PROGRESS',
      },
    });
  }

  findAll(bankAccountId?: string) {
    return this.prisma.bankReconciliation.findMany({
      where: bankAccountId ? { bankAccountId } : {},
      orderBy: { statementDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.bankReconciliation.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Bank reconciliation ${id} not found`);
    }
    return record;
  }

  async complete(id: string, reconciledBy: string) {
    await this.findOne(id);
    return this.prisma.bankReconciliation.update({
      where: { id },
      data: { status: 'COMPLETED', reconciledBy, reconciledAt: new Date() },
    });
  }
}
