import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Authenticates a customer portal token.
 *
 * Routes using this are marked @Public so the global staff JwtAuthGuard and
 * PermissionsGuard step aside; this guard then supplies the real authentication.
 * "Public" here means "not staff-authenticated", never "unauthenticated".
 */
@Injectable()
export class CustomerAuthGuard extends AuthGuard('customer-jwt') {}
