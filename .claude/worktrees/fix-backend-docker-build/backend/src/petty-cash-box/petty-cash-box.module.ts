import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PettyCashBoxService } from './petty-cash-box.service';
import { PettyCashBoxController } from './petty-cash-box.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PettyCashBoxController],
  providers: [PettyCashBoxService],
  exports: [PettyCashBoxService],
})
export class PettyCashBoxModule {}
