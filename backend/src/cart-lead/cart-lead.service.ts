import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CartLeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination.util';
import { OwnerNotificationService } from '../email-log/owner-notification.service';
import { RecordCartLeadDto } from './dto/cart-lead.dto';
import { CartLeadQueryDto } from './dto/cart-lead-query.dto';
import { CartReminderQueueService } from './cart-reminder-queue.service';

@Injectable()
export class CartLeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownerNotification: OwnerNotificationService,
    private readonly reminderQueue: CartReminderQueueService,
  ) {}

  /**
   * A cart with nobody to reach is not a lead, only browsing -- the caller
   * (both the WhatsApp click and the abandoned-cart sync) is expected to have
   * checked this already, but it is enforced again here since this is the
   * public boundary and the request body cannot be trusted.
   */
  async record(dto: RecordCartLeadDto) {
    if (!dto.customerName?.trim() && !dto.customerPhone?.trim() && !dto.customerEmail?.trim()) {
      throw new BadRequestException('A cart lead needs a name, phone or email to be worth recording.');
    }

    const subtotal = dto.lines.reduce((sum, line) => sum + line.priceKes * line.quantity, 0);
    const shipping = dto.shipping ?? 0;

    const customer = dto.customerEmail
      ? await this.prisma.customer.findUnique({ where: { email: dto.customerEmail } })
      : null;

    return this.prisma.cartLead.create({
      data: {
        source: dto.source,
        customerId: customer?.id,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail,
        shippingAddress: dto.shippingAddress,
        lines: dto.lines as unknown as Prisma.InputJsonValue,
        subtotal: new Prisma.Decimal(subtotal),
        shipping: new Prisma.Decimal(shipping),
        total: new Prisma.Decimal(subtotal + shipping),
        message: dto.message,
      },
    });
  }

  async findAll(query: CartLeadQueryDto) {
    const { skip, take, search, source, status } = query;
    const where: Prisma.CartLeadWhereInput = {
      ...(source ? { source } : {}),
      ...(status ? { status } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { customerName: { contains: search.trim(), mode: 'insensitive' } },
              { customerPhone: { contains: search.trim(), mode: 'insensitive' } },
              { customerEmail: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return paginate(
      (args) =>
        this.prisma.cartLead.findMany({
          ...args,
          where,
          orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }],
          include: { customer: { select: { id: true, firstName: true, lastName: true } } },
        }),
      () => this.prisma.cartLead.count({ where }),
      skip,
      take,
    );
  }

  async setStatus(id: string, status: CartLeadStatus) {
    const lead = await this.prisma.cartLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Cart lead ${id} not found`);
    return this.prisma.cartLead.update({ where: { id }, data: { status } });
  }

  /** Links the lead to the order staff created from it, so it drops off the outstanding list without losing the trail that produced the sale. */
  async markConverted(id: string, orderId: string) {
    const lead = await this.prisma.cartLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Cart lead ${id} not found`);
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    return this.prisma.cartLead.update({
      where: { id },
      data: { status: CartLeadStatus.CONVERTED, orderId },
    });
  }

  /**
   * An abandoned-cart sync from the same shopper replaces the earlier
   * snapshot rather than piling up duplicate rows -- it is one ongoing cart,
   * not a new lead each time an item is added.
   */
  async upsertAbandoned(dto: RecordCartLeadDto) {
    if (!dto.customerName?.trim() && !dto.customerPhone?.trim() && !dto.customerEmail?.trim()) {
      throw new BadRequestException('A cart lead needs a name, phone or email to be worth recording.');
    }
    const existing = await this.prisma.cartLead.findFirst({
      where: {
        source: 'ABANDONED_CART',
        status: 'NEW',
        ...(dto.customerEmail
          ? { customerEmail: dto.customerEmail }
          : dto.customerPhone
            ? { customerPhone: dto.customerPhone }
            : { customerName: dto.customerName }),
      },
    });

    const subtotal = dto.lines.reduce((sum, line) => sum + line.priceKes * line.quantity, 0);
    const shipping = dto.shipping ?? 0;
    const data = {
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail,
      shippingAddress: dto.shippingAddress,
      lines: dto.lines as unknown as Prisma.InputJsonValue,
      subtotal: new Prisma.Decimal(subtotal),
      shipping: new Prisma.Decimal(shipping),
      total: new Prisma.Decimal(subtotal + shipping),
      lastActivityAt: new Date(),
    };

    if (existing) {
      return this.prisma.cartLead.update({ where: { id: existing.id }, data });
    }

    const created = await this.prisma.cartLead.create({ data: { ...data, source: 'ABANDONED_CART' } });
    // Only on the first sync for this cart -- later syncs are the same
    // shopper still typing, not a new abandonment to report each time.
    void this.ownerNotification.notifyAbandonedCart({
      customerName: created.customerName,
      customerPhone: created.customerPhone,
      customerEmail: created.customerEmail,
      lines: dto.lines,
      total: Number(created.total),
    });
    // Fire-and-forget like the owner notification above: this endpoint is
    // public and polled periodically, so it must never be slowed or fail
    // because Redis is briefly unreachable.
    void this.reminderQueue.scheduleReminder(created.id);
    return created;
  }

  /**
   * How many leads are sitting outstanding, and how many of all the leads
   * ever recorded actually turned into an order -- the number that answers
   * "is chasing these worth the time", which the raw list does not.
   */
  async stats() {
    const [bySource, byStatus, outstandingValue, converted, total] = await Promise.all([
      this.prisma.cartLead.groupBy({ by: ['source'], _count: true }),
      this.prisma.cartLead.groupBy({ by: ['status'], _count: true }),
      this.prisma.cartLead.aggregate({
        where: { status: { in: ['NEW', 'CONTACTED'] } },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.cartLead.count({ where: { status: 'CONVERTED' } }),
      this.prisma.cartLead.count(),
    ]);

    return {
      total,
      bySource: bySource.map((row) => ({ source: row.source, count: row._count })),
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count })),
      outstanding: { count: outstandingValue._count, value: Number(outstandingValue._sum.total ?? 0) },
      converted,
      // Against every lead ever recorded, including ones still open or that
      // expired without converting -- so this reads as "how many of all the
      // leads we've had actually became a sale", not a rate inflated by
      // excluding the ones that didn't.
      conversionRate: total ? Math.round((converted / total) * 1000) / 10 : null,
    };
  }
}
