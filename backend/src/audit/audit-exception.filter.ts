import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AuditService } from './audit.service';
import { actionFromMethod, describeRoute, redactSensitive } from './audit.redact';

const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Records mutations rejected before the interceptor ever runs.
 *
 * Nest executes guards ahead of interceptors, so a request refused by
 * JwtAuthGuard or PermissionsGuard never reaches AuditInterceptor. Those are
 * exactly the events worth keeping -- an unauthenticated write attempt, or a
 * user reaching for something they lack permission on -- so this filter catches
 * them and writes the entry itself.
 *
 * Requests that do reach the handler are audited by the interceptor; this
 * filter only covers 401 and 403, so nothing is recorded twice.
 */
@Catch()
export class AuditExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AuditExceptionFilter.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly audit: AuditService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest();
    const response = context.getResponse();

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: 500, message: 'Internal server error' };

    const method: string = request?.method || '';
    if ((status === 401 || status === 403) && AUDITED_METHODS.has(method.toUpperCase())) {
      const path: string = request.originalUrl || request.url || '';
      const { resource, resourceId } = describeRoute(path);
      try {
        await this.audit.record({
          request,
          method,
          path,
          resource,
          resourceId,
          body: redactSensitive(request.body),
          statusCode: status,
          outcome: 'FAILURE',
          errorMessage: this.errorText(body, status),
          ipAddress: this.clientIp(request),
          userAgent: request.headers?.['user-agent'],
        });
      } catch (error) {
        // Never let an audit write mask the original rejection.
        this.logger.error(`Failed to audit rejected request: ${(error as Error).message}`);
      }
    }

    httpAdapter.reply(response, body, status);
  }

  private clientIp(request: any): string | undefined {
    const forwarded = request.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
    return request.ip || request.socket?.remoteAddress || undefined;
  }

  private errorText(body: any, status: number): string {
    const message = typeof body === 'object' ? body?.message : body;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    return status === 401 ? 'Unauthorized' : 'Forbidden';
  }
}
