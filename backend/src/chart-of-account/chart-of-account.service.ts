import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChartOfAccountDto } from './dto/create-chart-of-account.dto';
import { UpdateChartOfAccountDto } from './dto/update-chart-of-account.dto';

@Injectable()
export class ChartOfAccountService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Codes are unique, and a parent has to be a real account -- both create
   * and update expose these to the user. Translate the Prisma violation so
   * they get a message naming the problem rather than an opaque 500.
   */
  private rethrowKnownFailure(error: unknown, code?: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new BadRequestException(
          `Account code ${code ? `"${code}" ` : ''}is already in use by another account.`,
        );
      }
      if (error.code === 'P2003' || error.code === 'P2025') {
        throw new BadRequestException('The selected parent account does not exist.');
      }
    }
    throw error;
  }

  async create(dto: CreateChartOfAccountDto) {
    try {
      return await this.prisma.chartOfAccount.create({ data: dto as any });
    } catch (error) {
      this.rethrowKnownFailure(error, dto.code);
    }
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

  async update(id: string, dto: UpdateChartOfAccountDto) {
    await this.findOne(id);
    try {
      return await this.prisma.chartOfAccount.update({ where: { id }, data: dto as any });
    } catch (error) {
      this.rethrowKnownFailure(error, dto.code);
    }
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
