import { Injectable, NotFoundException } from '@nestjs/common';
import { UnitStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const LISTABLE_STATUSES: UnitStatus[] = [UnitStatus.AVAILABLE, UnitStatus.RESERVED];

@Injectable()
export class PublicListingsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapUnit(unit: any) {
    const projectGallery = Array.isArray(unit.block.project.galleryImages) ? unit.block.project.galleryImages : [];
    const unitGallery = Array.isArray(unit.galleryImages) ? unit.galleryImages : [];
    return {
      id: unit.id,
      unitNumber: unit.unitNumber,
      floorNumber: unit.floorNumber,
      sizeSqm: unit.sizeSqm,
      priceKes: unit.priceKes,
      priceUsd: unit.priceUsd,
      status: unit.status,
      bedrooms: unit.bedrooms,
      parkingSlots: unit.parkingSlots,
      hasBalcony: unit.hasBalcony,
      hasStore: unit.hasStore,
      featuredImageUrl: unit.featuredImageUrl || unit.block.project.featuredImageUrl || null,
      galleryImages: unitGallery.length > 0 ? unitGallery : projectGallery,
      floorPlanUrl: unit.floorPlanUrl,
      amenities: (unit.amenities || []).map((link: any) => link.amenity),
      project: {
        id: unit.block.project.id,
        code: unit.block.project.code,
        name: unit.block.project.name,
        location: unit.block.project.location,
        description: unit.block.project.description,
      },
      block: {
        id: unit.block.id,
        blockName: unit.block.blockName,
      },
    };
  }

  async findAll() {
    const units = await this.prisma.unit.findMany({
      where: { status: { in: LISTABLE_STATUSES } },
      include: {
        block: { include: { project: true } },
        amenities: { include: { amenity: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return units.map((unit) => this.mapUnit(unit));
  }

  async findOne(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: {
        block: { include: { project: true } },
        amenities: { include: { amenity: true } },
      },
    });
    if (!unit || !LISTABLE_STATUSES.includes(unit.status)) {
      throw new NotFoundException('Listing not found.');
    }
    return this.mapUnit(unit);
  }
}
