import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProductDto, CreateVariantDto } from './create-product.dto';

/** Variants are managed through their own endpoints, not by resending the product. */
export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['variants'] as const)) {}

export class UpdateVariantDto extends PartialType(CreateVariantDto) {}
