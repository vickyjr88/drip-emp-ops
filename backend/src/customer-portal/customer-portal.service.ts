import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailLogService } from '../email-log/email-log.service';
import { CUSTOMER_TOKEN_KIND } from './customer-jwt.strategy';

/** How long a password-reset link stays usable. */
const RESET_TOKEN_TTL_MINUTES = 60;

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
    private readonly email: EmailLogService,
  ) {}

  /**
   * Signing up without buying anything.
   *
   * An account could previously only be created as a side effect of checkout,
   * so a returning customer who wanted to look up an old order had nowhere to
   * start. Someone whose record already exists -- because they bought once as
   * a walk-in and the shop took their details -- has their existing record
   * claimed rather than being blocked or duplicated.
   */
  async signup(dto: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
  }) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.customer.findUnique({ where: { email } });

    if (existing?.portalPassword) {
      throw new BadRequestException(
        'An account with that email already exists. Sign in, or reset your password.',
      );
    }

    const data = {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      phone: dto.phone.trim(),
      portalPassword: await bcrypt.hash(dto.password, 10),
      portalEnabled: true,
    };

    const customer = existing
      ? await this.prisma.customer.update({ where: { id: existing.id }, data })
      : await this.prisma.customer.create({ data: { ...data, email } });

    return this.issueToken(customer);
  }

  /**
   * Starts a password reset.
   *
   * Always reports success. Saying "no such account" would let anyone check
   * which email addresses shop here, and the reset link is the only thing that
   * proves control of the inbox.
   */
  async forgotPassword(rawEmail: string, origin: string) {
    const email = rawEmail.trim().toLowerCase();
    const customer = await this.prisma.customer.findUnique({ where: { email } });
    const generic = { sent: true };

    if (!customer || !customer.portalEnabled) return generic;

    // The token goes in the email; only its hash is stored, so a leaked
    // database row cannot be used to take the account over.
    const token = randomBytes(32).toString('hex');
    const resetTokenHash = createHash('sha256').update(token).digest('hex');

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        resetTokenHash,
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
      },
    });

    const link = `${origin.replace(/\/$/, '')}/account/reset?token=${token}`;
    await this.email.send({
      recipient: customer.email,
      subject: 'Reset your Drip Emporium password',
      html: `
        <p>Hello ${customer.firstName || 'there'},</p>
        <p>Someone asked to reset the password for your Drip Emporium account.
           If that was you, use the link below. It works once and expires in
           ${RESET_TOKEN_TTL_MINUTES} minutes.</p>
        <p><a href="${link}">Reset my password</a></p>
        <p>If it was not you, nothing has changed and you can ignore this email.</p>
      `,
    });

    return generic;
  }

  /** Completes a reset. The token is single-use: it is cleared on success. */
  async resetPassword(token: string, password: string) {
    const resetTokenHash = createHash('sha256').update(token.trim()).digest('hex');
    const customer = await this.prisma.customer.findFirst({ where: { resetTokenHash } });

    if (!customer || !customer.resetTokenExpiresAt || customer.resetTokenExpiresAt < new Date()) {
      throw new BadRequestException(
        'That reset link has expired or has already been used. Ask for a new one.',
      );
    }

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        portalPassword: await bcrypt.hash(password, 10),
        portalEnabled: true,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
    });

    return this.issueToken(customer);
  }

  /** The customer's own orders, newest first. */
  async myOrders(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      include: { lines: true, store: { select: { name: true, location: true } } },
      orderBy: { placedAt: 'desc' },
      take: 100,
    });

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      placedAt: order.placedAt.toISOString(),
      total: Number(order.total),
      amountPaid: Number(order.amountPaid),
      shippingAddress: order.shippingAddress,
      store: order.store,
      lines: order.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        lineTotal: Number(line.lineTotal),
      })),
    }));
  }

  private issueToken(customer: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    priceTier: string;
  }) {
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
        priceTier: customer.priceTier,
      },
    };
  }

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

    return this.issueToken(customer);
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
