import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';
import { CreateProductDto, CreateVariantDto } from './create-product.dto';

/** Variants are managed through their own endpoints, not by resending the product. */
export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['variants'] as const)) {}

/**
 * Variant updates.
 *
 * The three optional money fields are re-declared to accept null, which clears
 * them. PartialType alone makes them optional but still rejects null, so there
 * was no way to un-set a cost once it had been entered.
 */
export class UpdateVariantDto extends PartialType(
  OmitType(CreateVariantDto, ['resellerPriceKes', 'wholesalePriceKes', 'costKes'] as const),
) {
  @ApiPropertyOptional({ nullable: true, description: 'Null clears the reseller price.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  resellerPriceKes?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Null clears the wholesale price.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  wholesalePriceKes?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Null clears the cost.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  costKes?: number | null;
}
