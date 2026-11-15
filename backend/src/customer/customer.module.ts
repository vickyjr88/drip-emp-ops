import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MauticModule } from '../mautic/mautic.module';

@Module({
  imports: [PrismaModule, MauticModule],
  controllers: [CustomerController],
  providers: [CustomerService],
})
export class CustomerModule {}
