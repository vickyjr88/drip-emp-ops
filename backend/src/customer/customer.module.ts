import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MauticModule } from '../mautic/mautic.module';
import { CustomerDuplicatesController } from './customer-duplicates.controller';
import { CustomerMergeService } from './customer-merge.service';

@Module({
  imports: [PrismaModule, MauticModule],
  controllers: [CustomerController, CustomerDuplicatesController],
  providers: [CustomerService, CustomerMergeService],
})
export class CustomerModule {}
