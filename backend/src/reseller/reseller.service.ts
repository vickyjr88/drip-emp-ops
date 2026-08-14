import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateResellerDto, UpdateResellerDto } from './dto/reseller.dto';

@Injectable()
export class ResellerService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateResellerDto) {
    return this.prisma.reseller.create({
      data: { ...dto, creditLimit: new Prisma.Decimal(dto.creditLimit ?? 0) },
    });
  }

  /**
   * Resellers with what each is holding and owes.
   *
   * Both figures come from the open consignments rather than a stored balance,
   * so they cannot drift from the pickups they are derived from.
   */
  async findAll(includeInactive = false) {
    const rows = await this.prisma.reseller.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: { consignments: { where: { status: 'OPEN' }, include: { lines: true } } },
      orderBy: { name: 'asc' },
    });

    const now = Date.now();
    return rows.map((reseller) => {
      const unitsHeld = reseller.consignments.reduce(
        (sum, consignment) =>
          sum +
          consignment.lines.reduce(
            (lineSum, line) => lineSum + (line.quantityOut - line.quantitySold - line.quantityReturned),
            0,
          ),
        0,
      );
      const owed = reseller.consignments.reduce(
        (sum, consignment) => sum + Number(consignment.soldValue) - Number(consignment.amountPaid),
        0,
      );
      const overdue = reseller.consignments.filter(
        (consignment) => consignment.dueDate && consignment.dueDate.getTime() < now,
      ).length;

      const { consignments, ...rest } = reseller;
      return { ...rest, openConsignments: consignments.length, unitsHeld, owed, overdue };
    });
  }

  async findOne(id: string) {
    const reseller = await this.prisma.reseller.findUnique({
      where: { id },
      include: {
        consignments: { include: { lines: true, payments: true }, orderBy: { issuedAt: 'desc' } },
      },
    });
    if (!reseller) throw new NotFoundException(`Reseller ${id} not found`);
    return reseller;
  }

  async update(id: string, dto: UpdateResellerDto) {
    await this.findOne(id);
    return this.prisma.reseller.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.creditLimit !== undefined ? { creditLimit: new Prisma.Decimal(dto.creditLimit) } : {}),
      },
    });
  }

  /** Refuses while they are still holding stock -- the history has to survive. */
  async remove(id: string) {
    const open = await this.prisma.consignment.count({ where: { resellerId: id, status: 'OPEN' } });
    if (open > 0) {
      throw new BadRequestException(
        `This reseller has ${open} open consignment(s). Settle or write them off first, or deactivate instead.`,
      );
    }
    const any = await this.prisma.consignment.count({ where: { resellerId: id } });
    if (any > 0) {
      throw new BadRequestException(
        'This reseller has consignment history. Deactivate them instead so the record survives.',
      );
    }
    return this.prisma.reseller.delete({ where: { id } });
  }
}
