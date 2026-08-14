import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CUSTOMER_TOKEN_KIND } from './customer-jwt.strategy';

/**
 * Read-only portal for tenants and owners.
 *
 * Every method takes the customer id from the verified token -- never from a
 * query parameter -- so one customer cannot address another's records.
 */
@Injectable()
export class CustomerPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // One message for every failure mode: a distinct "no such account" would
    // let anyone enumerate which emails exist.
    const invalid = new UnauthorizedException('Invalid email or password');
    if (!customer || !customer.portalEnabled || !customer.portalPassword) {
      // Spend the same time hashing either way so timing does not leak
      // whether the account exists.
      await bcrypt.compare(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
      throw invalid;
    }

    if (!(await bcrypt.compare(password, customer.portalPassword))) {
      throw invalid;
    }

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { portalLastLoginAt: new Date() },
    });

    return {
      access_token: this.jwt.sign({
        sub: customer.id,
        email: customer.email,
        kind: CUSTOMER_TOKEN_KIND,
      }),
      customer: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
      },
    };
  }

  async changePassword(customerId: string, currentPassword: string, nextPassword: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer?.portalPassword) {
      throw new UnauthorizedException('Invalid current password');
    }
    if (!(await bcrypt.compare(currentPassword, customer.portalPassword))) {
      throw new UnauthorizedException('Invalid current password');
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { portalPassword: await bcrypt.hash(nextPassword, 10) },
    });

    return { updated: true };
  }





  /**
   * What the tenant owes for the current month. Mirrors how the reminder engine
   * matches payments to a charge, so the portal and the reminders agree.
   */
  private currentMonthOutstanding(
    tenancy: {
      monthlyRent: any;
      currency: string;
      rentDueDay: number;
      utilityCharges: Array<{ category: string; amount: any; dueDay: number | null; isActive: boolean }>;
    },
    payments: Array<{ category: string; amountPaid: any; paymentDate: Date }>,
  ) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    const paidFor = (category: string) =>
      payments
        .filter((payment) => {
          const date = new Date(payment.paymentDate);
          return (
            payment.category === category &&
            date.getUTCFullYear() === year &&
            date.getUTCMonth() === month
          );
        })
        .reduce((sum, payment) => sum + Number(payment.amountPaid), 0);

    const lines = [
      {
        category: 'RENT',
        due: Number(tenancy.monthlyRent),
        paid: paidFor('RENT'),
        dueDay: tenancy.rentDueDay,
      },
      ...tenancy.utilityCharges
        .filter((charge) => charge.isActive)
        .map((charge) => ({
          category: charge.category,
          due: Number(charge.amount),
          paid: paidFor(charge.category),
          dueDay: charge.dueDay ?? tenancy.rentDueDay,
        })),
    ].map((line) => ({
      ...line,
      // Tolerance matches the engine's, covering rounding on split payments.
      outstanding: Math.max(line.due - line.paid, 0),
      isPaid: line.paid >= line.due - 0.01,
    }));

    return {
      currency: tenancy.currency,
      month: `${year}-${String(month + 1).padStart(2, '0')}`,
      lines,
      totalOutstanding: lines.reduce((sum, line) => sum + line.outstanding, 0),
    };
  }
}
