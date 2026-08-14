import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SalesPostingService } from './sales-posting.service';

@Module({
  imports: [PrismaModule, LedgerModule],
  providers: [SalesPostingService],
  exports: [SalesPostingService],
})
export class SalesPostingModule {}
