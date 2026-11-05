import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateWatchDto {
  @ApiProperty({ example: 'Bagolee Chronograph Black' }) @IsString() @IsNotEmpty() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() imageUrls?: string[];
  @ApiProperty({ example: 4500 }) @IsNumber() @Min(0) priceKes!: number;
  @ApiPropertyOptional({ description: 'What it cost, for margin. Never shown to customers.' }) @IsOptional() @IsNumber() @Min(0) costKes?: number;
  @ApiPropertyOptional({ type: [String], description: 'Only when the watch comes in choices (a strap or dial colour). Leave empty for a single watch: there is no size.' })
  @IsOptional() @IsArray() options?: string[];
  @ApiPropertyOptional({ description: 'Sourced from the supplier for each order instead of taken from shelf stock.' }) @IsOptional() @IsBoolean() isDropShip?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() skuPrefix?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateWatchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() imageUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
}
