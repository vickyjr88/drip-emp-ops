import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountPurpose, JournalSource, TaxApplication } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { AccountResolverService } from '../ledger/account-resolver.service';
import { CreateTaxRemittanceDto } from './dto/create-tax-remittance.dto';

@Injectable()
export class TaxRemittanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly accountResolver: AccountResolverService,
  ) {}

  private async nextRemittanceNumber() {
    const year = new Date().getFullYear();
    const count = await this.prisma.taxRemittance.count({
      where: { remittanceNumber: { startsWith: `TXR-${year}-` } },
    });
    return `TXR-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  async create(dto: CreateTaxRemittanceDto) {
    const taxRate = await this.prisma.taxRate.findUnique({ where: { id: dto.taxRateId }, include: { glAccount: true } });
    if (!taxRate) {
      throw new NotFoundException(`Tax rate ${dto.taxRateId} not found`);
    }
    if (taxRate.appliesTo === TaxApplication.INPUT) {
      throw new BadRequestException(
        'Input VAT is reclaimed by netting against output VAT, not remitted directly. Remit an OUTPUT or WITHHOLDING tax rate instead.',
      );
    }

    const bankAccount = await this.accountResolver.resolveBankAccount(
      AccountPurpose.TAX_REMITTANCE,
      dto.storeId,
      dto.bankAccountId,
    );

    const remittanceNumber = await this.nextRemittanceNumber();

    return this.prisma.$transaction(async (tx) => {
      const journal = await this.ledger.postJournal(
        {
          memo: `Tax remittance ${remittanceNumber}: ${taxRate.name}`,
          source: JournalSource.TAX_REMITTANCE,
          lines: [
            { accountId: taxRate.glAccountId, debit: dto.amount, storeId: dto.storeId },
            { accountId: bankAccount.glAccountId, credit: dto.amount, storeId: dto.storeId },
          ],
        },
        tx,
      );

      const remittance = await tx.taxRemittance.create({
        data: {
          remittanceNumber,
          taxRateId: dto.taxRateId,
          bankAccountId: bankAccount.id,
          storeId: dto.storeId,
          amount: dto.amount,
          periodStart: new Date(dto.periodStart),
          periodEnd: new Date(dto.periodEnd),
          reference: dto.reference,
          remittedBy: dto.remittedBy || 'system',
          journalEntryId: journal.id,
        },
      });

      await tx.journalEntry.update({ where: { id: journal.id }, data: { sourceId: remittance.id } });

      return remittance;
    });
  }

  findAll(params: { skip?: number; take?: number; taxRateId?: string; storeId?: string }) {
    const { skip, take, taxRateId, storeId } = params;
    return this.prisma.taxRemittance.findMany({
      where: {
        ...(taxRateId ? { taxRateId } : {}),
        ...(storeId ? { storeId } : {}),
      },
      include: { taxRate: true, bankAccount: true, store: true },
      orderBy: { remittedAt: 'desc' },
      skip,
      take,
    });
  }

  async findOne(id: string) {
    const remittance = await this.prisma.taxRemittance.findUnique({
      where: { id },
      include: { taxRate: true, bankAccount: true, store: true },
    });
    if (!remittance) {
      throw new NotFoundException(`Tax remittance ${id} not found`);
    }
    return remittance;
  }
}
