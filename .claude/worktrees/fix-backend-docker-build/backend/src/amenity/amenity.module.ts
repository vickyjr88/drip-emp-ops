import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AmenityService } from './amenity.service';
import { AmenityController } from './amenity.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AmenityController],
  providers: [AmenityService],
})
export class AmenityModule {}
