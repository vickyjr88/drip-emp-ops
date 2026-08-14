import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

@Injectable()
export class BankAccountService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateBankAccountDto) {
    return this.prisma.bankAccount.create({ data: dto as any });
  }

  findAll(projectId?: string) {
    return this.prisma.bankAccount.findMany({
      where: projectId ? { projectId } : undefined,
      include: { glAccount: true, project: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const account = await this.prisma.bankAccount.findUnique({ where: { id }, include: { glAccount: true, project: true } });
    if (!account) {
      throw new NotFoundException(`Bank account ${id} not found`);
    }
    return account;
  }

  update(id: string, dto: UpdateBankAccountDto) {
    return this.prisma.bankAccount.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    const account = await this.findOne(id);

    const [journalActivity, reconciliationCount] = await Promise.all([
      this.prisma.journalLine.count({ where: { accountId: account.glAccountId } }),
      this.prisma.bankReconciliation.count({ where: { bankAccountId: id } }),
    ]);

    if (journalActivity > 0 || reconciliationCount > 0) {
      throw new BadRequestException(
        'Cannot delete an account with posted transactions or reconciliations. Mark it inactive instead.',
      );
    }

    return this.prisma.bankAccount.delete({ where: { id } });
  }

  async balance(id: string) {
    const account = await this.findOne(id);
    const lines = await this.prisma.journalLine.findMany({
      where: { accountId: account.glAccountId, entry: { status: 'POSTED' } },
    });
    const balance = lines.reduce((sum, line) => sum + Number(line.baseDebit) - Number(line.baseCredit), 0);
    return { bankAccountId: id, glAccountId: account.glAccountId, balance };
  }
}
