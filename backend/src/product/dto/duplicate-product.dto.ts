import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Copying a product that already sells, to save re-entering a size run and
 * three price tiers for a shoe that differs only by colourway.
 *
 * SKU and name are required rather than derived: both have to be unique and
 * meaningful to the shop, and a generated "AF1-WHT-COPY" is something someone
 * would have to go back and fix.
 */
export class DuplicateProductDto {
  @ApiProperty({ description: 'SKU for the copy. Variant SKUs are derived from it.', example: 'AF1-BLK' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 'Air Force 1 Black' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Defaults to the source product\'s brand.' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Defaults to the source product\'s category.' })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
