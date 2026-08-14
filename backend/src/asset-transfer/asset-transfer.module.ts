import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssetTransferService } from './asset-transfer.service';
import { AssetTransferController } from './asset-transfer.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AssetTransferController],
  providers: [AssetTransferService],
})
export class AssetTransferModule {}
