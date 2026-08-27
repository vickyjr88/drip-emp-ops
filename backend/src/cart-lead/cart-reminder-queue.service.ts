import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { CartReminderEmailService } from './cart-reminder-email';

export const CART_REMINDER_QUEUE = 'cart-reminders';

type CartReminderJob = { cartLeadId: string };

/**
 * BullMQ wiring for the "come back and buy" abandoned-cart reminder.
 *
 * Deliberately its own queue rather than a rule in the reminders module: that
 * engine's ReminderRule/ReminderTargetType system models recurring
 * due-date-and-amount-owed charges (rent, installments, invoices), which does
 * not fit a one-shot "email this cart 24h after it was abandoned" job. Wired
 * by hand rather than through @nestjs/bullmq decorators, mirroring
 * reminder-queue.service.ts, so the worker can be disabled per replica via
 * CART_REMINDERS_ENABLED without touching the queue itself.
 *
 * Unlike that module's daily scan, there is no inline fallback when Redis is
 * unavailable: a scan can run "now" instead of on a cron tick and still be
 * correct, but a delayed job has no correct immediate substitute -- sending
 * right away would defeat the point of a 24h wait. Missing Redis means the
 * reminder silently does not get scheduled, logged so it is diagnosable.
 */
@Injectable()
export class CartReminderQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CartReminderQueueService.name);

  private connection?: IORedis;
  private queue?: Queue<CartReminderJob>;
  private worker?: Worker<CartReminderJob>;

  private readonly redisUrl = process.env.REDIS_URL || '';
  private readonly enabled = (process.env.CART_REMINDERS_ENABLED || 'true') !== 'false';
  private readonly delayMs = Number(process.env.CART_REMINDER_DELAY_HOURS || 24) * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminderEmail: CartReminderEmailService,
  ) {}

  get isAvailable() {
    return Boolean(this.queue);
  }

  async onModuleInit() {
    if (!this.redisUrl) {
      this.logger.warn(
        'REDIS_URL not set — abandoned-cart reminders need a delayed queue and will not be sent.',
      );
      return;
    }

    try {
      this.connection = new IORedis(this.redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
      this.connection.on('error', (error) => this.logger.error(`Redis error: ${error.message}`));

      this.queue = new Queue<CartReminderJob>(CART_REMINDER_QUEUE, { connection: this.connection });

      if (this.enabled) {
        this.startWorker();
      } else {
        this.logger.log('CART_REMINDERS_ENABLED=false — queue available, worker off on this replica.');
      }
    } catch (error) {
      this.logger.error(
        `Cart reminder queue unavailable: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  private startWorker() {
    if (!this.connection) return;

    this.worker = new Worker<CartReminderJob>(
      CART_REMINDER_QUEUE,
      async (job: Job<CartReminderJob>) => this.runSend(job.data),
      {
        connection: this.connection,
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Cart reminder job ${job?.id} failed: ${error.message}`);
    });
  }

  /**
   * Re-reads the lead fresh rather than trusting the enqueue-time payload, so
   * a cart that converted, was dismissed, expired, or already got its
   * reminder while sitting in the 24h delay does not get emailed anyway.
   */
  private async runSend({ cartLeadId }: CartReminderJob) {
    const lead = await this.prisma.cartLead.findUnique({ where: { id: cartLeadId } });
    if (!lead) return { status: 'SKIPPED', reason: 'Lead no longer exists' };
    if (lead.status !== 'NEW') return { status: 'SKIPPED', reason: `status is ${lead.status}` };
    if (lead.reminderSentAt) return { status: 'SKIPPED', reason: 'Already sent' };
    if (!lead.customerEmail) return { status: 'SKIPPED', reason: 'No email on file' };

    const result = await this.reminderEmail.send(lead);
    if (result.delivered) {
      await this.prisma.cartLead.update({ where: { id: lead.id }, data: { reminderSentAt: new Date() } });
    } else {
      this.logger.warn(`Cart reminder for lead ${lead.id} not delivered: ${result.error}`);
    }

    return { status: result.delivered ? 'SENT' : 'FAILED', error: result.error };
  }

  async scheduleReminder(cartLeadId: string) {
    if (!this.queue) {
      this.logger.warn(
        `Cart reminder for lead ${cartLeadId} not scheduled — queue unavailable (delayed jobs need Redis; there is no inline equivalent).`,
      );
      return;
    }

    await this.queue.add(
      'send-cart-reminder',
      { cartLeadId },
      {
        delay: this.delayMs,
        attempts: 3,
        // Providers fail transiently; spacing retries avoids compounding it.
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );
  }
}
