import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssetTransferDto } from './dto/create-asset-transfer.dto';

@Injectable()
export class AssetTransferService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAssetTransferDto) {
    const asset = await this.prisma.fixedAsset.findUnique({ where: { id: dto.assetId } });
    if (!asset) {
      throw new NotFoundException(`Fixed asset ${dto.assetId} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.assetTransfer.create({
        data: {
          assetId: dto.assetId,
          fromProjectId: asset.projectId,
          toProjectId: dto.toProjectId,
          reason: dto.reason,
          transferredBy: dto.transferredBy || 'system',
        },
      });

      await tx.fixedAsset.update({
        where: { id: dto.assetId },
        data: { projectId: dto.toProjectId, status: 'ACTIVE' },
      });

      return transfer;
    });
  }

  findAll(assetId?: string) {
    return this.prisma.assetTransfer.findMany({
      where: assetId ? { assetId } : {},
      orderBy: { transferDate: 'desc' },
    });
  }
}
