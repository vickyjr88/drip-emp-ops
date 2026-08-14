import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConstructionStageLogQueryDto } from '../common/dto/filter-pagination.dto';
import { UpdateConstructionStageLogDto } from './dto/update-construction-stage-log.dto';

@Injectable()
export class ConstructionStageLogService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: ConstructionStageLogQueryDto) {
    const { skip, take, blockId } = query;
    return this.prisma.constructionStageLog.findMany({
      where: {
        ...(blockId ? { blockId } : {}),
      },
      skip,
      take,
      orderBy: { recordedAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.constructionStageLog.findUnique({ where: { id } });
  }

  private async syncStatusFromLatestLog(tx: any, blockId: string, updatedBy: string) {
    const latest = await tx.constructionStageLog.findFirst({
      where: { blockId },
      orderBy: { recordedAt: 'desc' },
    });

    if (!latest) {
      await tx.constructionStatus.deleteMany({ where: { blockId } });
      return;
    }

    await tx.constructionStatus.upsert({
      where: { blockId },
      update: {
        currentStage: latest.stage,
        progressPercent: latest.progressPercent,
        notes: latest.notes,
        updatedBy,
      },
      create: {
        blockId,
        currentStage: latest.stage,
        progressPercent: latest.progressPercent,
        notes: latest.notes,
        updatedBy,
      },
    });
  }

  async update(id: string, dto: UpdateConstructionStageLogDto) {
    const existing = await this.prisma.constructionStageLog.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Construction stage log ${id} not found`);
    }

    const updatedBy = dto.updatedBy || 'system';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.constructionStageLog.update({
        where: { id },
        data: {
          stage: dto.stage ?? existing.stage,
          progressPercent: dto.progressPercent ?? existing.progressPercent,
          notes: dto.notes !== undefined ? dto.notes : existing.notes,
          photoUrls: dto.photoUrls !== undefined ? (dto.photoUrls.length > 0 ? dto.photoUrls : null) : existing.photoUrls,
          recordedBy: updatedBy,
        } as any,
      });

      const latest = await tx.constructionStageLog.findFirst({
        where: { blockId: existing.blockId },
        orderBy: { recordedAt: 'desc' },
      });

      if (latest?.id === updated.id) {
        await this.syncStatusFromLatestLog(tx, existing.blockId, updatedBy);
      }

      return updated;
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.constructionStageLog.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Construction stage log ${id} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.constructionStageLog.delete({ where: { id } });
      await this.syncStatusFromLatestLog(tx, existing.blockId, existing.recordedBy);
      return deleted;
    });
  }
}
