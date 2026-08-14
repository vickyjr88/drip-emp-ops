import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountPurpose, InvoiceSourceType, JournalSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { AccountResolverService } from '../ledger/account-resolver.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';
import { PdfService } from '../pdf/pdf.service';
import { receiptPdfTemplate } from '../pdf/pdf.templates';
import { AllocateReceiptDto, CancelReceiptDto, CreateReceiptDto } from './dto/create-receipt.dto';

const PURPOSE_BY_SOURCE_TYPE: Record<InvoiceSourceType, AccountPurpose> = {
  SALES_CONTRACT: AccountPurpose.SALES,
  TENANCY: AccountPurpose.RENT,
  MANUAL: AccountPurpose.GENERAL,
};

const ROUNDING_TOLERANCE = 0.01;

@Injectable()
export class ReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly accountResolver: AccountResolverService,
    private readonly pdfService: PdfService,
  ) {}

  private async nextReceiptNumber() {
    const year = new Date().getFullYear();
    const count = await this.prisma.receipt.count({
      where: { receiptNumber: { startsWith: `RCT-${year}-` } },
    });
    return `RCT-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private async invoiceBalance(invoiceId: string, tx: any) {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { allocations: true } });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }
    const allocated = invoice.allocations.reduce((sum: number, allocation: any) => sum + Number(allocation.allocatedAmount), 0);
    return { invoice, balance: Number(invoice.amount) - allocated };
  }

  private async applyAllocations(receiptId: string, allocations: { invoiceId: string; amount: number }[], tx: any) {
    for (const allocation of allocations) {
      const { balance } = await this.invoiceBalance(allocation.invoiceId, tx);
      if (allocation.amount - balance > ROUNDING_TOLERANCE) {
        throw new BadRequestException(
          `Allocation of ${allocation.amount} exceeds outstanding balance ${balance.toFixed(2)} on invoice ${allocation.invoiceId}.`,
        );
      }

      await tx.receiptAllocation.create({
        data: { receiptId, invoiceId: allocation.invoiceId, allocatedAmount: allocation.amount },
      });

      const { invoice, balance: newBalance } = await this.invoiceBalance(allocation.invoiceId, tx);
      await tx.invoice.update({
        where: { id: allocation.invoiceId },
        data: { status: newBalance <= ROUNDING_TOLERANCE ? 'PAID' : 'PARTIALLY_PAID' },
      });
      void invoice;
    }
  }

  async create(dto: CreateReceiptDto) {
    const allocations = dto.allocations || [];
    const totalAllocated = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (totalAllocated - dto.amount > ROUNDING_TOLERANCE) {
      throw new BadRequestException('Allocated amount cannot exceed the receipt amount.');
    }

    const receiptNumber = await this.nextReceiptNumber();
    const currency = dto.currency || 'KES';

    let purpose: AccountPurpose = AccountPurpose.GENERAL;
    let projectId: string | undefined;
    if (allocations.length > 0) {
      const firstInvoice = await this.prisma.invoice.findUnique({ where: { id: allocations[0].invoiceId } });
      if (firstInvoice) {
        purpose = PURPOSE_BY_SOURCE_TYPE[firstInvoice.sourceType] || AccountPurpose.GENERAL;
        projectId = firstInvoice.projectId ?? undefined;
      }
    }

    const bankAccount = await this.accountResolver.resolveBankAccount(purpose, projectId, dto.bankAccountId);
    const arAccount = await this.ledger.getAccountByCode(DEFAULT_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);

    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          receiptNumber,
          customerId: dto.customerId,
          amount: dto.amount,
          currency,
          paymentMethod: dto.paymentMethod,
          transactionReference: dto.transactionReference,
          bankAccountId: bankAccount.id,
          createdBy: dto.createdBy || 'system',
        },
      });

      if (allocations.length > 0) {
        await this.applyAllocations(receipt.id, allocations, tx);
      }

      const journal = await this.ledger.postJournal(
        {
          memo: `Receipt ${receiptNumber}`,
          source: JournalSource.AR,
          sourceId: receipt.id,
          lines: [
            { accountId: bankAccount.glAccountId, debit: dto.amount, currencyCode: currency, projectId },
            { accountId: arAccount.id, credit: dto.amount, currencyCode: currency, projectId },
          ],
        },
        tx,
      );

      return tx.receipt.update({
        where: { id: receipt.id },
        data: { journalEntryId: journal.id },
        include: { allocations: true },
      });
    });
  }

  findAll(params: { skip?: number; take?: number; customerId?: string; status?: string }) {
    const { skip, take, customerId, status } = params;
    return this.prisma.receipt.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: { allocations: true },
      orderBy: { receivedAt: 'desc' },
      skip,
      take,
    });
  }

  async findOne(id: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: { allocations: { include: { invoice: true } }, customer: true, refunds: true },
    });
    if (!receipt) {
      throw new NotFoundException(`Receipt ${id} not found`);
    }
    return receipt;
  }

  async pdf(id: string): Promise<Buffer> {
    const receipt = await this.findOne(id);
    const html = receiptPdfTemplate({
      receiptNumber: receipt.receiptNumber,
      receivedAt: receipt.receivedAt,
      amount: Number(receipt.amount),
      currency: receipt.currency,
      payerName: `${receipt.customer.firstName} ${receipt.customer.lastName}`,
      payerEmail: receipt.customer.email,
      paymentMethod: receipt.paymentMethod,
      transactionReference: receipt.transactionReference,
      description:
        receipt.allocations.length > 0
          ? `Payment allocated to invoice(s) ${receipt.allocations.map((allocation) => allocation.invoice.invoiceNumber).join(', ')}`
          : 'Unallocated payment',
    });
    return this.pdfService.renderPdf(html);
  }

  async unallocatedAmount(id: string) {
    const receipt = await this.findOne(id);
    const allocated = receipt.allocations.reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
    return Number(receipt.amount) - allocated;
  }

  async allocate(id: string, dto: AllocateReceiptDto) {
    const receipt = await this.findOne(id);
    if (receipt.status !== 'ACTIVE') {
      throw new BadRequestException('Only active receipts can be allocated.');
    }

    const requested = dto.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    const available = await this.unallocatedAmount(id);
    if (requested - available > ROUNDING_TOLERANCE) {
      throw new BadRequestException(`Only ${available.toFixed(2)} of this receipt is unallocated.`);
    }

    return this.prisma.$transaction(async (tx) => {
      await this.applyAllocations(id, dto.allocations, tx);
      return tx.receipt.findUnique({ where: { id }, include: { allocations: true } });
    });
  }

  async reprint(id: string) {
    const receipt = await this.findOne(id);
    if (receipt.status === 'CANCELLED') {
      throw new BadRequestException('Cannot reprint a cancelled receipt.');
    }
    return this.prisma.receipt.update({
      where: { id },
      data: { printedAt: new Date(), printCount: { increment: 1 } },
    });
  }

  async cancel(id: string, dto: CancelReceiptDto) {
    const receipt = await this.findOne(id);
    if (receipt.status === 'CANCELLED') {
      throw new BadRequestException('Receipt is already cancelled.');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const allocation of receipt.allocations) {
        await tx.receiptAllocation.delete({ where: { id: allocation.id } });
        const { balance } = await this.invoiceBalance(allocation.invoiceId, tx);
        await tx.invoice.update({
          where: { id: allocation.invoiceId },
          data: { status: balance >= Number(allocation.invoice.amount) - ROUNDING_TOLERANCE ? 'SENT' : 'PARTIALLY_PAID' },
        });
      }
    });

    if (receipt.journalEntryId) {
      await this.ledger.reverseJournal(receipt.journalEntryId, dto.cancelledBy);
    }

    return this.prisma.receipt.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledReason: dto.reason,
        cancelledBy: dto.cancelledBy || 'system',
      },
    });
  }
}
