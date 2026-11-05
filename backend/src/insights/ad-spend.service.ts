import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sourceLabel } from './visit';

export type AdSpendInput = { day?: unknown; source?: unknown; campaign?: unknown; amountKes?: unknown; note?: unknown };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 100_000_000;

/** What staff typed, checked and tidied. The source is named the way Insights names it ("fb" becomes Facebook). */
export function cleanAdSpend(raw: AdSpendInput) {
  const day = typeof raw.day === 'string' ? raw.day : '';
  if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) throw new BadRequestException('Pick the day the money was spent.');
  if (Date.parse(`${day}T00:00:00Z`) > Date.now() + 24 * 3600_000) throw new BadRequestException('That day is in the future.');
  const source = typeof raw.source === 'string' ? sourceLabel(raw.source) : '';
  if (!source) throw new BadRequestException('Say where the ad ran: Facebook, TikTok, Google...');
  const amount = Number(raw.amountKes);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new BadRequestException('Enter the amount spent, more than 0.');
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  return { day: new Date(`${day}T00:00:00Z`), source, campaign: text(raw.campaign, 80), amountKes: Math.round(amount * 100) / 100, note: text(raw.note, 200) };
}

@Injectable()
export class AdSpendService {
  constructor(private prisma: PrismaService) {}

  async list(from: Date, to: Date) {
    const rows = await this.prisma.adSpend.findMany({ where: { day: { gte: from, lte: to } }, orderBy: [{ day: 'desc' }, { createdAt: 'desc' }], take: 200 });
    return rows.map((r) => ({ id: r.id, day: r.day.toISOString().slice(0, 10), source: r.source, campaign: r.campaign, amountKes: Number(r.amountKes), note: r.note }));
  }

  async create(raw: AdSpendInput) {
    const data = cleanAdSpend(raw);
    const row = await this.prisma.adSpend.create({ data: { ...data, amountKes: new Prisma.Decimal(data.amountKes) } });
    return { id: row.id };
  }

  async remove(id: string) {
    const row = await this.prisma.adSpend.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('That entry no longer exists.');
    await this.prisma.adSpend.delete({ where: { id } });
    return { removed: true };
  }
}
