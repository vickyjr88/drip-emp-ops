import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SalesReportController } from './sales-report.controller';
import { SalesReportService } from './sales-report.service';

@Module({
  imports: [PrismaModule],
  controllers: [SalesReportController],
  providers: [SalesReportService],
})
export class SalesReportModule {}
