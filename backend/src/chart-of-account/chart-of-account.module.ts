import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChartOfAccountService } from './chart-of-account.service';
import { ChartOfAccountController } from './chart-of-account.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ChartOfAccountController],
  providers: [ChartOfAccountService],
  exports: [ChartOfAccountService],
})
export class ChartOfAccountModule {}
