import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ResellerService } from './reseller.service';
import { ResellerController } from './reseller.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ResellerController],
  providers: [ResellerService],
  exports: [ResellerService],
})
export class ResellerModule {}
