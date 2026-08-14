import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

export class CreateVariantDto {
  @ApiProperty({ description: 'Unique across all variants, e.g. AM90-42-BLK.' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 'UK 8 / Black' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Whatever distinguishes this variant, e.g. { "size": "UK 8", "colour": "Black" }.',
  })
  @IsOptional()
  attributes?: Record<string, unknown>;

  @ApiProperty({ example: 3499 })
  @IsNumber()
  @Min(0)
  priceKes!: number;

  @ApiPropertyOptional({ description: 'Buying price, for margin. Never shown to customers.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costKes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 'Air Max 90 Vintage Green' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'URL segment. Generated from the name when omitted.' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Nike' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * Created with the product rather than in a second call: a product with no
   * variant cannot be sold, so allowing one to be saved alone only invites
   * half-finished catalogue entries.
   */
  @ApiPropertyOptional({ type: [CreateVariantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}
