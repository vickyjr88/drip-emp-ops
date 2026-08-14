import { Injectable } from '@nestjs/common';
import { RentalPaymentCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRentalPaymentDto } from './dto/create-rental-payment.dto';
import { UpdateRentalPaymentDto } from './dto/update-rental-payment.dto';
import { CollectionsQueryDto, RentalPaymentQueryDto } from '../common/dto/filter-pagination.dto';

@Injectable()
export class RentalPaymentService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDates<T extends {
    paymentDate?: string;
    billingPeriodStart?: string | null;
    billingPeriodEnd?: string | null;
  }>(dto: T) {
    const next: any = { ...dto };
    if (dto.paymentDate) {
      next.paymentDate = new Date(dto.paymentDate);
    }
    if (dto.billingPeriodStart !== undefined) {
      next.billingPeriodStart = dto.billingPeriodStart ? new Date(dto.billingPeriodStart) : null;
    }
    if (dto.billingPeriodEnd !== undefined) {
      next.billingPeriodEnd = dto.billingPeriodEnd ? new Date(dto.billingPeriodEnd) : null;
    }
    return next;
  }

  private endOfDay(date: Date) {
    const copy = new Date(date);
    copy.setHours(23, 59, 59, 999);
    return copy;
  }

  create(dto: CreateRentalPaymentDto) {
    return this.prisma.rentalPayment.create({ data: this.normalizeDates(dto) as any });
  }

  findAll(query: RentalPaymentQueryDto) {
    const { skip, take, tenancyId, unitId, category, from, to } = query;

    const paymentDateFilter: { gte?: Date; lte?: Date } = {};
    if (from) {
      paymentDateFilter.gte = new Date(from);
    }
    if (to) {
      paymentDateFilter.lte = this.endOfDay(new Date(to));
    }

    return this.prisma.rentalPayment.findMany({
      where: {
        ...(tenancyId ? { tenancyId } : {}),
        ...(category ? { category: category as RentalPaymentCategory } : {}),
        ...(Object.keys(paymentDateFilter).length ? { paymentDate: paymentDateFilter } : {}),
        ...(unitId ? { tenancy: { unitId } } : {}),
      },
      skip,
      take,
      orderBy: { paymentDate: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.rentalPayment.findUnique({ where: { id } });
  }

  update(id: string, dto: UpdateRentalPaymentDto) {
    return this.prisma.rentalPayment.update({
      where: { id },
      data: this.normalizeDates(dto) as any,
    });
  }

  remove(id: string) {
    return this.prisma.rentalPayment.delete({ where: { id } });
  }

  async collections(query: CollectionsQueryDto) {
    const currency = query.currency || 'KES';
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = query.from ? new Date(query.from) : defaultFrom;
    const to = query.to ? this.endOfDay(new Date(query.to)) : this.endOfDay(now);

    const payments = await this.prisma.rentalPayment.findMany({
      where: {
        currency,
        paymentDate: { gte: from, lte: to },
        ...(query.tenancyId ? { tenancyId: query.tenancyId } : {}),
        ...(query.unitId ? { tenancy: { unitId: query.unitId } } : {}),
      },
      orderBy: { paymentDate: 'asc' },
    });

    const byCategoryMap = new Map<string, { category: string; total: number; count: number }>();
    const byMonthMap = new Map<string, { month: string; total: number; byCategory: Record<string, number> }>();
    let grandTotal = 0;

    for (const payment of payments) {
      const amount = Number(payment.amountPaid || 0);
      grandTotal += amount;

      const categoryKey = payment.category;
      const categoryEntry = byCategoryMap.get(categoryKey) || {
        category: categoryKey,
        total: 0,
        count: 0,
      };
      categoryEntry.total += amount;
      categoryEntry.count += 1;
      byCategoryMap.set(categoryKey, categoryEntry);

      const month = payment.paymentDate.toISOString().slice(0, 7);
      const monthEntry = byMonthMap.get(month) || {
        month,
        total: 0,
        byCategory: {} as Record<string, number>,
      };
      monthEntry.total += amount;
      monthEntry.byCategory[categoryKey] = (monthEntry.byCategory[categoryKey] || 0) + amount;
      byMonthMap.set(month, monthEntry);
    }

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      currency,
      grandTotal,
      paymentCount: payments.length,
      byCategory: Array.from(byCategoryMap.values()).sort((a, b) => b.total - a.total),
      byMonth: Array.from(byMonthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
    };
  }
}
