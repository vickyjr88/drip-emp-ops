import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ResellerPayoutService } from './reseller-payout.service';
import { ResellerPayoutController } from './reseller-payout.controller';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [ResellerPayoutController],
  providers: [ResellerPayoutService],
})
export class ResellerPayoutModule {}
