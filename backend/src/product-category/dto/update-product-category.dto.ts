import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateIf } from 'class-validator';
import { CreateProductCategoryDto } from './create-product-category.dto';

/**
 * parentId is omitted from the inherited shape and redeclared as nullable.
 *
 * PartialType alone inherits @IsString() from the create DTO, which rejects
 * null -- leaving no way to un-nest a category once it had a parent, since
 * omitting the field means "leave unchanged" rather than "clear".
 */
export class UpdateProductCategoryDto extends PartialType(
  OmitType(CreateProductCategoryDto, ['parentId'] as const),
) {
  /** Null moves the category back to the top level. */
  @ApiPropertyOptional({ nullable: true, description: 'Parent category; null moves it to the top level.' })
  @IsOptional()
  // Skips the string check for null only, so a number or an object is still refused.
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  parentId?: string | null;
}
