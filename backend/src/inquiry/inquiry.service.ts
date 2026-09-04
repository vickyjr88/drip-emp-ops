import { Injectable, NotFoundException } from '@nestjs/common';
import { InquiryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination.util';
import { OwnerNotificationService } from '../email-log/owner-notification.service';
import { CreateInquiryDto } from './dto/inquiry.dto';
import { InquiryQueryDto } from './dto/inquiry-query.dto';
import { normalizePhoneNumber } from '../common/phone.util';

@Injectable()
export class InquiryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownerNotification: OwnerNotificationService,
  ) {}

  async create(dto: CreateInquiryDto) {
    const inquiry = await this.prisma.inquiry.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone ? normalizePhoneNumber(dto.phone) ?? dto.phone.trim() : null,
        message: dto.message.trim(),
      },
    });

    void this.ownerNotification.notifyContactForm({
      name: inquiry.name,
      email: inquiry.email,
      phone: inquiry.phone,
      message: inquiry.message,
    });

    return inquiry;
  }

  async findAll(query: InquiryQueryDto) {
    const { skip, take, search, status } = query;
    const where: Prisma.InquiryWhereInput = {
      ...(status ? { status } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { name: { contains: search.trim(), mode: 'insensitive' } },
              { email: { contains: search.trim(), mode: 'insensitive' } },
              { phone: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return paginate(
      (args) => this.prisma.inquiry.findMany({ ...args, where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }),
      () => this.prisma.inquiry.count({ where }),
      skip,
      take,
    );
  }

  async setStatus(id: string, status: InquiryStatus) {
    const inquiry = await this.prisma.inquiry.findUnique({ where: { id } });
    if (!inquiry) throw new NotFoundException(`Inquiry ${id} not found`);
    return this.prisma.inquiry.update({ where: { id }, data: { status } });
  }

  /** Counts by status, plus the last 14 days as a daily trend -- whether the shop is getting asked more or fewer questions lately. */
  async stats() {
    const since = new Date();
    since.setDate(since.getDate() - 13);
    since.setHours(0, 0, 0, 0);

    const [byStatus, total, recent] = await Promise.all([
      this.prisma.inquiry.groupBy({ by: ['status'], _count: true }),
      this.prisma.inquiry.count(),
      this.prisma.inquiry.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    ]);

    const dayKey = (date: Date) => date.toISOString().slice(0, 10);
    const counts = new Map<string, number>();
    for (const row of recent) {
      const key = dayKey(row.createdAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const trend: Array<{ date: string; count: number }> = [];
    for (let index = 0; index < 14; index += 1) {
      const day = new Date(since);
      day.setDate(since.getDate() + index);
      const key = dayKey(day);
      trend.push({ date: key, count: counts.get(key) ?? 0 });
    }

    return {
      total,
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count })),
      open: byStatus.filter((row) => row.status !== 'RESOLVED').reduce((sum, row) => sum + row._count, 0),
      trend,
    };
  }
}
