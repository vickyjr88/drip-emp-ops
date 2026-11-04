import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { DailyReportService } from './daily-report.service';
import { yesterdayKey } from './daily-report.window';

export const DAILY_REPORT_QUEUE = 'daily-report';

type DailyReportJob = { dateKey?: string };

/**
 * Sends the daily report on a schedule. Wired by hand like the reminder queue, for the same reasons: it can be
 * turned off per replica (DAILY_REPORT_ENABLED=false) and the app still boots without Redis.
 *
 * Redis holds one repeatable job, so however many replicas run, the report is queued once a day. The per-recipient
 * claim in DailyReportService is the second guard: a retry or a catch-up can never send a copy twice.
 *
 *   DAILY_REPORT_CRON      when to send (default 0 7 * * *)
 *   DAILY_REPORT_TIMEZONE  the cron's timezone (default Africa/Nairobi)
 */
@Injectable()
export class DailyReportQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyReportQueueService.name);

  private connection?: IORedis;
  private queue?: Queue<DailyReportJob>;
  private worker?: Worker<DailyReportJob>;

  private readonly redisUrl = process.env.REDIS_URL || '';
  private readonly enabled = (process.env.DAILY_REPORT_ENABLED || 'true') !== 'false';
  private readonly cron = process.env.DAILY_REPORT_CRON || '0 7 * * *';
  private readonly timezone = process.env.DAILY_REPORT_TIMEZONE || 'Africa/Nairobi';
  /** If the app was down at the scheduled time, it catches up once it is back after this local hour. */
  private readonly catchUpAfterHour = Number(process.env.DAILY_REPORT_CATCHUP_AFTER_HOUR || 8);

  constructor(private readonly reports: DailyReportService) {}

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('DAILY_REPORT_ENABLED=false: daily report scheduler off.');
      return;
    }
    if (!this.redisUrl) {
      this.logger.warn('REDIS_URL not set: the daily report cannot be scheduled (the manual send still works).');
      return;
    }

    try {
      this.connection = new IORedis(this.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
      this.connection.on('error', (error) => this.logger.error(`Redis error: ${error.message}`));
      this.queue = new Queue<DailyReportJob>(DAILY_REPORT_QUEUE, { connection: this.connection });

      await this.queue.upsertJobScheduler(
        'daily-report',
        { pattern: this.cron, tz: this.timezone },
        {
          name: 'daily-report',
          data: {},
          // A failed send is retried; the claim in the service stops anyone who already got it getting it again.
          opts: { attempts: 4, backoff: { type: 'exponential', delay: 5 * 60_000 }, removeOnComplete: 30, removeOnFail: 60 },
        },
      );
      this.worker = new Worker<DailyReportJob>(DAILY_REPORT_QUEUE, (job) => this.process(job), { connection: this.connection, concurrency: 1 });
      this.worker.on('failed', (job, error) => this.logger.error(`Daily report job ${job?.id} failed: ${error.message}`));
      this.logger.log(`Daily report scheduled: "${this.cron}" (${this.timezone})`);

      await this.catchUp();
    } catch (error) {
      this.logger.error(`Daily report queue unavailable: ${error instanceof Error ? error.message : error}`);
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  private async process(job: Job<DailyReportJob>) {
    const dateKey = job.data.dateKey ?? yesterdayKey(new Date());
    return this.reports.deliver(dateKey);
  }

  /**
   * A restart or outage at the scheduled minute would otherwise lose the day's report. If it is already past the
   * catch-up hour and nothing has been recorded for yesterday, queue it once; the job id makes a second replica's
   * attempt a no-op.
   */
  private async catchUp() {
    if (!this.queue) return;
    const now = new Date();
    const localHour = Number(new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(11, 13));
    const dateKey = yesterdayKey(now);
    if (localHour < this.catchUpAfterHour) return;
    if (await this.reports.hasRunFor(dateKey)) return;
    await this.queue.add('daily-report-catchup', { dateKey }, { jobId: `catchup-${dateKey}`, delay: 60_000, attempts: 4, backoff: { type: 'exponential', delay: 5 * 60_000 }, removeOnComplete: 30, removeOnFail: 60 });
    this.logger.warn(`No report recorded for ${dateKey}; catch-up queued.`);
  }
}
