import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PdfModule } from '../pdf/pdf.module';
import { PettyCashVoucherService } from './petty-cash-voucher.service';
import { PettyCashVoucherController } from './petty-cash-voucher.controller';

@Module({
  imports: [PrismaModule, LedgerModule, PdfModule],
  controllers: [PettyCashVoucherController],
  providers: [PettyCashVoucherService],
})
export class PettyCashVoucherModule {}
