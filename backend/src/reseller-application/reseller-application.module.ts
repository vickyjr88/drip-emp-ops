import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailLogModule } from '../email-log/email-log.module';
import { ResellerApplicationService } from './reseller-application.service';
import { ResellerApplicationController } from './reseller-application.controller';

@Module({
  imports: [PrismaModule, EmailLogModule],
  controllers: [ResellerApplicationController],
  providers: [ResellerApplicationService],
  // CustomerPortalModule injects this so a logged-in customer can submit an
  // application through its own already-authenticated endpoint.
  exports: [ResellerApplicationService],
})
export class ResellerApplicationModule {}
