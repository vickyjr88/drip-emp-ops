import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SupplierPaymentService } from './supplier-payment.service';
import { SupplierPaymentController } from './supplier-payment.controller';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [SupplierPaymentController],
  providers: [SupplierPaymentService],
})
export class SupplierPaymentModule {}
