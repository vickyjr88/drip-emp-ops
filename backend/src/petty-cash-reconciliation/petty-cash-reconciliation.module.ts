import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PettyCashBoxModule } from '../petty-cash-box/petty-cash-box.module';
import { PettyCashReconciliationService } from './petty-cash-reconciliation.service';
import { PettyCashReconciliationController } from './petty-cash-reconciliation.controller';

@Module({
  imports: [PrismaModule, PettyCashBoxModule],
  controllers: [PettyCashReconciliationController],
  providers: [PettyCashReconciliationService],
})
export class PettyCashReconciliationModule {}
