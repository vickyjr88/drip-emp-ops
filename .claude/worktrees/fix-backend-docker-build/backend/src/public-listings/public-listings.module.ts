import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicListingsService } from './public-listings.service';
import { PublicListingsController } from './public-listings.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PublicListingsController],
  providers: [PublicListingsService],
})
export class PublicListingsModule {}
