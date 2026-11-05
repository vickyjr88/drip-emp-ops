import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A small in-memory limiter for the public design endpoints (artwork upload, saving a design). This API has no global
 * throttler, and these routes accept files and write rows for anyone, so they are limited per client address.
 * In memory is enough here: each backend slot enforces its own limit, which still caps abuse.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  check(key: string, now = Date.now()) {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      throw new HttpException('Too many requests. Please wait a moment and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Keep the map from growing without bound.
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (v.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
    }
  }
}
