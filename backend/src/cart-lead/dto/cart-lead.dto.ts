import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { CartLeadSource } from '@prisma/client';

export class CartLeadLineDto {
  @ApiProperty() @IsString() @IsNotEmpty() variantId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() sku!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() size!: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) quantity!: number;
  @ApiProperty() @IsInt() @Min(0) priceKes!: number;
}

/**
 * Recorded from the storefront cart, either when a shopper takes the WhatsApp
 * route instead of paying online, or by a periodic sync so a cart that is
 * left with contact details filled in can be flagged abandoned later.
 *
 * Always requires a name, phone or email -- a cart with no way to reach the
 * shopper is not a lead, just browsing, and is not worth a row.
 */
export class RecordCartLeadDto {
  @ApiProperty({ enum: CartLeadSource })
  @IsIn(['WHATSAPP_ORDER', 'ABANDONED_CART'])
  source!: CartLeadSource;

  @ApiProperty({ type: [CartLeadLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CartLeadLineDto)
  lines!: CartLeadLineDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() customerEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shippingAddress?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) shipping?: number;

  /** The WhatsApp message actually sent. Omitted for an abandoned-cart sync. */
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
}
