import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ReminderChannel, ReminderRule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../notifications/sms.service';
import { BrevoService } from '../email-log/brevo.service';
import { ReminderTargetService, daysBetween, startOfDay } from './reminder-target.service';
import { ReminderTarget } from './reminder.types';

export type PlannedReminder = {
  rule: ReminderRule;
  target: ReminderTarget;
  smsBody?: string;
  emailSubject?: string;
  emailBody?: string;
  /** Set when the reminder cannot be delivered; recorded as SKIPPED. */
  skipReason?: string;
};

const DEFAULT_SMS_TEMPLATE =
  'Hi {{customerName}}, a payment of {{currency}} {{amount}} for {{description}} is due on {{dueDate}}. Thank you, {{projectName}}.';
const DEFAULT_EMAIL_SUBJECT = 'Payment reminder: {{description}}';

function formatAmount(value: number): string {
  return value.toLocaleString('en-KE', { maximumFractionDigits: 2 });
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class ReminderEngineService {
  private readonly logger = new Logger(ReminderEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: ReminderTargetService,
    private readonly sms: SmsService,
    private readonly email: BrevoService,
  ) {}

  /**
   * Works out every reminder that should go out on `runDate`, without sending
   * anything. Used by the scheduler, the manual trigger and the dry-run preview
   * alike, so what an operator previews is exactly what would be sent.
   */
  async plan(options: {
    runDate?: Date;
    ruleIds?: string[];
    storeId?: string | null;
    targetId?: string | null;
    /** Manual sends bypass the offset match: the operator chose the moment. */
    ignoreTiming?: boolean;
  } = {}): Promise<PlannedReminder[]> {
    const runDate = startOfDay(options.runDate ?? new Date());

    const rules = await this.prisma.reminderRule.findMany({
      where: {
        isActive: true,
        ...(options.ruleIds?.length ? { id: { in: options.ruleIds } } : {}),
        ...(options.storeId ? { OR: [{ storeId: options.storeId }, { storeId: null }] } : {}),
      },
    });
    if (rules.length === 0) return [];

    // Only load charges that some rule could plausibly fire on.
    //
    // The window comes from every active rule, not just the selected ones: with
    // ignoreTiming a manual send for one narrow-offset rule would otherwise use
    // a window too small to contain its own charge, and silently plan nothing.
    const offsetRules = options.ruleIds?.length
      ? await this.prisma.reminderRule.findMany({
          where: { isActive: true },
          select: { offsetDays: true },
        })
      : rules;
    const maxOffset = Math.max(...offsetRules.map((rule) => rule.offsetDays), 0);
    const from = new Date(runDate);
    from.setUTCDate(from.getUTCDate() - maxOffset);
    const to = new Date(runDate);
    to.setUTCDate(to.getUTCDate() + maxOffset);

    const targets = await this.targets.resolve({
      targetTypes: [...new Set(rules.map((rule) => rule.targetType))],
      from,
      to,
      storeId: options.storeId ?? null,
      targetId: options.targetId ?? null,
    });

    const planned: PlannedReminder[] = [];
    for (const rule of rules) {
      for (const target of targets) {
        if (target.targetType !== rule.targetType) continue;
        if (rule.storeId && target.storeId !== rule.storeId) continue;
        if (
          rule.targetType === 'UTILITY' &&
          rule.utilityCategory &&
          !target.targetId.endsWith(`:${rule.utilityCategory}`)
        ) {
          continue;
        }

        if (!options.ignoreTiming && !this.matchesTiming(rule, target, runDate)) continue;

        // Never chase a settled charge, even on a BEFORE_DUE rule -- paying
        // early should stop the reminders, not be rewarded with more of them.
        if (target.isPaid) continue;

        planned.push({ rule, target, ...this.render(rule, target, runDate) });
      }
    }

    return planned;
  }

  private matchesTiming(rule: ReminderRule, target: ReminderTarget, runDate: Date): boolean {
    // Positive => due in the future, negative => overdue.
    const delta = daysBetween(runDate, target.dueDate);

    switch (rule.timing) {
      case 'BEFORE_DUE':
        return delta === rule.offsetDays;
      case 'ON_DUE_DATE':
        return delta === 0;
      case 'AFTER_DUE_IF_UNPAID':
        return delta === -rule.offsetDays && !target.isPaid;
      default:
        return false;
    }
  }

  /** Substitutes {{variables}} and decides which channels have a usable body. */
  private render(rule: ReminderRule, target: ReminderTarget, runDate: Date) {
    const outstanding = Math.max(target.amountDue - target.amountPaid, 0);
    const delta = daysBetween(runDate, target.dueDate);

    const variables: Record<string, string> = {
      customerName: target.customerName,
      amount: formatAmount(outstanding),
      totalAmount: formatAmount(target.amountDue),
      amountPaid: formatAmount(target.amountPaid),
      currency: target.currency,
      dueDate: formatDate(target.dueDate),
      daysUntilDue: String(Math.max(delta, 0)),
      daysOverdue: String(Math.max(-delta, 0)),
      unitNumber: target.unitNumber ?? '',
      projectName: target.projectName ?? 'Drip Emporium',
      description: target.description,
      reference: target.reference ?? '',
    };

    const fill = (template: string) =>
      template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => variables[key] ?? '');

    const wantsSms = rule.channel === 'SMS' || rule.channel === 'BOTH';
    const wantsEmail = rule.channel === 'EMAIL' || rule.channel === 'BOTH';

    const smsBody = wantsSms ? fill(rule.smsTemplate || DEFAULT_SMS_TEMPLATE) : undefined;
    const emailSubject = wantsEmail ? fill(rule.emailSubject || DEFAULT_EMAIL_SUBJECT) : undefined;
    const emailBody = wantsEmail
      ? fill(rule.emailTemplate || this.defaultEmailBody())
      : undefined;

    // A rule asking for SMS to someone with no phone cannot be delivered; record
    // why rather than failing silently.
    const missing: string[] = [];
    if (wantsSms && !target.phone) missing.push('no phone number on file');
    if (wantsEmail && !target.email) missing.push('no email address on file');
    const skipReason =
      missing.length === (rule.channel === 'BOTH' ? 2 : 1) ? missing.join('; ') : undefined;

    return { smsBody, emailSubject, emailBody, skipReason };
  }

  private defaultEmailBody(): string {
    return [
      '<p>Dear {{customerName}},</p>',
      '<p>This is a reminder that <strong>{{currency}} {{amount}}</strong> for {{description}}',
      'is due on <strong>{{dueDate}}</strong>.</p>',
      '<p>If you have already made this payment, please disregard this message.</p>',
      '<p>Kind regards,<br/>{{projectName}}</p>',
    ].join(' ');
  }

  /**
   * Sends one planned reminder and records the attempt.
   *
   * The ReminderLog unique constraint is the dedupe: a second attempt for the
   * same rule/target/due date collides and is reported as a duplicate rather
   * than messaging the customer twice. That is what makes the scheduler safe to
   * re-run and the manual trigger safe to press twice.
   */
  async dispatch(
    planned: PlannedReminder,
    options: { isManual?: boolean; triggeredBy?: string } = {},
  ): Promise<{ status: string; reason?: string }> {
    const { rule, target } = planned;

    let log;
    try {
      log = await this.prisma.reminderLog.create({
        data: {
          ruleId: rule.id,
          targetType: target.targetType,
          targetId: target.targetId,
          dueDate: target.dueDate,
          customerId: target.customerId,
          channel: rule.channel,
          recipientPhone: target.phone,
          recipientEmail: target.email,
          smsBody: planned.smsBody,
          emailSubject: planned.emailSubject,
          emailBody: planned.emailBody,
          amount: new Prisma.Decimal(Math.max(target.amountDue - target.amountPaid, 0)),
          currency: target.currency,
          isManual: Boolean(options.isManual),
          triggeredBy: options.triggeredBy,
          status: 'PENDING',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { status: 'DUPLICATE', reason: 'Already sent for this charge and due date' };
      }
      throw error;
    }

    if (planned.skipReason) {
      await this.prisma.reminderLog.update({
        where: { id: log.id },
        data: { status: 'SKIPPED', statusReason: planned.skipReason },
      });
      return { status: 'SKIPPED', reason: planned.skipReason };
    }

    const failures: string[] = [];
    let anyDelivered = false;

    if (planned.smsBody && target.phone) {
      const result = await this.sms.send({ to: target.phone, message: planned.smsBody });
      if (result.delivered) anyDelivered = true;
      else failures.push(`SMS: ${result.error}`);
    }

    if (planned.emailBody && target.email) {
      const result = await this.email.send({
        to: target.email,
        subject: planned.emailSubject || 'Payment reminder',
        html: planned.emailBody,
      });
      if (result.delivered) anyDelivered = true;
      else failures.push(`Email: ${result.error}`);
    }

    // Partial success still counts as sent: the customer was reached, and the
    // failure detail is kept for follow-up.
    const status = anyDelivered ? 'SENT' : 'FAILED';
    await this.prisma.reminderLog.update({
      where: { id: log.id },
      data: {
        status,
        statusReason: failures.length ? failures.join(' | ') : null,
        sentAt: anyDelivered ? new Date() : null,
        attempts: { increment: 1 },
      },
    });

    return { status, reason: failures.join(' | ') || undefined };
  }

  /** True when the hour falls inside a rule's configured quiet window. */
  isQuietHour(rule: ReminderRule, at: Date): boolean {
    if (rule.quietHoursStart === null || rule.quietHoursEnd === null) return false;
    const hour = at.getHours();
    const { quietHoursStart: start, quietHoursEnd: end } = rule;
    // A window that wraps midnight (22 -> 7) needs the inverted comparison.
    return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
  }
}
