import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChartOfAccountDto } from './dto/create-chart-of-account.dto';
import { UpdateChartOfAccountDto } from './dto/update-chart-of-account.dto';

@Injectable()
export class ChartOfAccountService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateChartOfAccountDto) {
    return this.prisma.chartOfAccount.create({ data: dto as any });
  }

  findAll(params: { type?: string; isActive?: string }) {
    return this.prisma.chartOfAccount.findMany({
      where: {
        ...(params.type ? { type: params.type as any } : {}),
        ...(params.isActive !== undefined ? { isActive: params.isActive === 'true' } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const account = await this.prisma.chartOfAccount.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException(`Chart of account ${id} not found`);
    }
    return account;
  }

  update(id: string, dto: UpdateChartOfAccountDto) {
    return this.prisma.chartOfAccount.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    const account = await this.prisma.chartOfAccount.findUnique({ where: { id } });
    if (account?.isSystem) {
      throw new BadRequestException('System accounts cannot be deleted.');
    }
    const usageCount = await this.prisma.journalLine.count({ where: { accountId: id } });
    if (usageCount > 0) {
      throw new BadRequestException('Cannot delete an account that has journal activity.');
    }
    return this.prisma.chartOfAccount.delete({ where: { id } });
  }
}
