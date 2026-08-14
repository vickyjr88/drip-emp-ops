import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UnitTransferService } from './unit-transfer.service';
import { UnitTransferController } from './unit-transfer.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UnitTransferController],
  providers: [UnitTransferService],
})
export class UnitTransferModule {}
