import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OfferService } from './offer.service';
import { OfferController } from './offer.controller';

@Module({
  imports: [PrismaModule],
  providers: [OfferService],
  controllers: [OfferController],
  exports: [OfferService],
})
export class OfferModule {}
