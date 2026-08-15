import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerAuthGuard } from './customer-auth.guard';
import {
  CustomerChangePasswordDto,
  CustomerForgotPasswordDto,
  CustomerLoginDto,
  CustomerResetPasswordDto,
  CustomerSelfSignupDto,
  RequestRentChangeDto,
} from './dto/customer-portal.dto';
import { Public } from '../auth/decorators/public.decorator';

/**
 * The customer portal.
 *
 * @Public only disengages the *staff* guards; CustomerAuthGuard still
 * authenticates every route except login. The customer id always comes from
 * request.user, so no endpoint here accepts a customer id from the client.
 */
@ApiTags('customer-portal')
@Controller('customer-portal')
export class CustomerPortalController {
  constructor(private readonly service: CustomerPortalService) {}

  @Public()
  @Post('login')
  login(@Body() dto: CustomerLoginDto) {
    return this.service.login(dto.email, dto.password);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  me(@Req() request: any) {
    return request.user;
  }


  @Public()
  @Post('signup')
  signup(@Body() dto: CustomerSelfSignupDto) {
    return this.service.signup(dto);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: CustomerForgotPasswordDto, @Req() request: any) {
    // The reset link has to point back at the site the request came from, so
    // it works in development and production without a hardcoded host.
    const origin =
      request.headers?.origin ||
      process.env.STOREFRONT_ORIGIN ||
      'http://localhost:3002';
    return this.service.forgotPassword(dto.email, origin);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: CustomerResetPasswordDto) {
    return this.service.resetPassword(dto.token, dto.password);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Get('orders')
  myOrders(@Req() request: any) {
    return this.service.myOrders(request.user.id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('change-password')
  changePassword(@Req() request: any, @Body() dto: CustomerChangePasswordDto) {
    return this.service.changePassword(request.user.id, dto.currentPassword, dto.newPassword);
  }


}
