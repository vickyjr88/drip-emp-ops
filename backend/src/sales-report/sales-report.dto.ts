import { ApiPropertyOptional } from '@nestjs/swagger';
import { PriceTier } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PagedQueryDto } from '../common/dto/paged-query.dto';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The period and the filters, shared by the figures and the order list so the two always describe the same orders. */
export class SalesReportQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ description: 'First day (Nairobi), YYYY-MM-DD. Defaults to today.' })
  @IsOptional() @Matches(DAY, { message: 'from must be a day, as YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'Last day (Nairobi), inclusive. Defaults to from.' })
  @IsOptional() @Matches(DAY, { message: 'to must be a day, as YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ enum: ['day', 'week', 'month', 'range'], description: 'What kind of period this is: decides what it is compared with.' })
  @IsOptional() @IsIn(['day', 'week', 'month', 'range'])
  period?: 'day' | 'week' | 'month' | 'range';

  @ApiPropertyOptional({ enum: ['hour', 'day', 'week', 'month'] })
  @IsOptional() @IsIn(['hour', 'day', 'week', 'month'])
  groupBy?: 'hour' | 'day' | 'week' | 'month';

  @IsOptional() @IsString() @MaxLength(80) storeId?: string;
  @IsOptional() @IsString() @MaxLength(40) channel?: string;
  @IsOptional() @IsEnum(PriceTier) priceTier?: PriceTier;
  @ApiPropertyOptional({ description: 'Who keyed the order in (an email, or "storefront").' })
  @IsOptional() @IsString() @MaxLength(160) staff?: string;

  @ApiPropertyOptional({ description: 'Order list only: all, sales, unpaid, cancelled (cancelled and refunded), or one status.' })
  @IsOptional() @IsIn(['all', 'sales', 'unpaid', 'cancelled', 'PENDING', 'PAID', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'])
  show?: string;

  @IsOptional() @IsIn(['newest', 'oldest', 'largest', 'smallest']) sort?: string;
}
