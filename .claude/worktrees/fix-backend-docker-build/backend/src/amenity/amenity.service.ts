import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAmenityDto } from './dto/create-amenity.dto';
import { UpdateAmenityDto } from './dto/update-amenity.dto';

@Injectable()
export class AmenityService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateAmenityDto) {
    return this.prisma.amenity.create({ data: dto as any });
  }

  findAll(category?: string) {
    return this.prisma.amenity.findMany({
      where: category ? { category } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const amenity = await this.prisma.amenity.findUnique({ where: { id } });
    if (!amenity) {
      throw new NotFoundException(`Amenity ${id} not found`);
    }
    return amenity;
  }

  update(id: string, dto: UpdateAmenityDto) {
    return this.prisma.amenity.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    const [projectCount, unitCount] = await Promise.all([
      this.prisma.projectAmenity.count({ where: { amenityId: id } }),
      this.prisma.unitAmenity.count({ where: { amenityId: id } }),
    ]);
    if (projectCount > 0 || unitCount > 0) {
      throw new BadRequestException(
        `This amenity is attached to ${projectCount} project(s) and ${unitCount} unit(s). Detach it from all of them before deleting.`,
      );
    }
    return this.prisma.amenity.delete({ where: { id } });
  }

  getForProject(projectId: string) {
    return this.prisma.projectAmenity.findMany({
      where: { projectId },
      include: { amenity: true },
      orderBy: { amenity: { name: 'asc' } },
    });
  }

  async attachToProject(projectId: string, amenityId: string) {
    const [project, amenity] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId } }),
      this.prisma.amenity.findUnique({ where: { id: amenityId } }),
    ]);
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    if (!amenity) throw new NotFoundException(`Amenity ${amenityId} not found`);

    return this.prisma.projectAmenity.upsert({
      where: { projectId_amenityId: { projectId, amenityId } },
      update: {},
      create: { projectId, amenityId },
      include: { amenity: true },
    });
  }

  async detachFromProject(projectId: string, amenityId: string) {
    await this.prisma.projectAmenity.deleteMany({ where: { projectId, amenityId } });
  }

  getForUnit(unitId: string) {
    return this.prisma.unitAmenity.findMany({
      where: { unitId },
      include: { amenity: true },
      orderBy: { amenity: { name: 'asc' } },
    });
  }

  async attachToUnit(unitId: string, amenityId: string) {
    const [unit, amenity] = await Promise.all([
      this.prisma.unit.findUnique({ where: { id: unitId } }),
      this.prisma.amenity.findUnique({ where: { id: amenityId } }),
    ]);
    if (!unit) throw new NotFoundException(`Unit ${unitId} not found`);
    if (!amenity) throw new NotFoundException(`Amenity ${amenityId} not found`);

    return this.prisma.unitAmenity.upsert({
      where: { unitId_amenityId: { unitId, amenityId } },
      update: {},
      create: { unitId, amenityId },
      include: { amenity: true },
    });
  }

  async detachFromUnit(unitId: string, amenityId: string) {
    await this.prisma.unitAmenity.deleteMany({ where: { unitId, amenityId } });
  }
}
