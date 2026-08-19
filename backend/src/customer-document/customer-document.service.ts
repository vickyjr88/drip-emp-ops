import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDocumentDto } from './dto/create-customer-document.dto';
import { UpdateCustomerDocumentDto } from './dto/update-customer-document.dto';
import { CustomerDocumentQueryDto } from './dto/customer-document-query.dto';
import { containsAny, paginate, searchOr } from '../common/pagination.util';

@Injectable()
export class CustomerDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCustomerDocumentDto) {
    return this.prisma.customerDocument.create({ data: dto as any });
  }

  findAll(query: CustomerDocumentQueryDto) {
    const { skip, take, search, customerId } = query;
    const where: Prisma.CustomerDocumentWhereInput = {
      ...(customerId ? { customerId } : {}),
      ...searchOr(search, (term) => containsAny(['fileName', 'documentType', 'notes'], term)),
    };
    return paginate(
      (args) => this.prisma.customerDocument.findMany({ where, orderBy: [{ uploadedAt: 'desc' }, { id: 'asc' }], ...args }),
      () => this.prisma.customerDocument.count({ where }),
      skip,
      take,
    );
  }

  findOne(id: string) {
    return this.prisma.customerDocument.findUnique({ where: { id } });
  }

  update(id: string, dto: UpdateCustomerDocumentDto) {
    return this.prisma.customerDocument.update({ where: { id }, data: dto as any });
  }

  remove(id: string) {
    return this.prisma.customerDocument.delete({ where: { id } });
  }
}
