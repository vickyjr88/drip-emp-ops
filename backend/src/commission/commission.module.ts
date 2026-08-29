import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { CommissionService } from './commission.service';

@Module({
  imports: [PrismaModule, LedgerModule],
  providers: [CommissionService],
  exports: [CommissionService],
})
export class CommissionModule {}
