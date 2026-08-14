import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSitePhotoDto } from './dto/create-site-photo.dto';
import { UpdateSitePhotoDto } from './dto/update-site-photo.dto';
import { SitePhotoQueryDto } from '../common/dto/filter-pagination.dto';

@Injectable()
export class SitePhotoService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSitePhotoDto) {
    return this.prisma.sitePhoto.create({ data: dto as any });
  }

  findAll(query: SitePhotoQueryDto) {
    const { skip, take, blockId, stage } = query;
    return this.prisma.sitePhoto.findMany({
      where: {
        ...(blockId ? { blockId } : {}),
        ...(stage ? { stage: stage as any } : {}),
      },
      skip,
      take,
      orderBy: { uploadedAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.sitePhoto.findUnique({ where: { id } });
  }

  update(id: string, dto: UpdateSitePhotoDto) {
    return this.prisma.sitePhoto.update({ where: { id }, data: dto as any });
  }

  remove(id: string) {
    return this.prisma.sitePhoto.delete({ where: { id } });
  }
}
