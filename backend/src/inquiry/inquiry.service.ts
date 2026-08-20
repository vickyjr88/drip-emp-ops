import { Injectable, NotFoundException } from '@nestjs/common';
import { InquiryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination.util';
import { OwnerNotificationService } from '../email-log/owner-notification.service';
import { CreateInquiryDto } from './dto/inquiry.dto';
import { InquiryQueryDto } from './dto/inquiry-query.dto';

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
        phone: dto.phone?.trim() || null,
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
}
