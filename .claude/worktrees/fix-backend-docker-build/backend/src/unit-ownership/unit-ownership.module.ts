import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UnitOwnershipService } from './unit-ownership.service';
import { UnitOwnershipController } from './unit-ownership.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UnitOwnershipController],
  providers: [UnitOwnershipService],
})
export class UnitOwnershipModule {}
