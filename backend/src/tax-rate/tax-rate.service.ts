import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';

@Injectable()
export class TaxRateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tax codes are unique, and both create and update expose that constraint to
   * the user. Translate the Prisma violation so they get a message naming the
   * conflict rather than an opaque 500.
   */
  private rethrowDuplicateCode(error: unknown, code?: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BadRequestException(
        `Tax code ${code ? `"${code}" ` : ''}is already in use by another tax rate.`,
      );
    }
    throw error;
  }

  async create(dto: CreateTaxRateDto) {
    try {
      return await this.prisma.taxRate.create({ data: dto as any });
    } catch (error) {
      this.rethrowDuplicateCode(error, dto.code);
    }
  }

  findAll(activeOnly?: boolean) {
    return this.prisma.taxRate.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: { glAccount: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const rate = await this.prisma.taxRate.findUnique({ where: { id }, include: { glAccount: true } });
    if (!rate) {
      throw new NotFoundException(`Tax rate ${id} not found`);
    }
    return rate;
  }

  async update(id: string, dto: UpdateTaxRateDto) {
    await this.findOne(id);
    try {
      return await this.prisma.taxRate.update({ where: { id }, data: dto as any });
    } catch (error) {
      this.rethrowDuplicateCode(error, dto.code);
    }
  }

  async remove(id: string) {
    const [invoiceLineCount, supplierInvoiceCount] = await Promise.all([
      this.prisma.invoiceLine.count({ where: { taxRateId: id } }),
      this.prisma.supplierInvoice.count({ where: { taxRateId: id } }),
    ]);
    if (invoiceLineCount > 0 || supplierInvoiceCount > 0) {
      throw new BadRequestException('Cannot delete a tax rate that has been used on invoices. Mark it inactive instead.');
    }
    return this.prisma.taxRate.delete({ where: { id } });
  }
}
