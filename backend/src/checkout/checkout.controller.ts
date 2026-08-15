import {
  Body, Controller, Get, Headers, Param, Post, Query, RawBodyRequest, Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CheckoutService } from './checkout.service';
import { PaystackService } from '../paystack/paystack.service';
import { CheckoutDto, CustomerSignupDto } from './dto/checkout.dto';
import { storefrontOrigin } from '../common/storefront-origin';

/**
 * Checkout, all public: a shopper has no portal token.
 *
 * Nothing here trusts the client for anything that matters. Prices come from
 * the database, and an order is only marked paid on Paystack's own word.
 */
@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly service: CheckoutService,
    private readonly paystack: PaystackService,
  ) {}

  @Public()
  @Get('config')
  config() {
    // Lets the storefront hide the pay-online path when no keys are set,
    // rather than offering a button that fails.
    return { online: this.paystack.configured };
  }

  @Public()
  @Post('signup')
  signup(@Body() dto: CustomerSignupDto) {
    return this.service.signup(dto);
  }

  @Public()
  @Post()
  start(@Body() dto: CheckoutDto, @Req() request: Request) {
    // Must be the storefront, not this API. Falling back to the request's own
    // host sent Paystack's callback to :3101/checkout/complete, which 404s --
    // that page lives on the web app.
    return this.service.start(dto, storefrontOrigin(request.headers.origin as string));
  }

  /** Called when the browser returns from Paystack. */
  @Public()
  @Get('verify')
  verify(@Query('reference') reference: string) {
    return this.service.settle(reference);
  }

  @Public()
  @Get('orders/:reference')
  lookup(@Param('reference') reference: string) {
    return this.service.lookup(reference);
  }

  /**
   * Paystack's webhook.
   *
   * The authority on whether an order is paid: a customer who closes the tab
   * before the redirect still has their order settled by this. Anything with a
   * bad or missing signature is ignored outright -- an unverified callback is
   * an attacker telling us we have been paid.
   */
  @Public()
  @Post('webhook')
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    const raw = request.rawBody;
    if (!raw || !this.paystack.verifySignature(raw, signature)) {
      // 200 regardless: a signature failure is not something Paystack should
      // retry, and a distinct error would confirm the endpoint is live.
      return { received: true };
    }

    const event = JSON.parse(raw.toString('utf8'));
    if (event?.event === 'charge.success' && event?.data?.reference) {
      try {
        await this.service.settle(event.data.reference);
      } catch {
        // Swallowed so Paystack sees a 200 and stops retrying; the payment is
        // recoverable from the dashboard either way.
      }
    }
    return { received: true };
  }
}
