import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentReallocationAuditDto } from './dto/create-payment-reallocation-audit.dto';
import { UpdatePaymentReallocationAuditDto } from './dto/update-payment-reallocation-audit.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class PaymentReallocationAuditService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreatePaymentReallocationAuditDto) {
    return this.prisma.paymentReallocationAudit.create({ data: dto as any });
  }

  findAll(pagination: PaginationDto) {
    const { skip, take } = pagination;
    return this.prisma.paymentReallocationAudit.findMany({ skip, take });
  }

  findOne(id: string) {
    return this.prisma.paymentReallocationAudit.findUnique({ where: { id } });
  }

  update(id: string, dto: UpdatePaymentReallocationAuditDto) {
    return this.prisma.paymentReallocationAudit.update({ where: { id }, data: dto as any });
  }

  remove(id: string) {
    return this.prisma.paymentReallocationAudit.delete({ where: { id } });
  }
}
