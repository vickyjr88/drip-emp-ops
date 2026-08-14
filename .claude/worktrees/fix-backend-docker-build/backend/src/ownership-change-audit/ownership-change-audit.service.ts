import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipAuditQueryDto } from '../common/dto/filter-pagination.dto';

@Injectable()
export class OwnershipChangeAuditService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: OwnershipAuditQueryDto) {
    const { skip, take, unitId } = query;
    return this.prisma.ownershipChangeAudit.findMany({
      where: unitId ? { unitId } : undefined,
      skip,
      take,
      orderBy: { timestamp: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.ownershipChangeAudit.findUnique({ where: { id } });
  }
}
