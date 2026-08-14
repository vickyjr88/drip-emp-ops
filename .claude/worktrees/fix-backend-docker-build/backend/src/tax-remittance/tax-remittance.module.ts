import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TaxRemittanceService } from './tax-remittance.service';
import { TaxRemittanceController } from './tax-remittance.controller';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [TaxRemittanceController],
  providers: [TaxRemittanceService],
})
export class TaxRemittanceModule {}
