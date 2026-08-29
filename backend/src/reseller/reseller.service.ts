import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateResellerDto, UpdateResellerDto } from './dto/reseller.dto';
import { ResellerQueryDto } from './dto/reseller-query.dto';
import { customerDisplayName } from '../customer/customer-name';
import { containsAny, paginate, searchOr } from '../common/pagination.util';

/**
 * Trade accounts: the shops that take our stock and pay for what they sell.
 *
 * No longer its own table. A reseller is a customer on a different price list,
 * so this is a view over Customer filtered to the non-retail tiers -- the same
 * shop can now buy a pair for itself and sign in, which two separate records
 * made impossible.
 */
const TRADE_TIERS: Prisma.EnumPriceTierFilter = { in: ['RESELLER', 'WHOLESALE'] };

@Injectable()
export class ResellerService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateResellerDto) {
    const { businessName, creditLimit, priceTier, contactName, email, ...rest } = dto;
    const customer = await this.prisma.customer.create({
      data: {
        ...rest,
        // Never invented: a reseller with no trading name of their own (e.g.
        // converted from an ordinary customer) gets businessName left null,
        // not a copy of their personal name -- customerDisplayName() already
        // falls back to firstName/lastName for display, and writing a
        // personal name in here would make that fallback permanently
        // unreachable (businessName wins whenever it is set).
        businessName: businessName?.trim() || null,
        firstName: contactName?.trim() || businessName!.trim(),
        lastName: '',
        // Email is the login and has to be unique. A shop set up over the
        // counter may not have given one, so a placeholder is derived from the
        // trade code; it cannot receive mail and leaves portalEnabled false,
        // so the account stays inert until a real address is entered.
        email: email?.trim().toLowerCase() || `${dto.code.trim().toLowerCase()}@trade.invalid`,
        phone: dto.phone || '',
        priceTier: priceTier ?? 'RESELLER',
        creditLimit: new Prisma.Decimal(creditLimit ?? 0),
      },
    });
    // findAll/findOne both supply this; a caller that picks the just-created
    // reseller straight out of the create response (rather than reloading the
    // list) needs the same field to show a name instead of a blank.
    return { ...customer, name: customerDisplayName(customer) };
  }

  /**
   * Trade customers with what each is holding and owes.
   *
   * Both figures come from the open consignments rather than a stored balance,
   * so they cannot drift from the pickups they are derived from.
   */
  async findAll(query: ResellerQueryDto) {
    const { skip, take, search, includeInactive } = query;
    const where: Prisma.CustomerWhereInput = {
      priceTier: TRADE_TIERS,
      ...(includeInactive ? {} : { isActive: true }),
      ...searchOr(search, (term) => containsAny(['firstName', 'lastName', 'businessName', 'code', 'phone'], term)),
    };
    const orderBy: Prisma.CustomerOrderByWithRelationInput[] = [{ firstName: 'asc' }, { id: 'asc' }];

    const page = await paginate(
      (args) =>
        this.prisma.customer.findMany({
          where,
          include: { consignments: { where: { status: 'OPEN' }, include: { lines: true } } },
          orderBy,
          ...args,
        }),
      () => this.prisma.customer.count({ where }),
      skip,
      take,
    );

    const now = Date.now();
    const items = page.items.map((customer) => {
      const unitsHeld = customer.consignments.reduce(
        (sum, consignment) =>
          sum +
          consignment.lines.reduce(
            (lineSum, line) => lineSum + (line.quantityOut - line.quantitySold - line.quantityReturned),
            0,
          ),
        0,
      );
      const owed = customer.consignments.reduce(
        (sum, consignment) => sum + Number(consignment.soldValue) - Number(consignment.amountPaid),
        0,
      );
      const overdue = customer.consignments.filter(
        (consignment) => consignment.dueDate && consignment.dueDate.getTime() < now,
      ).length;

      const { consignments, ...rest } = customer;
      return {
        ...rest,
        // The screens read `name`; keep supplying it so a trade account still
        // shows its shop name rather than a blank surname.
        name: customerDisplayName(customer),
        openConsignments: consignments.length,
        unitsHeld,
        owed,
        overdue,
      };
    });

    return { ...page, items };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        consignments: { include: { lines: true, payments: true }, orderBy: { issuedAt: 'desc' } },
      },
    });
    if (!customer) throw new NotFoundException(`Trade customer ${id} not found`);
    return { ...customer, name: customerDisplayName(customer) };
  }

  async update(id: string, dto: UpdateResellerDto) {
    await this.findOne(id);
    const { businessName, creditLimit, contactName, email, ...rest } = dto;
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...rest,
        // businessName is written only when the caller actually sent it --
        // never derived from contactName or a display-name fallback, which
        // is exactly the bug this fixes: the old `name` field conflated "the
        // trading name" with "whatever the list happens to display", so
        // re-saving a reseller with no business name silently promoted their
        // personal name into one.
        ...(businessName !== undefined ? { businessName: businessName.trim() || null } : {}),
        ...(contactName !== undefined ? { firstName: contactName } : {}),
        ...(email ? { email: email.trim().toLowerCase() } : {}),
        ...(creditLimit !== undefined ? { creditLimit: new Prisma.Decimal(creditLimit) } : {}),
      },
    });
  }

  /**
   * Demotes to retail rather than deleting.
   *
   * The record is a customer now, and may carry orders, invoices and a login
   * that have nothing to do with the trade relationship. Removing the trade
   * terms is what "delete this reseller" means here.
   */
  async remove(id: string) {
    const open = await this.prisma.consignment.count({
      where: { customerId: id, status: 'OPEN' },
    });
    if (open > 0) {
      throw new BadRequestException(
        `This trade account has ${open} open consignment(s). Settle or write them off first, or deactivate instead.`,
      );
    }
    return this.prisma.customer.update({
      where: { id },
      data: { priceTier: 'RETAIL', creditLimit: new Prisma.Decimal(0) },
    });
  }
}
