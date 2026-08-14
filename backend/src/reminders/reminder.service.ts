import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReminderDispatchStatus, ReminderTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderEngineService } from './reminder-engine.service';
import { ReminderQueueService } from './reminder-queue.service';
import { CreateReminderRuleDto, UpdateReminderRuleDto } from './dto/reminder-rule.dto';

@Injectable()
export class ReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ReminderEngineService,
    private readonly queue: ReminderQueueService,
  ) {}

  private validate(dto: CreateReminderRuleDto | UpdateReminderRuleDto) {
    if (dto.utilityCategory && dto.targetType && dto.targetType !== 'UTILITY') {
      throw new BadRequestException('utilityCategory only applies to UTILITY rules.');
    }
    // Half a quiet-hours window would silently never match.
    const hasStart = dto.quietHoursStart !== undefined && dto.quietHoursStart !== null;
    const hasEnd = dto.quietHoursEnd !== undefined && dto.quietHoursEnd !== null;
    if (hasStart !== hasEnd) {
      throw new BadRequestException('Set both quietHoursStart and quietHoursEnd, or neither.');
    }
  }

  createRule(dto: CreateReminderRuleDto, createdBy?: string) {
    this.validate(dto);
    return this.prisma.reminderRule.create({
      data: { ...dto, createdBy: createdBy || 'system' } as any,
    });
  }

  findRules(params: { targetType?: ReminderTargetType; isActive?: boolean } = {}) {
    return this.prisma.reminderRule.findMany({
      where: {
        ...(params.targetType ? { targetType: params.targetType } : {}),
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      },
      orderBy: [{ targetType: 'asc' }, { timing: 'asc' }, { offsetDays: 'desc' }],
    });
  }

  async findRule(id: string) {
    const rule = await this.prisma.reminderRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException(`Reminder rule ${id} not found`);
    return rule;
  }

  async updateRule(id: string, dto: UpdateReminderRuleDto) {
    await this.findRule(id);
    this.validate(dto);
    return this.prisma.reminderRule.update({ where: { id }, data: dto as any });
  }

  async removeRule(id: string) {
    await this.findRule(id);
    // Logs survive with ruleId nulled (onDelete: SetNull) so the audit trail of
    // what was actually sent is not lost when a rule is retired.
    return this.prisma.reminderRule.delete({ where: { id } });
  }

  /**
   * What would be sent, without sending it. The same planner the scheduler uses,
   * so a preview cannot drift from reality.
   */
  async preview(options: {
    runDate?: string;
    ruleIds?: string[];
    storeId?: string;
    targetId?: string;
    ignoreTiming?: boolean;
  }) {
    const planned = await this.engine.plan({
      runDate: options.runDate ? new Date(options.runDate) : undefined,
      ruleIds: options.ruleIds,
      storeId: options.storeId ?? null,
      targetId: options.targetId ?? null,
      ignoreTiming: options.ignoreTiming,
    });

    return {
      runDate: options.runDate ?? new Date().toISOString().slice(0, 10),
      count: planned.length,
      items: planned.map((item) => ({
        ruleId: item.rule.id,
        ruleName: item.rule.name,
        channel: item.rule.channel,
        targetType: item.target.targetType,
        targetId: item.target.targetId,
        dueDate: item.target.dueDate,
        customerName: item.target.customerName,
        recipientPhone: item.target.phone,
        recipientEmail: item.target.email,
        amountOutstanding: Math.max(item.target.amountDue - item.target.amountPaid, 0),
        currency: item.target.currency,
        description: item.target.description,
        smsBody: item.smsBody,
        emailSubject: item.emailSubject,
        skipReason: item.skipReason,
      })),
    };
  }

  /**
   * Queues a run now. `ignoreTiming` lets an operator chase a specific charge
   * outside its schedule, which is the point of a manual trigger; dedupe still
   * prevents a second message for the same charge on the same due date.
   */
  async trigger(options: {
    ruleIds?: string[];
    storeId?: string;
    targetId?: string;
    ignoreTiming?: boolean;
    triggeredBy?: string;
  }) {
    return this.queue.enqueueScan({
      ruleIds: options.ruleIds,
      storeId: options.storeId ?? null,
      targetId: options.targetId ?? null,
      ignoreTiming: options.ignoreTiming,
      isManual: true,
      triggeredBy: options.triggeredBy,
    });
  }

  findLogs(params: {
    status?: ReminderDispatchStatus;
    targetType?: ReminderTargetType;
    customerId?: string;
    ruleId?: string;
    take?: number;
  }) {
    return this.prisma.reminderLog.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.targetType ? { targetType: params.targetType } : {}),
        ...(params.customerId ? { customerId: params.customerId } : {}),
        ...(params.ruleId ? { ruleId: params.ruleId } : {}),
      },
      include: { rule: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.take ?? 100, 500),
    });
  }

  async stats() {
    const [byStatus, queue] = await Promise.all([
      this.prisma.reminderLog.groupBy({ by: ['status'], _count: { _all: true } }),
      this.queue.stats(),
    ]);

    return {
      logs: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
      queue,
    };
  }
}
