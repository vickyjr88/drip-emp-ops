import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

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
  portalEnabled: true,
  portalLastLoginAt: true,
  createdAt: true,
});

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto, select: CUSTOMER_SELECT });
  }

  findAll(pagination: PaginationDto) {
    const { skip, take } = pagination;
    return this.prisma.customer.findMany({ skip, take, select: CUSTOMER_SELECT });
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
}
