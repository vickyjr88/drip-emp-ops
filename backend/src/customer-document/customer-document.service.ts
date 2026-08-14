import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDocumentDto } from './dto/create-customer-document.dto';
import { UpdateCustomerDocumentDto } from './dto/update-customer-document.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class CustomerDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCustomerDocumentDto) {
    return this.prisma.customerDocument.create({ data: dto as any });
  }

  findAll(pagination: PaginationDto & { customerId?: string }) {
    const { skip, take, customerId } = pagination;
    return this.prisma.customerDocument.findMany({
      where: customerId ? { customerId } : undefined,
      skip,
      take,
      orderBy: { uploadedAt: 'desc' },
    });
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
