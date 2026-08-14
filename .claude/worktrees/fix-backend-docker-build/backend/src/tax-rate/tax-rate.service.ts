import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';

@Injectable()
export class TaxRateService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateTaxRateDto) {
    return this.prisma.taxRate.create({ data: dto as any });
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

  update(id: string, dto: UpdateTaxRateDto) {
    return this.prisma.taxRate.update({ where: { id }, data: dto as any });
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
