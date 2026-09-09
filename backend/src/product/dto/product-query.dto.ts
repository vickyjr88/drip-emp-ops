import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

export const PRODUCT_SORT_OPTIONS = ['name', 'category', 'newest', 'oldest'] as const;
export type ProductSort = (typeof PRODUCT_SORT_OPTIONS)[number];

export class ProductQueryDto extends PagedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  isFeatured?: boolean;

  @ApiPropertyOptional({ enum: PRODUCT_SORT_OPTIONS, default: 'name' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_OPTIONS)
  sortBy?: ProductSort;

  @ApiPropertyOptional({ description: 'Only products added on or after this date (inclusive)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Only products added on or before this date (inclusive)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
