import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { OrderStatus, PriceTier } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

export class OrderQueryDto extends PagedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    description: 'Orders with at least one SUPPLIER_ORDER line not yet HANDED_TO_CUSTOMER -- the operations worklist.',
  })
  @IsOptional()
  @Transform(toBoolean)
  awaitingSupplier?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'How the order came in: IN_STORE, WHATSAPP, PHONE, INSTAGRAM, TIKTOK, WEBSITE, ' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ enum: PriceTier, description: 'The price list the order was rung up at: RETAIL, RESELLER or WHOLESALE.' })
  @IsOptional()
  @IsEnum(PriceTier)
  priceTier?: PriceTier;

  @ApiPropertyOptional({ description: 'Only reseller and wholesale orders (everything not at the retail price list).' })
  @IsOptional()
  @Transform(toBoolean)
  tradeOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;
}
