import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { ReminderEngineService } from './reminder-engine.service';

export const REMINDER_QUEUE = 'reminders';

type ScanJob = {
  kind: 'scan';
  runDate?: string;
  ruleIds?: string[];
  storeId?: string | null;
  targetId?: string | null;
  ignoreTiming?: boolean;
  isManual?: boolean;
  triggeredBy?: string;
};

type SendJob = {
  kind: 'send';
  ruleId: string;
  targetType: string;
  targetId: string;
  dueDate: string;
  isManual?: boolean;
  triggeredBy?: string;
};

export type ReminderJob = ScanJob | SendJob;

/**
 * BullMQ wiring for the reminder engine.
 *
 * Two job kinds. A `scan` works out what is due and fans out one `send` per
 * reminder; each `send` delivers a single message. Splitting them means one
 * customer's bad phone number retries in isolation rather than re-running the
 * whole scan, and the queue gives durability across restarts -- work already
 * enqueued survives a deploy.
 *
 * Wired by hand rather than through @nestjs/bullmq decorators so the worker can
 * be skipped entirely when REMINDERS_ENABLED is false, which is how a replica
 * avoids double-sending.
 */
@Injectable()
export class ReminderQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderQueueService.name);

  private connection?: IORedis;
  private queue?: Queue<ReminderJob>;
  private worker?: Worker<ReminderJob>;

  private readonly redisUrl = process.env.REDIS_URL || '';
  private readonly enabled = (process.env.REMINDERS_ENABLED || 'true') !== 'false';
  private readonly cron = process.env.REMINDERS_CRON || '0 8 * * *';
  private readonly timezone = process.env.REMINDERS_TIMEZONE || 'Africa/Nairobi';

  constructor(private readonly engine: ReminderEngineService) {}

  get isAvailable() {
    return Boolean(this.queue);
  }

  async onModuleInit() {
    if (!this.redisUrl) {
      // The rest of the API must still boot; reminders simply cannot be queued.
      this.logger.warn('REDIS_URL not set — reminder queue disabled, manual sends run inline.');
      return;
    }

    try {
      this.connection = new IORedis(this.redisUrl, {
        // Required by BullMQ: it manages its own retry semantics.
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
      this.connection.on('error', (error) => this.logger.error(`Redis error: ${error.message}`));

      this.queue = new Queue<ReminderJob>(REMINDER_QUEUE, { connection: this.connection });

      if (this.enabled) {
        await this.registerScheduler();
        this.startWorker();
      } else {
        this.logger.log('REMINDERS_ENABLED=false — queue available, scheduler and worker off.');
      }
    } catch (error) {
      this.logger.error(
        `Reminder queue unavailable: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  /**
   * Registers the daily scan as a BullMQ job scheduler. `upsert` is keyed by
   * scheduler id, so re-registering on every boot updates the pattern in place
   * rather than leaving a stale schedule behind alongside the new one.
   */
  private async registerScheduler() {
    if (!this.queue) return;

    await this.queue.upsertJobScheduler(
      'daily-reminder-scan',
      { pattern: this.cron, tz: this.timezone },
      {
        name: 'daily-scan',
        data: { kind: 'scan' } as ReminderJob,
        opts: { removeOnComplete: 50, removeOnFail: 100 },
      },
    );
    this.logger.log(`Reminder scan scheduled: "${this.cron}" (${this.timezone})`);
  }

  private startWorker() {
    if (!this.connection) return;

    this.worker = new Worker<ReminderJob>(
      REMINDER_QUEUE,
      async (job: Job<ReminderJob>) => this.process(job),
      {
        connection: this.connection,
        // Modest: each job makes outbound HTTP calls to SMS and email providers
        // and there is no benefit to hammering them.
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Reminder job ${job?.id} failed: ${error.message}`);
    });
  }

  private async process(job: Job<ReminderJob>) {
    if (job.data.kind === 'scan') {
      return this.runScan(job.data);
    }
    return this.runSend(job.data);
  }

  private async runScan(data: ScanJob) {
    const planned = await this.engine.plan({
      runDate: data.runDate ? new Date(data.runDate) : undefined,
      ruleIds: data.ruleIds,
      storeId: data.storeId,
      targetId: data.targetId,
      ignoreTiming: data.ignoreTiming,
    });

    this.logger.log(`Reminder scan planned ${planned.length} message(s)`);

    for (const item of planned) {
      await this.enqueueSend({
        kind: 'send',
        ruleId: item.rule.id,
        targetType: item.target.targetType,
        targetId: item.target.targetId,
        dueDate: item.target.dueDate.toISOString(),
        isManual: data.isManual,
        triggeredBy: data.triggeredBy,
      });
    }

    return { planned: planned.length };
  }

  /**
   * Re-plans for the single target rather than trusting the payload, so a job
   * sitting in the queue through a retry backoff cannot deliver a message about
   * a charge that has since been paid.
   */
  private async runSend(data: SendJob) {
    const planned = await this.engine.plan({
      runDate: new Date(data.dueDate),
      ruleIds: [data.ruleId],
      targetId: data.targetId.includes(':') ? data.targetId.split(':')[0] : data.targetId,
      ignoreTiming: true,
    });

    const match = planned.find(
      (item) => item.target.targetId === data.targetId && item.rule.id === data.ruleId,
    );
    if (!match) {
      return { status: 'SKIPPED', reason: 'No longer due — likely paid since scheduling' };
    }

    return this.engine.dispatch(match, {
      isManual: data.isManual,
      triggeredBy: data.triggeredBy,
    });
  }

  async enqueueScan(data: Omit<ScanJob, 'kind'> = {}) {
    if (!this.queue) {
      // No Redis: run inline so a manual trigger still works in dev.
      return this.runScan({ kind: 'scan', ...data });
    }
    const job = await this.queue.add(
      'manual-scan',
      { kind: 'scan', ...data },
      { removeOnComplete: 50, removeOnFail: 100 },
    );
    return { jobId: job.id, queued: true };
  }

  private async enqueueSend(data: SendJob) {
    if (!this.queue) {
      return this.runSend(data);
    }
    return this.queue.add('send-reminder', data, {
      attempts: 3,
      // Providers fail transiently; spacing retries avoids compounding it.
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    });
  }

  async stats() {
    if (!this.queue) {
      return { available: false as const };
    }
    const counts = await this.queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    return { available: true as const, enabled: this.enabled, cron: this.cron, counts };
  }
}
