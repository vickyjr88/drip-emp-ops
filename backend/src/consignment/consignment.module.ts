import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SalesPostingModule } from '../sales-posting/sales-posting.module';
import { ConsignmentService } from './consignment.service';
import { ConsignmentController } from './consignment.controller';

@Module({
  imports: [PrismaModule, SalesPostingModule],
  controllers: [ConsignmentController],
  providers: [ConsignmentService],
  exports: [ConsignmentService],
})
export class ConsignmentModule {}
