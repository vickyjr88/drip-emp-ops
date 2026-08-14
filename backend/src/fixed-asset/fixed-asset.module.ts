import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { FixedAssetService } from './fixed-asset.service';
import { FixedAssetController } from './fixed-asset.controller';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [FixedAssetController],
  providers: [FixedAssetService],
})
export class FixedAssetModule {}
