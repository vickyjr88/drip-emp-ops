import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { containsAny, paginate, searchOr } from '../common/pagination.util';
import { placeholderEmailFor, realEmail } from '../common/contact-email';
import { MauticService } from '../mautic/mautic.service';
import { isSearchable, likeEscape, parseLookup, phoneKey } from './customer-lookup';

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
  constructor(private readonly prisma: PrismaService, private readonly mautic: MauticService) {}

  /**
   * Adds a customer. Someone who is already on file is not added twice: the same email, or the same phone number written any way (0712..., +254712...),
   * answers with who they are, so the till can use that record instead of making a second one. (Before this the second one hit the unique email
   * and failed with a server error.)
   */
  async create(dto: CreateCustomerDto) {
    const email = dto.email?.trim().toLowerCase();
    const key = phoneKey(dto.phone);
    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT c.id FROM "Customer" c
      WHERE ${email ? Prisma.sql`c.email = ${email} OR` : Prisma.empty}
            c.email = ${placeholderEmailFor(dto.phone)}
            ${key ? Prisma.sql`OR right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 9) = ${key}` : Prisma.empty}
      LIMIT 1`);
    if (existing[0]) {
      const found = await this.prisma.customer.findUniqueOrThrow({ where: { id: existing[0].id }, select: CUSTOMER_SELECT });
      throw new ConflictException({
        statusCode: 409,
        message: `${found.firstName} ${found.lastName}`.trim() + ' is already a customer with this ' + (email && found.email === email ? 'email' : 'phone number') + '.',
        existing: found,
      });
    }
    return this.prisma.customer.create({
      data: {
        ...dto,
        // Email is the unique key and the portal login; a walk-in rung up
        // without one gets a placeholder derived from their phone instead, in
        // the same shape the reseller flow already uses for a trade account
        // opened with no address on hand. It cannot receive mail, so the
        // account stays inert until a real email is entered.
        email: email || placeholderEmailFor(dto.phone),
      },
      select: CUSTOMER_SELECT,
    });
  }

  /**
   * The till's customer box: type a name, a mobile number in any format, or an email, in one field, and get the few customers who match, the ones who
   * buy most often first. Matches the words of a name against the first and last name, the business name, the trade code and the email; a number is
   * compared by its digits so 0712 345 678 finds +254712345678.
   */
  async lookup(raw: string, limit = 8) {
    const q = parseLookup(raw);
    if (!isSearchable(q)) return [];
    const conditions: Prisma.Sql[] = [Prisma.sql`c."isActive" = true`];
    // Everything a person might type a name or an email against, in one lower-case string. A stand-in address (a phone number with no email) is not searched.
    const haystack = Prisma.sql`lower(c."firstName" || ' ' || c."lastName" || ' ' || coalesce(c."businessName", '') || ' ' || coalesce(c.code, '') || ' ' || CASE WHEN c.email LIKE '%.invalid' THEN '' ELSE c.email END)`;
    for (const word of q.words) conditions.push(Prisma.sql`${haystack} LIKE ${`%${likeEscape(word)}%`}`);
    if (q.email) conditions.push(Prisma.sql`c.email LIKE ${`%${likeEscape(q.email)}%`} AND c.email NOT LIKE '%.invalid'`);
    if (q.phone) conditions.push(Prisma.sql`regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE ${`%${likeEscape(q.phone)}%`}`);
    const exactPhone = q.phone ? Prisma.sql`right(regexp_replace(c.phone, '[^0-9]', '', 'g'), length(${q.phone})) = ${q.phone}` : Prisma.sql`false`;

    const rows = await this.prisma.$queryRaw<Array<{
      id: string; firstName: string; lastName: string; email: string; phone: string; priceTier: string; businessName: string | null;
      orders: number; lastOrderAt: Date | null;
    }>>(Prisma.sql`
      SELECT c.id, c."firstName", c."lastName", c.email, c.phone, c."priceTier"::text AS "priceTier", c."businessName",
             (SELECT count(*) FROM "Order" o WHERE o."customerId" = c.id)::int AS orders,
             (SELECT max(o."placedAt") FROM "Order" o WHERE o."customerId" = c.id) AS "lastOrderAt"
      FROM "Customer" c
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY (CASE WHEN ${exactPhone} THEN 0 ELSE 1 END), orders DESC, "lastOrderAt" DESC NULLS LAST, c."firstName", c."lastName"
      LIMIT ${Math.min(20, Math.max(1, limit))}`);
    // A stand-in address is not shown as if it were the customer's.
    return rows.map((r) => ({ ...r, email: realEmail(r.email) }));
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

  /**
   * Edits a customer. Giving a customer who had no email one is the moment to tell Mautic: the contact it holds for their phone number gains
   * the address (see MauticService.syncContact), so nobody is left in Mautic as a number with no email once the shop has found the email.
   */
  async update(id: string, dto: UpdateCustomerDto) {
    const { email: typed, ...rest } = dto;
    const email = typed === undefined ? undefined : realEmail(typed);
    if (typed !== undefined && typed.trim() !== '' && !email) {
      throw new BadRequestException('That is not an email address a customer can be reached on.');
    }
    const before = await this.prisma.customer.findUnique({ where: { id }, select: { email: true } });
    if (!before) throw new NotFoundException(`Customer ${id} not found`);
    if (email && email !== before.email) {
      const taken = await this.prisma.customer.findUnique({ where: { email }, select: { id: true } });
      if (taken && taken.id !== id) throw new BadRequestException('That email already belongs to another customer.');
    }

    const updated = await this.prisma.customer.update({ where: { id }, data: { ...rest, ...(email ? { email } : {}) }, select: CUSTOMER_SELECT });

    if (email && realEmail(before.email) !== email) {
      void this.mautic.syncContact({ email, firstName: updated.firstName, lastName: updated.lastName, phone: updated.phone });
    }
    return updated;
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
