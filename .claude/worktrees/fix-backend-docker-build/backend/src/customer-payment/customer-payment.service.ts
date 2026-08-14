import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import { receiptPdfTemplate } from '../pdf/pdf.templates';
import { CreateCustomerPaymentDto } from './dto/create-customer-payment.dto';
import { UpdateCustomerPaymentDto } from './dto/update-customer-payment.dto';
import { ReallocateCustomerPaymentDto } from './dto/reallocate-customer-payment.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

const ROUNDING_TOLERANCE = 0.01;

@Injectable()
export class CustomerPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  private normalizePaymentDate<T extends { paymentDate?: string }>(dto: T) {
    if (!dto.paymentDate) {
      return dto;
    }

    return {
      ...dto,
      paymentDate: new Date(dto.paymentDate),
    };
  }

  private async nextReceiptNumber() {
    const year = new Date().getFullYear();
    const count = await this.prisma.customerPayment.count({
      where: { receiptNumber: { startsWith: `RCT-${year}-` } },
    });
    return `RCT-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async create(dto: CreateCustomerPaymentDto) {
    const receiptNumber = await this.nextReceiptNumber();
    return this.prisma.customerPayment.create({
      data: { ...this.normalizePaymentDate(dto), receiptNumber } as any,
    });
  }

  findAll(pagination: PaginationDto) {
    const { skip, take } = pagination;
    return this.prisma.customerPayment.findMany({ skip, take });
  }

  async findOne(id: string) {
    const payment = await this.prisma.customerPayment.findUnique({
      where: { id },
      include: { contract: { include: { unit: { include: { block: { include: { project: true } } } }, primaryCustomer: true } } },
    });
    if (!payment) {
      throw new NotFoundException(`Customer payment ${id} not found`);
    }
    return payment;
  }

  update(id: string, dto: UpdateCustomerPaymentDto) {
    return this.prisma.customerPayment.update({ where: { id }, data: this.normalizePaymentDate(dto) as any });
  }

  remove(id: string) {
    return this.prisma.customerPayment.delete({ where: { id } });
  }

  /**
   * Moves a payment (or a portion of it) to a different contract, writing
   * a PaymentReallocationAudit record atomically with the move — the audit
   * table previously existed but nothing ever actually reallocated a
   * payment, so it could be populated with claims that didn't match reality.
   */
  async reallocate(id: string, dto: ReallocateCustomerPaymentDto) {
    const payment = await this.prisma.customerPayment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Customer payment ${id} not found`);
    }

    const destinationContract = await this.prisma.salesContract.findUnique({ where: { id: dto.destinationContractId } });
    if (!destinationContract) {
      throw new NotFoundException(`Sales contract ${dto.destinationContractId} not found`);
    }
    if (payment.contractId === dto.destinationContractId) {
      throw new BadRequestException('The payment is already allocated to this contract.');
    }

    const amount = dto.amount ?? Number(payment.amountPaid);
    if (amount - Number(payment.amountPaid) > ROUNDING_TOLERANCE) {
      throw new BadRequestException(`Reallocation amount cannot exceed the payment amount of ${Number(payment.amountPaid).toFixed(2)}.`);
    }

    const sourceContractId = payment.contractId;
    const isFullReallocation = Math.abs(amount - Number(payment.amountPaid)) <= ROUNDING_TOLERANCE;

    return this.prisma.$transaction(async (tx) => {
      let movedPaymentId = payment.id;

      if (isFullReallocation) {
        await tx.customerPayment.update({ where: { id }, data: { contractId: dto.destinationContractId } });
      } else {
        const remaining = Number(payment.amountPaid) - amount;
        await tx.customerPayment.update({ where: { id }, data: { amountPaid: remaining } });

        const receiptNumber = await this.nextReceiptNumber();
        const split = await tx.customerPayment.create({
          data: {
            receiptNumber,
            contractId: dto.destinationContractId,
            amountPaid: amount,
            currency: payment.currency,
            paymentMethod: payment.paymentMethod,
            transactionReference: `${payment.transactionReference}-SPLIT-${Date.now()}`,
            paymentDate: payment.paymentDate,
          },
        });
        movedPaymentId = split.id;
      }

      await tx.paymentReallocationAudit.create({
        data: {
          paymentId: movedPaymentId,
          sourceContractId,
          destinationContractId: dto.destinationContractId,
          reallocatedAmount: amount,
          reason: dto.reason,
          reallocatedBy: dto.reallocatedBy || 'system',
        },
      });

      return tx.customerPayment.findUnique({ where: { id: movedPaymentId } });
    });
  }

  async pdf(id: string): Promise<Buffer> {
    const payment = await this.findOne(id);
    const contract = payment.contract;

    const paidToDate = await this.prisma.customerPayment.aggregate({
      where: { contractId: contract.id },
      _sum: { amountPaid: true },
    });
    const balance = Number(contract.totalAgreedPrice) - Number(paidToDate._sum.amountPaid || 0);

    const html = receiptPdfTemplate({
      receiptNumber: payment.receiptNumber,
      receivedAt: payment.paymentDate,
      amount: Number(payment.amountPaid),
      currency: payment.currency,
      payerName: `${contract.primaryCustomer.firstName} ${contract.primaryCustomer.lastName}`,
      payerEmail: contract.primaryCustomer.email,
      paymentMethod: payment.paymentMethod,
      transactionReference: payment.transactionReference,
      description: `Payment against contract ${contract.contractNumber} — ${contract.unit.block.project.name}, Block ${contract.unit.block.blockName}, Unit ${contract.unit.unitNumber}`,
      balance,
    });
    return this.pdfService.renderPdf(html);
  }
}
