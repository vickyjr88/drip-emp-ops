import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitTransferDto } from './dto/create-unit-transfer.dto';

@Injectable()
export class UnitTransferService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUnitTransferDto) {
    const contract = await this.prisma.salesContract.findUnique({
      where: { id: dto.contractId },
      include: { unit: true, installments: true },
    });
    if (!contract) {
      throw new NotFoundException(`Sales contract ${dto.contractId} not found`);
    }
    if (contract.contractStatus === 'CANCELLED') {
      throw new BadRequestException('Cannot transfer a cancelled contract.');
    }
    if (contract.unitId === dto.toUnitId) {
      throw new BadRequestException('The target unit is the same as the current unit.');
    }

    const toUnit = await this.prisma.unit.findUnique({ where: { id: dto.toUnitId } });
    if (!toUnit) {
      throw new NotFoundException(`Unit ${dto.toUnitId} not found`);
    }
    if (toUnit.status !== 'AVAILABLE') {
      throw new BadRequestException(`Unit ${toUnit.unitNumber} is not available for transfer (status: ${toUnit.status}).`);
    }

    const invoicedCount = contract.installments.filter((installment) => installment.invoiceId).length;
    if (invoicedCount > 0) {
      throw new BadRequestException(
        `${invoicedCount} installment(s) on this contract already have invoices generated. Cancel or settle those invoices before transferring units.`,
      );
    }

    const paidToDate = await this.prisma.customerPayment.aggregate({
      where: { contractId: dto.contractId },
      _sum: { amountPaid: true },
    });
    const paid = Number(paidToDate._sum.amountPaid || 0);

    const fromPrice = Number(contract.totalAgreedPrice);
    const toPrice = Number(contract.currency === 'USD' ? toUnit.priceUsd : toUnit.priceKes);
    const excessAmount = Math.max(paid - toPrice, 0);

    return this.prisma.$transaction(async (tx) => {
      await tx.paymentScheduleInstallment.deleteMany({ where: { contractId: dto.contractId } });

      await tx.salesContract.update({
        where: { id: dto.contractId },
        data: { unitId: dto.toUnitId, totalAgreedPrice: toPrice },
      });

      await tx.unit.update({ where: { id: contract.unitId }, data: { status: 'AVAILABLE' } });
      await tx.unit.update({ where: { id: dto.toUnitId }, data: { status: contract.unit.status === 'RESERVED' ? 'RESERVED' : 'SOLD' } });

      const transfer = await tx.unitTransfer.create({
        data: {
          contractId: dto.contractId,
          fromUnitId: contract.unitId,
          toUnitId: dto.toUnitId,
          fromPrice,
          toPrice,
          paidToDateAtTransfer: paid,
          excessAmount,
          reason: dto.reason,
          transferredBy: dto.transferredBy || 'system',
        },
      });

      await tx.salesContractAmendment.create({
        data: {
          contractId: dto.contractId,
          type: 'UNIT_TRANSFER',
          fieldChanges: {
            unitId: { from: contract.unitId, to: dto.toUnitId },
            totalAgreedPrice: { from: fromPrice, to: toPrice },
          },
          reason: dto.reason,
          amendedBy: dto.transferredBy || 'system',
        },
      });

      return { transfer, excessAmount };
    });
  }

  findAll(params: { contractId?: string }) {
    return this.prisma.unitTransfer.findMany({
      where: params.contractId ? { contractId: params.contractId } : undefined,
      include: { fromUnit: true, toUnit: true },
      orderBy: { transferredAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const transfer = await this.prisma.unitTransfer.findUnique({
      where: { id },
      include: { fromUnit: true, toUnit: true, contract: true },
    });
    if (!transfer) {
      throw new NotFoundException(`Unit transfer ${id} not found`);
    }
    return transfer;
  }
}
