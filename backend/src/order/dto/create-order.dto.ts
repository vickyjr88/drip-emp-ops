import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, Min, ValidateNested,
} from 'class-validator';
import { OrderLineFulfillmentStatus, OrderLineFulfillmentType, OrderStatus, PriceTier } from '@prisma/client';

export class CreateOrderLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ description: "Defaults to the variant's current price." })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'Amount off this line, not a percentage.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({
    enum: OrderLineFulfillmentType,
    default: 'STOCK',
    description: 'STOCK reserves from the shop floor. SUPPLIER_ORDER is charged the same but sourced from the supplier afterwards, so it does not touch stock.',
  })
  @IsOptional()
  @IsEnum(OrderLineFulfillmentType)
  fulfillmentType?: OrderLineFulfillmentType;
}

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storeId!: string;

  @ApiPropertyOptional({ description: 'Existing customer. Omit for a walk-in.' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    enum: PriceTier,
    description: 'Which price list to use. A walk-in is RETAIL; a shop buying outright is RESELLER or WHOLESALE.',
  })
  @IsOptional()
  @IsEnum(PriceTier)
  priceTier?: PriceTier;

  @ApiPropertyOptional({ example: 'IN_STORE', description: 'IN_STORE, WHATSAPP, INSTAGRAM, WEBSITE.' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ description: 'For a walk-in with no customer record.' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @ApiPropertyOptional({ description: 'Order-level discount, applied after line totals.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  shipping?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateOrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  lines!: CreateOrderLineDto[];
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrderLineFulfillmentDto {
  @ApiProperty({ enum: OrderLineFulfillmentStatus })
  @IsEnum(OrderLineFulfillmentStatus)
  status!: OrderLineFulfillmentStatus;

  @ApiPropertyOptional({
    description: 'The supplier invoice this line was actually bought in against, once ORDERED_FROM_SUPPLIER or later. Drives cost-of-goods for this line instead of the variant\'s default cost.',
  })
  @IsOptional()
  @IsString()
  supplierInvoiceId?: string;
}

export class RecordOrderPaymentDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty({ example: 'MPESA', description: 'MPESA, CASH, CARD, BANK_TRANSFER.' })
  @IsString()
  @IsNotEmpty()
  method!: string;

  @ApiPropertyOptional({ description: 'M-Pesa code, slip number, or similar.' })
  @IsOptional()
  @IsString()
  reference?: string;
}
