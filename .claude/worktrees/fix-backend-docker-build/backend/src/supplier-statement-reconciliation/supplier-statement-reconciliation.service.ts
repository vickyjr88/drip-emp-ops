import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierStatementReconciliationDto } from './dto/create-supplier-statement-reconciliation.dto';

@Injectable()
export class SupplierStatementReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierStatementReconciliationDto) {
    let systemTotal = dto.systemTotal;
    if (systemTotal === undefined) {
      const paidInvoices = await this.prisma.supplierPayment.findMany({
        where: {
          supplierId: dto.supplierId,
          status: 'PAID',
          paidAt: { gte: new Date(dto.periodStart), lte: new Date(dto.periodEnd) },
        },
      });
      systemTotal = paidInvoices.reduce((sum, payment) => sum + Number(payment.amount), 0);
    }

    const variance = dto.statementTotal - systemTotal;

    return this.prisma.supplierStatementReconciliation.create({
      data: {
        supplierId: dto.supplierId,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        statementTotal: dto.statementTotal,
        systemTotal,
        variance,
        notes: dto.notes,
        status: Math.abs(variance) < 0.01 ? 'COMPLETED' : 'IN_PROGRESS',
      },
    });
  }

  findAll(supplierId?: string) {
    return this.prisma.supplierStatementReconciliation.findMany({
      where: supplierId ? { supplierId } : {},
      orderBy: { periodEnd: 'desc' },
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.supplierStatementReconciliation.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Supplier statement reconciliation ${id} not found`);
    }
    return record;
  }

  async complete(id: string, reconciledBy: string) {
    await this.findOne(id);
    return this.prisma.supplierStatementReconciliation.update({
      where: { id },
      data: { status: 'COMPLETED', reconciledBy, reconciledAt: new Date() },
    });
  }
}
