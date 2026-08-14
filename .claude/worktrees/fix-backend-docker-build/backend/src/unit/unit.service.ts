import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class UnitService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateUnitDto) {
    return this.prisma.unit.create({ data: dto as any });
  }

  findAll(pagination: PaginationDto) {
    const { skip, take } = pagination;
    return this.prisma.unit.findMany({ skip, take });
  }

  findOne(id: string) {
    return this.prisma.unit.findUnique({ where: { id } });
  }

  update(id: string, dto: UpdateUnitDto) {
    return this.prisma.unit.update({ where: { id }, data: dto as any });
  }

  async createBulk(dtos: CreateUnitDto[]) {
    return this.prisma.$transaction(
      dtos.map((dto) =>
        this.prisma.unit.create({
          data: {
            blockId: dto.blockId,
            unitNumber: String(dto.unitNumber),
            floorNumber: Number(dto.floorNumber),
            sizeSqm: dto.sizeSqm,
            priceKes: dto.priceKes,
            priceUsd: dto.priceUsd,
            status: dto.status || ('AVAILABLE' as any),
            bedrooms: dto.bedrooms !== undefined ? Number(dto.bedrooms) : 0,
            parkingSlots: dto.parkingSlots !== undefined ? Number(dto.parkingSlots) : 0,
            hasBalcony: Boolean(dto.hasBalcony),
            hasStore: Boolean(dto.hasStore),
            featuredImageUrl: dto.featuredImageUrl || null,
            galleryImages: dto.galleryImages || null,
            floorPlanUrl: dto.floorPlanUrl || null,
          } as any,
        }),
      ),
    );
  }

  remove(id: string) {
    return this.prisma.unit.delete({ where: { id } });
  }
}
