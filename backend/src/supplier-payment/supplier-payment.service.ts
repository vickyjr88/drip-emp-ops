import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountPurpose, JournalSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { AccountResolverService } from '../ledger/account-resolver.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { SupplierPaymentQueryDto } from './dto/supplier-payment-query.dto';
import { nextReference } from '../common/next-reference';
import { containsAny, paginate, searchOr } from '../common/pagination.util';

const ROUNDING_TOLERANCE = 0.01;

@Injectable()
export class SupplierPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly accountResolver: AccountResolverService,
  ) {}

  private async nextPaymentNumber() {
    return nextReference(this.prisma.supplierPayment, 'paymentNumber', 'SP');
  }

  private async invoiceOutstanding(supplierInvoiceId: string, tx: any) {
    const invoice = await tx.supplierInvoice.findUnique({
      where: { id: supplierInvoiceId },
      include: { payments: true },
    });
    if (!invoice) {
      throw new NotFoundException(`Supplier invoice ${supplierInvoiceId} not found`);
    }
    const paidSoFar = invoice.payments.reduce((sum: number, allocation: any) => sum + Number(allocation.allocatedAmount), 0);
    return { invoice, outstanding: Number(invoice.amount) - paidSoFar };
  }

  async stage(dto: CreateSupplierPaymentDto) {
    const totalAllocated = dto.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    const paymentNumber = await this.nextPaymentNumber();
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${dto.supplierId} not found`);
    }
    const whtRateId = dto.whtRateId ?? supplier.defaultWhtRateId ?? undefined;
    const whtRate = whtRateId ? await this.prisma.taxRate.findUnique({ where: { id: whtRateId } }) : null;
    const whtAmount = whtRate ? totalAllocated * Number(whtRate.rate) : 0;

    return this.prisma.$transaction(async (tx) => {
      for (const allocation of dto.allocations) {
        const { invoice, outstanding } = await this.invoiceOutstanding(allocation.supplierInvoiceId, tx);
        if (invoice.status !== 'APPROVED' && invoice.status !== 'STAGED') {
          throw new BadRequestException(`Supplier invoice ${invoice.invoiceNumber} must be approved before it can be paid.`);
        }
        if (allocation.amount - outstanding > ROUNDING_TOLERANCE) {
          throw new BadRequestException(
            `Allocation of ${allocation.amount} exceeds outstanding balance ${outstanding.toFixed(2)} on invoice ${invoice.invoiceNumber}.`,
          );
        }
      }

      const payment = await tx.supplierPayment.create({
        data: {
          paymentNumber,
          supplierId: dto.supplierId,
          bankAccountId: dto.bankAccountId,
          whtRateId,
          whtAmount,
          amount: totalAllocated,
          currency: dto.currency || 'KES',
          status: 'STAGED',
          stagedBy: dto.stagedBy || 'system',
          allocations: {
            create: dto.allocations.map((allocation) => ({
              supplierInvoiceId: allocation.supplierInvoiceId,
              allocatedAmount: allocation.amount,
            })),
          },
        },
        include: { allocations: true },
      });

      for (const allocation of dto.allocations) {
        await tx.supplierInvoice.update({ where: { id: allocation.supplierInvoiceId }, data: { status: 'STAGED' } });
      }

      return payment;
    });
  }

  findAll(query: SupplierPaymentQueryDto) {
    const { skip, take, search, supplierId, status } = query;
    const where: Prisma.SupplierPaymentWhereInput = {
      ...(supplierId ? { supplierId } : {}),
      ...(status ? { status: status as any } : {}),
      ...searchOr(search, (term) => containsAny(['paymentNumber', 'supplier.name'], term)),
    };
    return paginate(
      (args) =>
        this.prisma.supplierPayment.findMany({
          where,
          include: { allocations: { include: { supplierInvoice: true } } },
          orderBy: [{ stagedAt: 'desc' }, { id: 'asc' }],
          ...args,
        }),
      () => this.prisma.supplierPayment.count({ where }),
      skip,
      take,
    );
  }

  async findOne(id: string) {
    const payment = await this.prisma.supplierPayment.findUnique({
      where: { id },
      include: { allocations: { include: { supplierInvoice: true } }, supplier: true },
    });
    if (!payment) {
      throw new NotFoundException(`Supplier payment ${id} not found`);
    }
    return payment;
  }

  async approve(id: string, approvedBy: string) {
    const payment = await this.findOne(id);
    if (payment.status !== 'STAGED') {
      throw new BadRequestException('Only staged payments can be approved.');
    }
    return this.prisma.supplierPayment.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy, approvedAt: new Date() },
    });
  }

  async release(id: string) {
    const payment = await this.findOne(id);
    if (payment.status !== 'APPROVED') {
      throw new BadRequestException('Only approved payments can be released for payment.');
    }

    const apAccount = await this.ledger.getAccountByCode(DEFAULT_ACCOUNT_CODES.ACCOUNTS_PAYABLE);

    const projectIds = new Set(
      payment.allocations.map((allocation) => allocation.supplierInvoice.storeId).filter((id): id is string => !!id),
    );
    const storeId = projectIds.size === 1 ? [...projectIds][0] : undefined;

    const bankAccount = await this.accountResolver.resolveBankAccount(
      AccountPurpose.SUPPLIER_PAYMENTS,
      storeId,
      payment.bankAccountId,
    );

    const whtAmount = Number(payment.whtAmount || 0);
    const netCashOut = Number(payment.amount) - whtAmount;
    const lines = [
      { accountId: apAccount.id, debit: Number(payment.amount), currencyCode: payment.currency, storeId },
      { accountId: bankAccount.glAccountId, credit: netCashOut, currencyCode: payment.currency, storeId },
    ];
    if (whtAmount > 0 && payment.whtRateId) {
      const whtRate = await this.prisma.taxRate.findUnique({ where: { id: payment.whtRateId } });
      if (whtRate) {
        lines.push({ accountId: whtRate.glAccountId, credit: whtAmount, currencyCode: payment.currency, storeId });
      }
    }

    const journal = await this.ledger.postJournal({
      memo: `Supplier payment ${payment.paymentNumber} to ${payment.supplier.name}`,
      source: JournalSource.AP,
      sourceId: payment.id,
      lines,
    });

    return this.prisma.$transaction(async (tx) => {
      for (const allocation of payment.allocations) {
        const { outstanding } = await this.invoiceOutstanding(allocation.supplierInvoiceId, tx);
        await tx.supplierInvoice.update({
          where: { id: allocation.supplierInvoiceId },
          data: { status: outstanding <= ROUNDING_TOLERANCE ? 'PAID' : 'APPROVED' },
        });
      }

      return tx.supplierPayment.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date(), journalEntryId: journal.id, bankAccountId: bankAccount.id },
      });
    });
  }

  async cancel(id: string) {
    const payment = await this.findOne(id);
    if (payment.status === 'PAID') {
      throw new BadRequestException('Cannot cancel a payment that has already been released.');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const allocation of payment.allocations) {
        await tx.supplierInvoice.update({ where: { id: allocation.supplierInvoiceId }, data: { status: 'APPROVED' } });
      }
      return tx.supplierPayment.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
  }
}
