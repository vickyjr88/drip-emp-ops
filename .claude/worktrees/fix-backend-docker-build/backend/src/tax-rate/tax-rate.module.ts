import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TaxRateService } from './tax-rate.service';
import { TaxRateController } from './tax-rate.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TaxRateController],
  providers: [TaxRateService],
  exports: [TaxRateService],
})
export class TaxRateModule {}
