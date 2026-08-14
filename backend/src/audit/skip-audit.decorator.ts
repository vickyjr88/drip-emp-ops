import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skipAudit';

/**
 * Excludes a route from the audit log.
 *
 * Reserved for high-volume machine traffic that would drown the trail. Do not
 * use it to hide sensitive endpoints -- bodies are redacted by key name, so a
 * password-bearing route is already safe to audit, and the attempt itself is
 * usually the thing worth recording.
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
