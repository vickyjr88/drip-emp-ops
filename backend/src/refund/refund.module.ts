import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { RefundService } from './refund.service';
import { RefundController } from './refund.controller';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [RefundController],
  providers: [RefundService],
})
export class RefundModule {}
