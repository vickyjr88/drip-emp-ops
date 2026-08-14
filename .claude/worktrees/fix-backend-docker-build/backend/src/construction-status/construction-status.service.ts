import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateConstructionStatusDto } from './dto/update-construction-status.dto';

@Injectable()
export class ConstructionStatusService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.constructionStatus.findMany();
  }

  async findByBlock(blockId: string) {
    const existing = await this.prisma.constructionStatus.findUnique({ where: { blockId } });
    if (existing) {
      return existing;
    }

    const block = await this.prisma.projectBlock.findUnique({ where: { id: blockId } });
    if (!block) {
      throw new NotFoundException(`Project block ${blockId} not found`);
    }

    return this.prisma.constructionStatus.create({
      data: { blockId },
    });
  }

  async upsertForBlock(blockId: string, dto: UpdateConstructionStatusDto) {
    const block = await this.prisma.projectBlock.findUnique({ where: { id: blockId } });
    if (!block) {
      throw new NotFoundException(`Project block ${blockId} not found`);
    }

    const existing = await this.prisma.constructionStatus.findUnique({ where: { blockId } });
    const updatedBy = dto.updatedBy || 'system';

    return this.prisma.$transaction(async (tx) => {
      const status = existing
        ? await tx.constructionStatus.update({
            where: { blockId },
            data: {
              currentStage: dto.currentStage ?? existing.currentStage,
              progressPercent: dto.progressPercent ?? existing.progressPercent,
              notes: dto.notes ?? existing.notes,
              updatedBy,
            } as any,
          })
        : await tx.constructionStatus.create({
            data: {
              blockId,
              currentStage: dto.currentStage,
              progressPercent: dto.progressPercent ?? 0,
              notes: dto.notes,
              updatedBy,
            } as any,
          });

      await tx.constructionStageLog.create({
        data: {
          blockId,
          stage: status.currentStage,
          progressPercent: status.progressPercent,
          notes: dto.notes,
          photoUrls: dto.photoUrls && dto.photoUrls.length > 0 ? dto.photoUrls : undefined,
          recordedBy: updatedBy,
        } as any,
      });

      return status;
    });
  }
}
