import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConstructionStatusService } from './construction-status.service';
import { ConstructionStatusController } from './construction-status.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ConstructionStatusController],
  providers: [ConstructionStatusService],
})
export class ConstructionStatusModule {}
