import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JournalSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { DEFAULT_ACCOUNT_CODES } from '../ledger/default-accounts';
import { CreateFixedAssetDto } from './dto/create-fixed-asset.dto';
import { DisposeFixedAssetDto } from './dto/dispose-fixed-asset.dto';

@Injectable()
export class FixedAssetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  create(dto: CreateFixedAssetDto) {
    return this.prisma.fixedAsset.create({
      data: {
        assetCode: dto.assetCode,
        description: dto.description,
        category: dto.category,
        storeId: dto.storeId,
        acquisitionDate: new Date(dto.acquisitionDate),
        acquisitionCost: dto.acquisitionCost,
        usefulLifeMonths: dto.usefulLifeMonths,
        depreciationMethod: dto.depreciationMethod || 'STRAIGHT_LINE',
        residualValue: dto.residualValue || 0,
      },
    });
  }

  findAll(params: { skip?: number; take?: number; storeId?: string; status?: string }) {
    const { skip, take, storeId, status } = params;
    return this.prisma.fixedAsset.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { acquisitionDate: 'desc' },
      skip,
      take,
    });
  }

  async findOne(id: string) {
    const asset = await this.prisma.fixedAsset.findUnique({
      where: { id },
      include: { depreciationSchedule: { orderBy: { periodStart: 'asc' } }, transfers: { orderBy: { transferDate: 'desc' } } },
    });
    if (!asset) {
      throw new NotFoundException(`Fixed asset ${id} not found`);
    }
    return asset;
  }

  private monthlyDepreciation(asset: { acquisitionCost: any; residualValue: any; usefulLifeMonths: number }) {
    const depreciableBase = Number(asset.acquisitionCost) - Number(asset.residualValue);
    return depreciableBase / asset.usefulLifeMonths;
  }

  /**
   * Posts one month of straight-line depreciation for every active asset that
   * hasn't already been depreciated for the given period. Safe to call
   * repeatedly for the same period — it skips assets already covered.
   */
  async runDepreciation(periodStartInput: string) {
    const periodStart = new Date(periodStartInput);
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);
    const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23, 59, 59);

    const assets = await this.prisma.fixedAsset.findMany({
      where: { status: 'ACTIVE', acquisitionDate: { lte: periodEnd } },
      include: { depreciationSchedule: true },
    });

    const depreciationExpenseAccount = await this.ledger.getAccountByCode(DEFAULT_ACCOUNT_CODES.DEPRECIATION_EXPENSE);
    const accumulatedDepreciationAccount = await this.ledger.getAccountByCode(DEFAULT_ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);

    const results: any[] = [];

    for (const asset of assets) {
      const alreadyPosted = asset.depreciationSchedule.some(
        (schedule) => schedule.periodStart.getTime() === periodStart.getTime(),
      );
      if (alreadyPosted) continue;

      const priorAccumulated = asset.depreciationSchedule.reduce(
        (sum, schedule) => Math.max(sum, Number(schedule.accumulatedDepreciation)),
        0,
      );
      const depreciableBase = Number(asset.acquisitionCost) - Number(asset.residualValue);
      if (priorAccumulated >= depreciableBase - 0.01) continue;

      const monthly = Math.min(this.monthlyDepreciation(asset), depreciableBase - priorAccumulated);
      const accumulated = priorAccumulated + monthly;
      const netBookValue = Number(asset.acquisitionCost) - accumulated;

      const journal = await this.ledger.postJournal({
        entryDate: periodEnd,
        memo: `Depreciation ${asset.assetCode} — ${periodStart.toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })}`,
        source: JournalSource.DEPRECIATION,
        sourceId: asset.id,
        lines: [
          { accountId: depreciationExpenseAccount.id, debit: monthly, storeId: asset.storeId || undefined },
          { accountId: accumulatedDepreciationAccount.id, credit: monthly, storeId: asset.storeId || undefined },
        ],
      });

      const schedule = await this.prisma.assetDepreciationSchedule.create({
        data: {
          assetId: asset.id,
          periodStart,
          periodEnd,
          depreciationAmount: monthly,
          accumulatedDepreciation: accumulated,
          netBookValue,
          journalEntryId: journal.id,
        },
      });

      results.push(schedule);
    }

    return { periodStart, periodEnd, postedCount: results.length, schedules: results };
  }

  async dispose(id: string, dto: DisposeFixedAssetDto) {
    const asset = await this.findOne(id);
    if (asset.status !== 'ACTIVE') {
      throw new BadRequestException('Only active assets can be disposed.');
    }
    return this.prisma.fixedAsset.update({
      where: { id },
      data: { status: 'DISPOSED', disposedAt: new Date(), disposalProceeds: dto.disposalProceeds || 0 },
    });
  }

  netBookValue(asset: { acquisitionCost: any; depreciationSchedule: { accumulatedDepreciation: any }[] }) {
    const accumulated = asset.depreciationSchedule.reduce(
      (max, schedule) => Math.max(max, Number(schedule.accumulatedDepreciation)),
      0,
    );
    return Number(asset.acquisitionCost) - accumulated;
  }
}
