import { Module } from '@nestjs/common';
import { SalesContractService } from './sales-contract.service';
import { SalesContractController } from './sales-contract.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [PrismaModule, PdfModule],
  controllers: [SalesContractController],
  providers: [SalesContractService],
})
export class SalesContractModule {}
