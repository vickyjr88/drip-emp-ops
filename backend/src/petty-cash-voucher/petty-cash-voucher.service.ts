import { Injectable, NotFoundException } from '@nestjs/common';
import { JournalSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';
import { PdfService } from '../pdf/pdf.service';
import { pettyCashVoucherPdfTemplate } from '../pdf/pdf.templates';
import { CreatePettyCashVoucherDto } from './dto/create-petty-cash-voucher.dto';
import { PettyCashVoucherQueryDto } from './dto/petty-cash-voucher-query.dto';
import { nextReference } from '../common/next-reference';
import { containsAny, paginate, searchOr } from '../common/pagination.util';

@Injectable()
export class PettyCashVoucherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly pdfService: PdfService,
  ) {}

  private async nextVoucherNumber() {
    return nextReference(this.prisma.pettyCashVoucher, 'voucherNumber', 'PCV');
  }

  async create(dto: CreatePettyCashVoucherDto) {
    const box = await this.prisma.pettyCashBox.findUnique({ where: { id: dto.boxId } });
    if (!box) {
      throw new NotFoundException(`Petty cash box ${dto.boxId} not found`);
    }

    const pettyCashAccount = await this.ledger.getAccountByCode(DEFAULT_ACCOUNT_CODES.PETTY_CASH);
    const counterpartAccount = dto.glAccountId
      ? await this.prisma.chartOfAccount.findUnique({ where: { id: dto.glAccountId } })
      : await this.ledger.getAccountByCode(
          dto.type === 'TOPUP' ? DEFAULT_ACCOUNT_CODES.CASH_AND_BANK : DEFAULT_ACCOUNT_CODES.GENERAL_EXPENSE,
        );
    if (!counterpartAccount) {
      throw new NotFoundException('Configured GL account not found.');
    }

    const voucherNumber = await this.nextVoucherNumber();

    const journal = await this.ledger.postJournal({
      memo: `${dto.type === 'TOPUP' ? 'Top-up' : 'Expense'} voucher ${voucherNumber} (${box.name}): ${dto.purpose}`,
      source: JournalSource.PETTY_CASH,
      lines:
        dto.type === 'TOPUP'
          ? [
              { accountId: pettyCashAccount.id, debit: dto.amount, currencyCode: box.currency, storeId: box.storeId || undefined },
              { accountId: counterpartAccount.id, credit: dto.amount, currencyCode: box.currency },
            ]
          : [
              { accountId: counterpartAccount.id, debit: dto.amount, currencyCode: box.currency, storeId: box.storeId || undefined },
              { accountId: pettyCashAccount.id, credit: dto.amount, currencyCode: box.currency },
            ],
    });

    const voucher = await this.prisma.pettyCashVoucher.create({
      data: {
        voucherNumber,
        boxId: dto.boxId,
        type: dto.type,
        amount: dto.amount,
        payee: dto.payee,
        purpose: dto.purpose,
        glAccountId: counterpartAccount.id,
        receiptUrl: dto.receiptUrl,
        createdBy: dto.createdBy || 'system',
      },
    });

    return this.prisma.pettyCashVoucher.update({
      where: { id: voucher.id },
      data: { journalEntryId: journal.id },
    });
  }

  findAll(query: PettyCashVoucherQueryDto) {
    const { skip, take, search, boxId, type } = query;
    const where: Prisma.PettyCashVoucherWhereInput = {
      ...(boxId ? { boxId } : {}),
      ...(type ? { type: type as any } : {}),
      ...searchOr(search, (term) => containsAny(['voucherNumber', 'payee', 'purpose'], term)),
    };
    return paginate(
      (args) => this.prisma.pettyCashVoucher.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...args }),
      () => this.prisma.pettyCashVoucher.count({ where }),
      skip,
      take,
    );
  }

  async findOne(id: string) {
    const voucher = await this.prisma.pettyCashVoucher.findUnique({ where: { id }, include: { box: true } });
    if (!voucher) {
      throw new NotFoundException(`Petty cash voucher ${id} not found`);
    }
    return voucher;
  }

  async print(id: string) {
    await this.findOne(id);
    return this.prisma.pettyCashVoucher.update({
      where: { id },
      data: { printedAt: new Date(), printCount: { increment: 1 } },
    });
  }

  async pdf(id: string): Promise<Buffer> {
    const voucher = await this.findOne(id);
    const glAccount = voucher.glAccountId
      ? await this.prisma.chartOfAccount.findUnique({ where: { id: voucher.glAccountId } })
      : null;

    const html = pettyCashVoucherPdfTemplate({
      voucherNumber: voucher.voucherNumber,
      type: voucher.type,
      createdAt: voucher.createdAt,
      boxName: voucher.box.name,
      custodian: voucher.box.custodian,
      currency: voucher.box.currency,
      amount: Number(voucher.amount),
      payee: voucher.payee,
      purpose: voucher.purpose,
      glAccountLabel: glAccount ? `${glAccount.code} — ${glAccount.name}` : null,
      receiptUrl: voucher.receiptUrl,
      status: voucher.status,
    });
    return this.pdfService.renderPdf(html);
  }

  async void(id: string) {
    const voucher = await this.findOne(id);
    if (voucher.status === 'VOID') {
      return voucher;
    }
    if (voucher.journalEntryId) {
      await this.ledger.reverseJournal(voucher.journalEntryId);
    }
    return this.prisma.pettyCashVoucher.update({ where: { id }, data: { status: 'VOID' } });
  }
}
