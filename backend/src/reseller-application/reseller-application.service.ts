import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnerNotificationService } from '../email-log/owner-notification.service';
import { customerDisplayName } from '../customer/customer-name';
import { paginate } from '../common/pagination.util';
import { SubmitResellerApplicationDto } from '../customer-portal/dto/customer-portal.dto';
import { ResellerApplicationQueryDto } from './dto/reseller-application-query.dto';

/**
 * A customer's own request to buy at trade prices, reviewed by staff.
 *
 * Approving flips Customer.priceTier directly rather than going through
 * ResellerService.update() -- that method's DTO requires a trade `code`,
 * which an applicant does not have yet. Tier and trade-code/credit-limit
 * assignment are already separable in this codebase (see
 * ResellerService.remove()'s "demote to RETAIL" pattern, which flips tier
 * and zeroes credit limit without touching code) -- approving here is the
 * same kind of tier-only decision, with code/credit-limit left as the
 * natural next step staff complete from the Resellers list afterward.
 */
@Injectable()
export class ResellerApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownerNotification: OwnerNotificationService,
  ) {}

  async create(customerId: string, dto: SubmitResellerApplicationDto) {
    const pending = await this.prisma.resellerApplication.findFirst({
      where: { customerId, status: 'PENDING' },
    });
    if (pending) {
      throw new BadRequestException('You already have an application awaiting review.');
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    const application = await this.prisma.resellerApplication.create({
      data: { customerId, businessName: dto.businessName.trim(), reason: dto.reason.trim() },
    });

    void this.ownerNotification.notifyResellerApplication({
      customerName: customerDisplayName(customer!),
      customerEmail: customer!.email,
      businessName: application.businessName,
      reason: application.reason,
    });

    return application;
  }

  async findAll(query: ResellerApplicationQueryDto) {
    const { skip, take, search, status } = query;
    const where: Prisma.ResellerApplicationWhereInput = {
      ...(status ? { status } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { businessName: { contains: search.trim(), mode: 'insensitive' } },
              { customer: { firstName: { contains: search.trim(), mode: 'insensitive' } } },
              { customer: { lastName: { contains: search.trim(), mode: 'insensitive' } } },
              { customer: { email: { contains: search.trim(), mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    return paginate(
      (args) =>
        this.prisma.resellerApplication.findMany({
          ...args,
          where,
          include: {
            customer: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, priceTier: true },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
      () => this.prisma.resellerApplication.count({ where }),
      skip,
      take,
    );
  }

  async approve(id: string, reviewedBy: string) {
    const application = await this.prisma.resellerApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundException(`Application ${id} not found`);
    if (application.status !== 'PENDING') {
      throw new BadRequestException('Only a pending application can be approved.');
    }

    await this.prisma.customer.update({
      where: { id: application.customerId },
      data: { priceTier: 'RESELLER' },
    });

    return this.prisma.resellerApplication.update({
      where: { id },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy },
    });
  }

  async reject(id: string, reviewedBy: string) {
    const application = await this.prisma.resellerApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundException(`Application ${id} not found`);
    if (application.status !== 'PENDING') {
      throw new BadRequestException('Only a pending application can be rejected.');
    }
    return this.prisma.resellerApplication.update({
      where: { id },
      data: { status: 'REJECTED', reviewedAt: new Date(), reviewedBy },
    });
  }
}
