import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OwnershipChangeAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitOwnershipDto } from './dto/create-unit-ownership.dto';
import { UpdateUnitOwnershipDto } from './dto/update-unit-ownership.dto';
import { TransferUnitOwnershipDto } from './dto/transfer-unit-ownership.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class UnitOwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUnitOwnershipDto) {
    const { reason, changedBy, ...data } = dto;

    return this.prisma.$transaction(async (tx) => {
      const ownership = await tx.unitOwnership.create({ data: data as any });

      await tx.ownershipChangeAudit.create({
        data: {
          unitId: ownership.unitId,
          ownershipId: ownership.id,
          action: OwnershipChangeAction.ASSIGNED,
          fromCustomerId: null,
          toCustomerId: ownership.customerId,
          fromPercentage: null,
          toPercentage: ownership.ownershipPercentage,
          fromIsPrimary: null,
          toIsPrimary: ownership.isPrimaryOwner,
          reason: reason || 'Ownership assigned',
          changedBy: changedBy || 'system',
        },
      });

      return ownership;
    });
  }

  findAll(pagination: PaginationDto) {
    const { skip, take } = pagination;
    return this.prisma.unitOwnership.findMany({ skip, take });
  }

  findOne(id: string) {
    return this.prisma.unitOwnership.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateUnitOwnershipDto) {
    const existing = await this.prisma.unitOwnership.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Unit ownership ${id} not found`);
    }

    const { reason, changedBy, ...data } = dto;

    return this.prisma.$transaction(async (tx) => {
      const ownership = await tx.unitOwnership.update({
        where: { id },
        data: data as any,
      });

      const customerChanged =
        data.customerId !== undefined && data.customerId !== existing.customerId;
      const action = customerChanged
        ? OwnershipChangeAction.REASSIGNED
        : OwnershipChangeAction.UPDATED;

      await tx.ownershipChangeAudit.create({
        data: {
          unitId: ownership.unitId,
          ownershipId: ownership.id,
          action,
          fromCustomerId: existing.customerId,
          toCustomerId: ownership.customerId,
          fromPercentage: existing.ownershipPercentage,
          toPercentage: ownership.ownershipPercentage,
          fromIsPrimary: existing.isPrimaryOwner,
          toIsPrimary: ownership.isPrimaryOwner,
          reason:
            reason ||
            (customerChanged ? 'Ownership reassigned' : 'Ownership details updated'),
          changedBy: changedBy || 'system',
        },
      });

      return ownership;
    });
  }

  async transferOwnership(id: string, dto: TransferUnitOwnershipDto) {
    const existing = await this.prisma.unitOwnership.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Unit ownership ${id} not found`);
    }
    if (existing.customerId === dto.toCustomerId) {
      throw new BadRequestException('The ownership is already held by this customer.');
    }

    // The target customer may already hold a separate ownership record on
    // this same unit (a part-owner receiving more of it). Blindly rewriting
    // customerId on `existing` in that case would silently overwrite the
    // target's own record's identity rather than merging into it — instead,
    // merge percentages into their existing record and remove the source.
    const targetExisting = await this.prisma.unitOwnership.findFirst({
      where: { unitId: existing.unitId, customerId: dto.toCustomerId },
    });

    if (targetExisting) {
      return this.prisma.$transaction(async (tx) => {
        const mergedPercentage = Number(existing.ownershipPercentage) + Number(targetExisting.ownershipPercentage);
        const merged = await tx.unitOwnership.update({
          where: { id: targetExisting.id },
          data: {
            ownershipPercentage: mergedPercentage,
            isPrimaryOwner: targetExisting.isPrimaryOwner || existing.isPrimaryOwner,
          },
        });

        await tx.unitOwnership.update({ where: { id: existing.id }, data: { transferredAt: new Date() } });
        await tx.unitOwnership.delete({ where: { id: existing.id } });

        await tx.ownershipChangeAudit.create({
          data: {
            unitId: existing.unitId,
            ownershipId: targetExisting.id,
            action: OwnershipChangeAction.REASSIGNED,
            fromCustomerId: existing.customerId,
            toCustomerId: dto.toCustomerId,
            fromPercentage: existing.ownershipPercentage,
            toPercentage: merged.ownershipPercentage,
            fromIsPrimary: existing.isPrimaryOwner,
            toIsPrimary: merged.isPrimaryOwner,
            reason: dto.reason,
            changedBy: dto.changedBy || 'system',
          },
        });

        return merged;
      });
    }

    return this.update(id, {
      customerId: dto.toCustomerId,
      reason: dto.reason,
      changedBy: dto.changedBy,
    } as UpdateUnitOwnershipDto);
  }

  async remove(id: string, meta?: { reason?: string; changedBy?: string }) {
    const existing = await this.prisma.unitOwnership.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Unit ownership ${id} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.unitOwnership.update({
        where: { id },
        data: { transferredAt: new Date() },
      });

      await tx.ownershipChangeAudit.create({
        data: {
          unitId: existing.unitId,
          ownershipId: existing.id,
          action: OwnershipChangeAction.REMOVED,
          fromCustomerId: existing.customerId,
          toCustomerId: null,
          fromPercentage: existing.ownershipPercentage,
          toPercentage: null,
          fromIsPrimary: existing.isPrimaryOwner,
          toIsPrimary: null,
          reason: meta?.reason || 'Ownership removed',
          changedBy: meta?.changedBy || 'system',
        },
      });

      return tx.unitOwnership.delete({ where: { id } });
    });
  }
}
