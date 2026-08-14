import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { AccountResolverService } from './account-resolver.service';

@Module({
  imports: [PrismaModule],
  controllers: [LedgerController],
  providers: [LedgerService, AccountResolverService],
  exports: [LedgerService, AccountResolverService],
})
export class LedgerModule {}
