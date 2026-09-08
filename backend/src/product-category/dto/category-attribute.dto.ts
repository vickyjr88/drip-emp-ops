import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCategoryAttributeDto {
  @ApiProperty({ example: 'size', description: 'Lowercase, no spaces -- the JSON key stored on ProductVariant.attributes.' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ example: 'Size' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ type: [String], example: ['EUR 36', 'EUR 37', 'EUR 38'] })
  @IsArray()
  @IsString({ each: true })
  options!: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCategoryAttributeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
