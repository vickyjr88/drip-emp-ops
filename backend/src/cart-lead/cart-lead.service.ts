import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CartLeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination.util';
import { RecordCartLeadDto } from './dto/cart-lead.dto';
import { CartLeadQueryDto } from './dto/cart-lead-query.dto';

@Injectable()
export class CartLeadService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.cartLead.create({ data: { ...data, source: 'ABANDONED_CART' } });
  }
}
