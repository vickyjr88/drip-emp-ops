import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConstructionStageLogService } from './construction-stage-log.service';
import { ConstructionStageLogController } from './construction-stage-log.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ConstructionStageLogController],
  providers: [ConstructionStageLogService],
})
export class ConstructionStageLogModule {}
