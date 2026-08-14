import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectBlockService } from './project-block.service';
import { ProjectBlockController } from './project-block.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectBlockController],
  providers: [ProjectBlockService],
})
export class ProjectBlockModule {}
