import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { containsAny, paginate, searchOr } from '../common/pagination.util';

/**
 * Never select the portal password hash. Staff need to know *whether* a customer
 * has portal access, never the credential itself.
 */
const CUSTOMER_SELECT = Prisma.validator<Prisma.CustomerSelect>()({
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  priceTier: true,
  businessName: true,
  portalEnabled: true,
  portalLastLoginAt: true,
  createdAt: true,
});

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCustomerDto) {
    const email = dto.email?.trim().toLowerCase();
    return this.prisma.customer.create({
      data: {
        ...dto,
        // Email is the unique key and the portal login; a walk-in rung up
        // without one gets a placeholder derived from their phone instead, in
        // the same shape the reseller flow already uses for a trade account
        // opened with no address on hand. It cannot receive mail, so the
        // account stays inert until a real email is entered.
        email: email || `${dto.phone.replace(/[^0-9]/g, '')}@customer.invalid`,
      },
      select: CUSTOMER_SELECT,
    });
  }

  findAll(query: CustomerQueryDto) {
    const { skip, take, search, priceTier, isActive, sortBy } = query;
    const where: Prisma.CustomerWhereInput = {
      ...(priceTier ? { priceTier } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...searchOr(search, (term) =>
        containsAny(['firstName', 'lastName', 'email', 'phone', 'code', 'businessName'], term),
      ),
    };
    const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
      sortBy === 'name-desc'
        ? [{ firstName: 'desc' }, { lastName: 'desc' }, { id: 'asc' }]
        : sortBy === 'name-asc'
          ? [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }]
          : sortBy === 'email-asc'
            ? [{ email: 'asc' }, { id: 'asc' }]
            // Default: newest customer first, matching every other list in
            // the portal -- this used to default to alphabetical, the one
            // list in the app that didn't.
            : [{ createdAt: 'desc' }, { id: 'asc' }];
    return paginate(
      (args) => this.prisma.customer.findMany({ where, orderBy, select: CUSTOMER_SELECT, ...args }),
      () => this.prisma.customer.count({ where }),
      skip,
      take,
    );
  }

  findOne(id: string) {
    return this.prisma.customer.findUnique({ where: { id }, select: CUSTOMER_SELECT });
  }

  update(id: string, dto: UpdateCustomerDto) {
    return this.prisma.customer.update({ where: { id }, data: dto, select: CUSTOMER_SELECT });
  }

  remove(id: string) {
    return this.prisma.customer.delete({ where: { id }, select: CUSTOMER_SELECT });
  }

  /** Staff-issued portal credential. Also enables access if it was off. */
  async setPortalPassword(id: string, password: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    if (!customer.email) {
      throw new BadRequestException('Customer needs an email address before portal access can be granted.');
    }

    return this.prisma.customer.update({
      where: { id },
      data: {
        portalPassword: await bcrypt.hash(password, 10),
        portalEnabled: true,
      },
      select: CUSTOMER_SELECT,
    });
  }

  /**
   * Revokes access but keeps the credential, so re-enabling does not require
   * issuing a new password.
   */
  async setPortalEnabled(id: string, enabled: boolean) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    if (enabled && !customer.portalPassword) {
      throw new BadRequestException('Set a portal password before enabling access.');
    }

    return this.prisma.customer.update({
      where: { id },
      data: { portalEnabled: enabled },
      select: CUSTOMER_SELECT,
    });
  }

  /**
   * The customer base by trade tier -- retail shoppers versus the resellers
   * and wholesale accounts, which is the split the rest of the reports do not
   * show: consignment exposure covers what is out with resellers, but not how
   * many trade accounts there are or whether the base is growing.
   */
  async stats() {
    const since = new Date();
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);

    const [byTier, active, inactive, newLast30Days, total, portalEnabled] = await Promise.all([
      this.prisma.customer.groupBy({ by: ['priceTier'], _count: true }),
      this.prisma.customer.count({ where: { isActive: true } }),
      this.prisma.customer.count({ where: { isActive: false } }),
      this.prisma.customer.count({ where: { createdAt: { gte: since } } }),
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { portalEnabled: true } }),
    ]);

    return {
      total,
      active,
      inactive,
      newLast30Days,
      portalEnabled,
      byTier: byTier.map((row) => ({ tier: row.priceTier, count: row._count })),
      // Same rows, framed for the resellers screen: retail is the shop's own
      // customers and everything else is a trade account.
      resellers: byTier
        .filter((row) => row.priceTier !== 'RETAIL')
        .reduce((sum, row) => sum + row._count, 0),
    };
  }
}
