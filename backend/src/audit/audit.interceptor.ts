import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import { SKIP_AUDIT_KEY } from './skip-audit.decorator';
import { actionFromMethod, describeRoute, redactSensitive } from './audit.redact';

const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Records every mutating request system-wide.
 *
 * Registered as an APP_INTERCEPTOR so coverage is automatic: a new controller
 * is audited the moment it exists, with nothing to remember. Reads are skipped
 * -- they vastly outnumber writes and the question this answers is "who changed
 * what".
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest();
    const method: string = request?.method || '';

    if (!AUDITED_METHODS.has(method.toUpperCase())) return next.handle();

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const startedAt = Date.now();
    // Captured before the handler runs: an interceptor sees the request again
    // on the way out, and the body can be mutated in between.
    const path: string = request.originalUrl || request.url || '';
    const { resource, resourceId } = describeRoute(path);
    const body = redactSensitive(request.body);
    const ipAddress = this.clientIp(request);
    const userAgent = request.headers?.['user-agent'];

    return next.handle().pipe(
      tap({
        next: (result) => {
          void this.write({
            request,
            method,
            path,
            resource,
            // A create has no id in the URL; take it from the response instead.
            resourceId: resourceId ?? this.idFromResult(result),
            body,
            ipAddress,
            userAgent,
            startedAt,
            statusCode: context.switchToHttp().getResponse()?.statusCode ?? 200,
            outcome: 'SUCCESS' as const,
          });
        },
        error: (error) => {
          // Failed attempts matter most: a denied delete is exactly what an
          // audit trail is for.
          void this.write({
            request,
            method,
            path,
            resource,
            resourceId,
            body,
            ipAddress,
            userAgent,
            startedAt,
            statusCode: error?.status ?? error?.statusCode ?? 500,
            outcome: 'FAILURE' as const,
            errorMessage: this.errorText(error),
          });
        },
      }),
    );
  }

  private clientIp(request: any): string | undefined {
    const forwarded = request.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
    return request.ip || request.socket?.remoteAddress || undefined;
  }

  private idFromResult(result: unknown): string | undefined {
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const id = (result as Record<string, unknown>).id;
      if (typeof id === 'string') return id;
    }
    return undefined;
  }

  private errorText(error: any): string {
    const response = error?.response;
    const message = response?.message ?? error?.message;
    if (Array.isArray(message)) return message.join(', ');
    return typeof message === 'string' ? message : 'Request failed';
  }

  private async write(entry: Parameters<AuditService['record']>[0] & { startedAt: number }) {
    try {
      await this.audit.record({ ...entry, durationMs: Date.now() - entry.startedAt });
    } catch (error) {
      // Auditing must never break the request it is auditing.
      this.logger.error(`Failed to write audit entry: ${(error as Error).message}`);
    }
  }
}
