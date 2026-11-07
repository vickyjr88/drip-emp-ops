import assert from 'node:assert/strict';
import { test } from 'node:test';
import IORedis from 'ioredis';
import { DailyReportQueueService } from '../src/daily-report/daily-report-queue.service';

/**
 * Both backend slots run the schedulers, so the swap during a deploy briefly has two workers on the same queue, and after a
 * deploy the active slot is whichever one is left. That is only safe if two replicas never produce two sends. This starts
 * two "replicas" of the daily report scheduler against a real Redis and checks each scheduled tick is handled once.
 *
 * Needs SCHEDULER_TEST_REDIS_URL, a Redis whose database it may empty, for example redis://127.0.0.1:6379/15.
 */
const url = process.env.SCHEDULER_TEST_REDIS_URL;
const redis = url ? test : test.skip;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

redis('two replicas of the daily report scheduler handle each scheduled tick once', async () => {
  const connection = new IORedis(url!, { maxRetriesPerRequest: null, enableReadyCheck: false });
  await connection.flushdb();

  process.env.REDIS_URL = url!;
  delete process.env.DAILY_REPORT_ENABLED;
  process.env.DAILY_REPORT_CRON = '*/2 * * * * *'; // every two seconds, so the test does not wait for 07:00
  process.env.DAILY_REPORT_CATCHUP_AFTER_HOUR = '99'; // no catch-up job: only the scheduled ticks are under test

  const handled: number[] = [];
  const replica = () => new DailyReportQueueService({
    deliver: async () => { handled.push(Math.floor(Date.now() / 2000)); return {}; },
    hasRunFor: async () => true,
  } as any);
  const a = replica();
  const b = replica();
  try {
    await a.onModuleInit();
    await b.onModuleInit();
    await sleep(7_000);
  } finally {
    await a.onModuleDestroy();
    await b.onModuleDestroy();
    await connection.flushdb();
    connection.disconnect();
  }

  assert.ok(handled.length >= 2, `expected the scheduled ticks to run, got ${handled.length}`);
  // Two replicas each handling the same tick would put two calls in one two-second slot.
  assert.equal(new Set(handled).size, handled.length, `a tick was handled more than once: ${JSON.stringify(handled)}`);
});
