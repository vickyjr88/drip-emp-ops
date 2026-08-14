import { Injectable } from '@nestjs/common';
import { ReminderTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderTarget } from './reminder.types';

/** Midnight UTC, so a due date compares and dedupes consistently. */
export function startOfDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/**
 * Clamps a day-of-month to a real date in the given month. A tenancy billed on
 * the 31st still has a due date in February; without this it would silently roll
 * into March and the reminder would fire on the wrong day.
 */
function dueDateForMonth(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(Math.max(day, 1), lastDay)));
}

function decimal(value: unknown): number {
  return Number(value ?? 0);
}

/**
 * Turns domain records into the flat list of things that could be reminded
 * about, within a window either side of today.
 *
 * The window matters: rules fire at fixed offsets, so the engine only needs
 * charges whose due date is within the largest configured offset of today,
 * rather than every installment ever written.
 */
@Injectable()
export class ReminderTargetService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(params: {
    targetTypes: ReminderTargetType[];
    /** Earliest due date of interest. */
    from: Date;
    /** Latest due date of interest. */
    to: Date;
    storeId?: string | null;
    /** Restrict to one invoice, for manual sends. */
    targetId?: string | null;
  }): Promise<ReminderTarget[]> {
    const targets: ReminderTarget[] = [];
    const wanted = new Set(params.targetTypes);

    if (wanted.has('INVOICE')) {
      targets.push(...(await this.invoices(params)));
    }

    return targets;
  }




  private async invoices(params: {
    from: Date;
    to: Date;
    storeId?: string | null;
    targetId?: string | null;
  }): Promise<ReminderTarget[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        dueDate: { gte: startOfDay(params.from), lte: startOfDay(params.to) },
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        ...(params.targetId ? { id: params.targetId } : {}),
        ...(params.storeId ? { storeId: params.storeId } : {}),
      },
      include: { customer: true, allocations: true },
    });

    return invoices.map((invoice) => {
      const amountDue = decimal(invoice.amount);
      const amountPaid = invoice.allocations.reduce(
        (sum, allocation) => sum + decimal(allocation.allocatedAmount),
        0,
      );
      return {
        targetType: 'INVOICE' as ReminderTargetType,
        targetId: invoice.id,
        dueDate: startOfDay(invoice.dueDate),
        amountDue,
        amountPaid,
        currency: invoice.currency,
        isPaid: amountPaid >= amountDue - 0.01,
        customerId: invoice.customerId,
        customerName: `${invoice.customer.firstName} ${invoice.customer.lastName}`,
        email: invoice.customer.email,
        phone: invoice.customer.phone,
        unitNumber: null,
        storeId: invoice.storeId,
        projectName: null,
        description: `Invoice ${invoice.invoiceNumber}`,
        reference: invoice.invoiceNumber,
      };
    });
  }

  /** Every occurrence of `dayOfMonth` between two dates, inclusive. */
  private monthlyDueDates(from: Date, to: Date, dayOfMonth: number): Date[] {
    const dates: Date[] = [];
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    const limit = startOfDay(to);

    // One month either side so a charge just outside the window is not missed
    // when the day-of-month clamps.
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);

    while (cursor <= limit) {
      const due = dueDateForMonth(cursor.getUTCFullYear(), cursor.getUTCMonth(), dayOfMonth);
      if (due >= startOfDay(from) && due <= limit) {
        dates.push(due);
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return dates;
  }


}
