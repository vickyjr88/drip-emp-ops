import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesPostingModule } from '../sales-posting/sales-posting.module';

@Module({
  imports: [PrismaModule, InventoryModule, SalesPostingModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
