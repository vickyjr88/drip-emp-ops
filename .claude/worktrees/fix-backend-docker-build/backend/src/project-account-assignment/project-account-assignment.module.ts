import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectAccountAssignmentService } from './project-account-assignment.service';
import { ProjectAccountAssignmentController } from './project-account-assignment.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectAccountAssignmentController],
  providers: [ProjectAccountAssignmentService],
  exports: [ProjectAccountAssignmentService],
})
export class ProjectAccountAssignmentModule {}
