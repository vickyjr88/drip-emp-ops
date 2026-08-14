import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteInspectionDto } from './dto/create-site-inspection.dto';
import { UpdateSiteInspectionDto } from './dto/update-site-inspection.dto';
import { SiteInspectionQueryDto } from '../common/dto/filter-pagination.dto';

@Injectable()
export class SiteInspectionService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSiteInspectionDto) {
    return this.prisma.siteInspection.create({
      data: {
        ...dto,
        inspectionDate: new Date(dto.inspectionDate),
      } as any,
    });
  }

  findAll(query: SiteInspectionQueryDto) {
    const { skip, take, blockId, outcome } = query;
    return this.prisma.siteInspection.findMany({
      where: {
        ...(blockId ? { blockId } : {}),
        ...(outcome ? { outcome: outcome as any } : {}),
      },
      skip,
      take,
      orderBy: { inspectionDate: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.siteInspection.findUnique({ where: { id } });
  }

  update(id: string, dto: UpdateSiteInspectionDto) {
    const data: any = { ...dto };
    if (dto.inspectionDate) {
      data.inspectionDate = new Date(dto.inspectionDate);
    }
    return this.prisma.siteInspection.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.siteInspection.delete({ where: { id } });
  }
}
