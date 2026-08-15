import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerJwtStrategy } from './customer-jwt.strategy';
import { EmailLogModule } from '../email-log/email-log.module';

@Module({
  imports: [
    PrismaModule,
    EmailLogModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-key-change-me',
      // Shorter than staff sessions: these are end-customer devices.
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService, CustomerJwtStrategy],
})
export class CustomerPortalModule {}
