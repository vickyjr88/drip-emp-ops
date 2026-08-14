import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenancyStatus, UnitStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenancyDto } from './dto/create-tenancy.dto';
import { UpdateTenancyDto } from './dto/update-tenancy.dto';
import { TenancyQueryDto } from '../common/dto/filter-pagination.dto';

@Injectable()
export class TenancyService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDates<T extends { leaseStart?: string; leaseEnd?: string | null }>(dto: T) {
    const next: any = { ...dto };
    if (dto.leaseStart) {
      next.leaseStart = new Date(dto.leaseStart);
    }
    if (dto.leaseEnd !== undefined) {
      next.leaseEnd = dto.leaseEnd ? new Date(dto.leaseEnd) : null;
    }
    return next;
  }

  async create(dto: CreateTenancyDto) {
    const status = (dto.status as TenancyStatus) || TenancyStatus.ACTIVE;
    const data = this.normalizeDates(dto);

    if (status === TenancyStatus.ACTIVE) {
      const active = await this.prisma.tenancy.findFirst({
        where: { unitId: dto.unitId, status: TenancyStatus.ACTIVE },
      });
      if (active) {
        throw new BadRequestException('Unit already has an active tenancy. End it before assigning a new tenant.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const tenancy = await tx.tenancy.create({
        data: {
          ...data,
          status,
        } as any,
      });

      if (status === TenancyStatus.ACTIVE) {
        const unit = await tx.unit.findUnique({ where: { id: dto.unitId } });
        if (unit && (unit.status === UnitStatus.AVAILABLE || unit.status === UnitStatus.RESERVED)) {
          await tx.unit.update({
            where: { id: dto.unitId },
            data: { status: UnitStatus.RENTED },
          });
        }
      }

      return tenancy;
    });
  }

  findAll(query: TenancyQueryDto) {
    const { skip, take, unitId, tenantId, status } = query;
    return this.prisma.tenancy.findMany({
      where: {
        ...(unitId ? { unitId } : {}),
        ...(tenantId ? { tenantId } : {}),
        ...(status ? { status: status as TenancyStatus } : {}),
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.tenancy.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateTenancyDto) {
    const existing = await this.prisma.tenancy.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Tenancy ${id} not found`);
    }

    const nextStatus = (dto.status as TenancyStatus | undefined) || existing.status;
    const unitId = dto.unitId || existing.unitId;

    if (nextStatus === TenancyStatus.ACTIVE && (dto.status || dto.unitId)) {
      const conflict = await this.prisma.tenancy.findFirst({
        where: {
          unitId,
          status: TenancyStatus.ACTIVE,
          NOT: { id },
        },
      });
      if (conflict) {
        throw new BadRequestException('Unit already has another active tenancy.');
      }
    }

    const data = this.normalizeDates(dto);

    return this.prisma.$transaction(async (tx) => {
      const tenancy = await tx.tenancy.update({
        where: { id },
        data: data as any,
      });

      if (nextStatus === TenancyStatus.ACTIVE) {
        const unit = await tx.unit.findUnique({ where: { id: tenancy.unitId } });
        if (unit && unit.status !== UnitStatus.SOLD && unit.status !== UnitStatus.BLOCKED) {
          await tx.unit.update({
            where: { id: tenancy.unitId },
            data: { status: UnitStatus.RENTED },
          });
        }
      }

      if (nextStatus === TenancyStatus.ENDED || nextStatus === TenancyStatus.PENDING) {
        const remainingActive = await tx.tenancy.count({
          where: { unitId: tenancy.unitId, status: TenancyStatus.ACTIVE },
        });
        if (remainingActive === 0) {
          const unit = await tx.unit.findUnique({ where: { id: tenancy.unitId } });
          if (unit?.status === UnitStatus.RENTED) {
            await tx.unit.update({
              where: { id: tenancy.unitId },
              data: { status: UnitStatus.AVAILABLE },
            });
          }
        }
      }

      return tenancy;
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.tenancy.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Tenancy ${id} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.rentalPayment.deleteMany({ where: { tenancyId: id } });
      const deleted = await tx.tenancy.delete({ where: { id } });

      if (existing.status === TenancyStatus.ACTIVE) {
        const remainingActive = await tx.tenancy.count({
          where: { unitId: existing.unitId, status: TenancyStatus.ACTIVE },
        });
        if (remainingActive === 0) {
          const unit = await tx.unit.findUnique({ where: { id: existing.unitId } });
          if (unit?.status === UnitStatus.RENTED) {
            await tx.unit.update({
              where: { id: existing.unitId },
              data: { status: UnitStatus.AVAILABLE },
            });
          }
        }
      }

      return deleted;
    });
  }
}
