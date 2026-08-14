import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const CUSTOMER_TOKEN_KIND = 'customer';

/**
 * Separate passport strategy for the customer-facing portal.
 *
 * Registered under its own name so a customer token can never satisfy a staff
 * endpoint: the global JwtAuthGuard only runs the 'jwt' strategy, and that one
 * rejects anything carrying kind='customer'.
 */
@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'super-secret-key-change-me',
    });
  }

  async validate(payload: any) {
    if (payload?.kind !== CUSTOMER_TOKEN_KIND) {
      throw new UnauthorizedException();
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        portalEnabled: true,
      },
    });

    // Re-checked on every request so revoking access takes effect immediately
    // rather than when the token happens to expire.
    if (!customer || !customer.portalEnabled) {
      throw new UnauthorizedException();
    }

    return customer;
  }
}
