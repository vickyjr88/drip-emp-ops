import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Same 'customer-jwt' strategy as CustomerAuthGuard, but never blocks the
 * request. A present-and-valid token attaches request.user; anything else --
 * no token, expired, revoked, garbage -- leaves request.user undefined and
 * the request proceeds as a guest.
 *
 * For routes that serve both anonymous shoppers and logged-in customers at
 * once (checkout, the public shop endpoints) and need to know which is which
 * without rejecting the overwhelmingly common anonymous case.
 */
@Injectable()
export class OptionalCustomerAuthGuard extends AuthGuard('customer-jwt') {
  handleRequest(err: any, user: any) {
    return user ?? undefined;
  }
}
