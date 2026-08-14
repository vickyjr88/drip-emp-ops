import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePettyCashBoxDto } from './dto/create-petty-cash-box.dto';
import { UpdatePettyCashBoxDto } from './dto/update-petty-cash-box.dto';

@Injectable()
export class PettyCashBoxService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePettyCashBoxDto) {
    return this.prisma.pettyCashBox.create({ data: dto as any });
  }

  findAll() {
    return this.prisma.pettyCashBox.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const box = await this.prisma.pettyCashBox.findUnique({ where: { id } });
    if (!box) {
      throw new NotFoundException(`Petty cash box ${id} not found`);
    }
    return box;
  }

  update(id: string, dto: UpdatePettyCashBoxDto) {
    return this.prisma.pettyCashBox.update({ where: { id }, data: dto as any });
  }

  remove(id: string) {
    return this.prisma.pettyCashBox.delete({ where: { id } });
  }

  async currentBalance(id: string) {
    const box = await this.findOne(id);
    const vouchers = await this.prisma.pettyCashVoucher.findMany({ where: { boxId: id, status: 'APPROVED' } });
    const balance = vouchers.reduce((sum, voucher) => {
      const amount = Number(voucher.amount);
      return voucher.type === 'TOPUP' ? sum + amount : sum - amount;
    }, Number(box.floatAmount));
    return { boxId: id, openingFloat: Number(box.floatAmount), balance };
  }
}
