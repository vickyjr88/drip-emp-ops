import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { paymentSchedulePdfTemplate, salesContractPdfTemplate } from '../pdf/pdf.templates';
import { CreateSalesContractDto } from './dto/create-sales-contract.dto';
import { UpdateSalesContractDto } from './dto/update-sales-contract.dto';
import { UpsertPaymentScheduleDto } from './dto/upsert-payment-schedule.dto';
import { GeneratePaymentScheduleDto, PaymentFrequency } from './dto/generate-payment-schedule.dto';
import { CancelSalesContractDto } from './dto/cancel-sales-contract.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

const MONTHS_PER_PERIOD: Record<PaymentFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUALLY: 6,
  ANNUALLY: 12,
};

const CONTRACT_DETAIL_INCLUDE = {
  unit: { include: { block: { include: { project: true } } } },
  primaryCustomer: true,
  installments: { orderBy: { sequence: 'asc' as const } },
};

@Injectable()
export class SalesContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  create(dto: CreateSalesContractDto) {
    return this.prisma.salesContract.create({ data: dto as any });
  }

  findAll(pagination: PaginationDto) {
    const { skip, take } = pagination;
    return this.prisma.salesContract.findMany({ skip, take, include: CONTRACT_DETAIL_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const contract = await this.prisma.salesContract.findUnique({ where: { id }, include: CONTRACT_DETAIL_INCLUDE });
    if (!contract) {
      throw new NotFoundException(`Sales contract ${id} not found`);
    }
    return contract;
  }

  private async paidToDate(contractId: string) {
    const result = await this.prisma.customerPayment.aggregate({
      where: { contractId },
      _sum: { amountPaid: true },
    });
    return Number(result._sum.amountPaid || 0);
  }

  async paymentSummary(contractId: string) {
    const contract = await this.findOne(contractId);
    const totalAgreedPrice = Number(contract.totalAgreedPrice);
    const paid = await this.paidToDate(contractId);
    const balance = Math.max(totalAgreedPrice - paid, 0);
    const paidPercent = totalAgreedPrice > 0 ? Math.min((paid / totalAgreedPrice) * 100, 100) : 0;

    return { contractId, totalAgreedPrice, paid, balance, paidPercent };
  }

  async update(id: string, dto: UpdateSalesContractDto) {
    const existing = await this.findOne(id);

    const fieldChanges: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of ['totalAgreedPrice', 'currency', 'contractStatus', 'unitId', 'primaryCustomerId'] as const) {
      const nextValue = (dto as any)[key];
      if (nextValue === undefined) continue;
      const currentValue = key === 'totalAgreedPrice' ? Number(existing[key]) : (existing as any)[key];
      const comparableNext = key === 'totalAgreedPrice' ? Number(nextValue) : nextValue;
      if (comparableNext !== currentValue) {
        fieldChanges[key] = { from: currentValue, to: comparableNext };
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.salesContract.update({ where: { id }, data: dto as any });

      if (Object.keys(fieldChanges).length > 0) {
        await tx.salesContractAmendment.create({
          data: {
            contractId: id,
            type: 'MANUAL_EDIT',
            fieldChanges: fieldChanges as any,
            amendedBy: 'system',
          },
        });
      }

      return updated;
    });
  }

  remove(id: string) {
    return this.prisma.salesContract.delete({ where: { id } });
  }

  getAmendments(contractId: string) {
    return this.prisma.salesContractAmendment.findMany({
      where: { contractId },
      orderBy: { amendedAt: 'desc' },
    });
  }

  async cancel(id: string, dto: CancelSalesContractDto) {
    const contract = await this.prisma.salesContract.findUnique({
      where: { id },
      include: { unit: { include: { block: { include: { project: true } } } } },
    });
    if (!contract) {
      throw new NotFoundException(`Sales contract ${id} not found`);
    }
    if (contract.contractStatus === 'CANCELLED') {
      throw new BadRequestException('This contract is already cancelled.');
    }

    const paidToDate = await this.paidToDate(id);
    const rate = dto.cancellationChargeRate ?? Number(contract.unit.block.project.defaultCancellationChargeRate);
    const cancellationCharge = Math.round(paidToDate * rate * 100) / 100;
    const refundableAmount = Math.round((paidToDate - cancellationCharge) * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      await tx.paymentScheduleInstallment.deleteMany({ where: { contractId: id, invoiceId: null } });

      const updated = await tx.salesContract.update({
        where: { id },
        data: {
          contractStatus: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledReason: dto.reason,
          cancelledBy: dto.cancelledBy || 'system',
          cancellationChargeRate: rate,
          cancellationCharge,
        },
      });

      await tx.unit.update({ where: { id: contract.unitId }, data: { status: 'AVAILABLE' } });

      await tx.salesContractAmendment.create({
        data: {
          contractId: id,
          type: 'CANCELLATION',
          fieldChanges: {
            contractStatus: { from: contract.contractStatus, to: 'CANCELLED' },
            paidToDate,
            cancellationChargeRate: rate,
            cancellationCharge,
            refundableAmount,
          },
          reason: dto.reason,
          amendedBy: dto.cancelledBy || 'system',
        },
      });

      return { contract: updated, paidToDate, cancellationChargeRate: rate, cancellationCharge, refundableAmount };
    });
  }

  getPaymentSchedule(contractId: string) {
    return this.prisma.paymentScheduleInstallment.findMany({
      where: { contractId },
      orderBy: { sequence: 'asc' },
    });
  }

  async upsertPaymentSchedule(contractId: string, dto: UpsertPaymentScheduleDto) {
    await this.findOne(contractId);

    const invoicedCount = await this.prisma.paymentScheduleInstallment.count({
      where: { contractId, invoiceId: { not: null } },
    });
    if (invoicedCount > 0) {
      throw new BadRequestException(
        `${invoicedCount} installment(s) on this schedule already have invoices generated. Remove those invoices first, or edit the schedule before generating invoices.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.paymentScheduleInstallment.deleteMany({ where: { contractId } });
      await tx.paymentScheduleInstallment.createMany({
        data: dto.installments.map((installment, index) => ({
          contractId,
          sequence: index + 1,
          dueDate: new Date(installment.dueDate),
          amount: installment.amount,
        })),
      });
      return tx.paymentScheduleInstallment.findMany({ where: { contractId }, orderBy: { sequence: 'asc' } });
    });
  }

  async generatePaymentSchedule(contractId: string, dto: GeneratePaymentScheduleDto) {
    const contract = await this.findOne(contractId);
    const totalAgreedPrice = Number(contract.totalAgreedPrice);
    const paid = await this.paidToDate(contractId);
    const outstanding = Math.max(totalAgreedPrice - paid, 0);

    if (outstanding <= 0) {
      throw new BadRequestException(
        `This contract is already paid in full (${paid.toFixed(2)} of ${totalAgreedPrice.toFixed(2)}) — there is nothing left to schedule.`,
      );
    }

    const monthsPerPeriod = MONTHS_PER_PERIOD[dto.frequency];
    const numberOfInstallments = Math.max(1, Math.round(dto.durationMonths / monthsPerPeriod));

    const depositAmount = dto.depositAmount ? Number(dto.depositAmount) : 0;
    if (depositAmount < 0 || depositAmount > outstanding) {
      throw new BadRequestException(
        `Deposit amount must be between 0 and the outstanding balance of ${outstanding.toFixed(2)} (${paid.toFixed(2)} already paid against a total of ${totalAgreedPrice.toFixed(2)}).`,
      );
    }

    const remaining = outstanding - depositAmount;
    const baseInstallmentAmount = Math.floor((remaining / numberOfInstallments) * 100) / 100;
    const roundingRemainder = Math.round((remaining - baseInstallmentAmount * numberOfInstallments) * 100) / 100;

    const startDate = new Date(dto.startDate);
    const installments: { dueDate: string; amount: number }[] = [];

    if (depositAmount > 0) {
      installments.push({ dueDate: startDate.toISOString().slice(0, 10), amount: depositAmount });
    }

    for (let index = 0; index < numberOfInstallments; index += 1) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + monthsPerPeriod * (index + 1));
      const isLast = index === numberOfInstallments - 1;
      installments.push({
        dueDate: dueDate.toISOString().slice(0, 10),
        amount: isLast ? baseInstallmentAmount + roundingRemainder : baseInstallmentAmount,
      });
    }

    return { installments, paid, outstanding, totalAgreedPrice };
  }

  async paymentSchedulePdf(contractId: string): Promise<Buffer> {
    const contract = await this.findOne(contractId);
    const summary = await this.paymentSummary(contractId);
    const html = paymentSchedulePdfTemplate({
      contractNumber: contract.contractNumber,
      customerName: `${contract.primaryCustomer.firstName} ${contract.primaryCustomer.lastName}`,
      unitLabel: `${contract.unit.block.project.name} — Block ${contract.unit.block.blockName}, Unit ${contract.unit.unitNumber}`,
      currency: contract.currency,
      totalAgreedPrice: Number(contract.totalAgreedPrice),
      generatedAt: new Date(),
      installments: contract.installments.map((installment) => ({
        sequence: installment.sequence,
        dueDate: installment.dueDate,
        amount: Number(installment.amount),
        invoiced: Boolean(installment.invoiceId),
      })),
      paid: summary.paid,
      balance: summary.balance,
      paidPercent: summary.paidPercent,
    });
    return this.pdfService.renderPdf(html);
  }

  async contractPdf(contractId: string): Promise<Buffer> {
    const contract = await this.findOne(contractId);
    const summary = await this.paymentSummary(contractId);
    const html = salesContractPdfTemplate({
      contractNumber: contract.contractNumber,
      contractStatus: contract.contractStatus,
      createdAt: contract.createdAt,
      customerName: `${contract.primaryCustomer.firstName} ${contract.primaryCustomer.lastName}`,
      customerEmail: contract.primaryCustomer.email,
      customerPhone: contract.primaryCustomer.phone,
      unitLabel: `${contract.unit.block.project.name} — Block ${contract.unit.block.blockName}, Unit ${contract.unit.unitNumber}`,
      currency: contract.currency,
      totalAgreedPrice: Number(contract.totalAgreedPrice),
      installments: contract.installments.map((installment) => ({
        sequence: installment.sequence,
        dueDate: installment.dueDate,
        amount: Number(installment.amount),
        invoiced: Boolean(installment.invoiceId),
      })),
      paid: summary.paid,
      balance: summary.balance,
      paidPercent: summary.paidPercent,
    });
    return this.pdfService.renderPdf(html);
  }
}
