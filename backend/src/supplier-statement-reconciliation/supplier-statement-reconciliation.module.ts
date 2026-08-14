import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupplierStatementReconciliationService } from './supplier-statement-reconciliation.service';
import { SupplierStatementReconciliationController } from './supplier-statement-reconciliation.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SupplierStatementReconciliationController],
  providers: [SupplierStatementReconciliationService],
})
export class SupplierStatementReconciliationModule {}
