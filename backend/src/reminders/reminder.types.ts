import { ReminderChannel, ReminderTargetType } from '@prisma/client';

/**
 * A single thing a reminder could be about: one installment, one month's rent,
 * one utility charge, one invoice. Resolved from the domain models, then matched
 * against rules.
 */
export type ReminderTarget = {
  targetType: ReminderTargetType;
  targetId: string;
  /** Normalised to midnight so it can serve as part of the dedupe key. */
  dueDate: Date;
  amountDue: number;
  amountPaid: number;
  currency: string;
  isPaid: boolean;

  customerId: string | null;
  customerName: string;
  email: string | null;
  phone: string | null;

  unitNumber: string | null;
  storeId: string | null;
  projectName: string | null;
  /** Human label: "Installment 3 of 12", "Rent — March 2026", "Water". */
  description: string;
  /** Contract number, receipt number or invoice number, when there is one. */
  reference: string | null;
};

export type ResolvedMessage = {
  channel: ReminderChannel;
  smsBody?: string;
  emailSubject?: string;
  emailBody?: string;
};
