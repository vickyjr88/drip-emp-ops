import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateProductCategoryDto {
  @ApiProperty({ example: 'Sneakers' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Generated from the name when omitted.' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Parent category, for "Footwear > Sneakers".' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'False hides this category (and its products) from the storefront -- for loading stock ahead of a launch.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
