import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';

/** Global: every service that needs an integration id or secret reads it through CredentialsService. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [CredentialsController],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
