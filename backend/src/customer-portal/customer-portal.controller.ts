import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerAuthGuard } from './customer-auth.guard';
import {
  CustomerChangePasswordDto,
  CustomerLoginDto,
  RequestRentChangeDto,
} from './dto/customer-portal.dto';
import { Public } from '../auth/decorators/public.decorator';

/**
 * The tenant/owner portal.
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
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth()
  @Post('change-password')
  changePassword(@Req() request: any, @Body() dto: CustomerChangePasswordDto) {
    return this.service.changePassword(request.user.id, dto.currentPassword, dto.newPassword);
  }


}
