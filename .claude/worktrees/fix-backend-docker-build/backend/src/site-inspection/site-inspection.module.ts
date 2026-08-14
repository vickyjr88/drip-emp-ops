import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SiteInspectionService } from './site-inspection.service';
import { SiteInspectionController } from './site-inspection.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SiteInspectionController],
  providers: [SiteInspectionService],
})
export class SiteInspectionModule {}
