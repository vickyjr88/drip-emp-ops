import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { AccountTransferService } from './account-transfer.service';
import { AccountTransferController } from './account-transfer.controller';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [AccountTransferController],
  providers: [AccountTransferService],
})
export class AccountTransferModule {}
