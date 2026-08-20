import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CartLeadService } from './cart-lead.service';
import { CartLeadController } from './cart-lead.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CartLeadController],
  providers: [CartLeadService],
})
export class CartLeadModule {}
