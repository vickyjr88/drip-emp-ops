import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyService } from './tenancy.service';
import { TenancyController } from './tenancy.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TenancyController],
  providers: [TenancyService],
})
export class TenancyModule {}
