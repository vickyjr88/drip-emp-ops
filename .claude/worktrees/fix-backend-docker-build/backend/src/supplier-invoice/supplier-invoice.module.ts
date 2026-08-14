import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { EmailLogModule } from '../email-log/email-log.module';
import { SupplierInvoiceService } from './supplier-invoice.service';
import { SupplierInvoiceController } from './supplier-invoice.controller';

@Module({
  imports: [PrismaModule, LedgerModule, EmailLogModule],
  controllers: [SupplierInvoiceController],
  providers: [SupplierInvoiceService],
  exports: [SupplierInvoiceService],
})
export class SupplierInvoiceModule {}
