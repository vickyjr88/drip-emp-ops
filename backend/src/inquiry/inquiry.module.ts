import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailLogModule } from '../email-log/email-log.module';
import { MauticModule } from '../mautic/mautic.module';
import { InquiryService } from './inquiry.service';
import { InquiryController } from './inquiry.controller';

@Module({
  imports: [PrismaModule, EmailLogModule, MauticModule],
  controllers: [InquiryController],
  providers: [InquiryService],
})
export class InquiryModule {}
