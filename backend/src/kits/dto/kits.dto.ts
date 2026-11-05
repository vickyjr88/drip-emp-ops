import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

export class KitSizeDto {
  @ApiProperty({ example: 'M' }) @IsString() @IsNotEmpty() size!: string;
  @ApiProperty({ example: 3500 }) @IsNumber() @Min(0) priceKes!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) costKes?: number;
  @ApiPropertyOptional({ description: 'Sourced from the supplier for every order instead of taken from shelf stock.' })
  @IsOptional() @IsBoolean() isDropShip?: boolean;
}

export class CreateKitDto {
  @ApiProperty({ example: 'Arsenal Home Jersey 2025/26 (Fan Version)' }) @IsString() @IsNotEmpty() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() slug?: string;
  @ApiProperty({ enum: ['JERSEY', 'TSHIRT'] }) @IsIn(['JERSEY', 'TSHIRT']) kind!: 'JERSEY' | 'TSHIRT';
  @ApiPropertyOptional({ description: 'Club slug. Leave empty for a plain or graphic T-shirt, or the generic custom jersey.' })
  @IsOptional() @IsString() clubSlug?: string;
  @ApiPropertyOptional({ example: '2025/26' }) @IsOptional() @IsString() season?: string;
  @ApiPropertyOptional({ enum: ['HOME', 'AWAY', 'THIRD', 'RETRO', 'NONE'] })
  @IsOptional() @IsIn(['HOME', 'AWAY', 'THIRD', 'RETRO', 'NONE']) edition?: 'HOME' | 'AWAY' | 'THIRD' | 'RETRO' | 'NONE';
  @ApiProperty({ example: 'jersey-short' }) @IsString() @IsNotEmpty() templateKey!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() imageUrls?: string[];
  @ApiPropertyOptional({ description: 'Colours for a plain T-shirt: { primary, secondary, trim, pattern, sleeves }.' })
  @IsOptional() colors?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowName?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowNumber?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowArtwork?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() photoFront?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photoBack?: string;
  @ApiPropertyOptional({ description: 'Print areas marked on the photos: { frontChest: {x,y,w,h}, ... } in the photo\'s own 0-1 units.' })
  @IsOptional() printAreas?: Record<string, unknown>;
  @ApiPropertyOptional({ description: 'SKU prefix; sizes are appended. Generated from the name when omitted.' })
  @IsOptional() @IsString() skuPrefix?: string;
  @ApiProperty({ type: [KitSizeDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => KitSizeDto)
  sizes!: KitSizeDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateKitDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() imageUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() clubSlug?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() season?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsIn(['HOME', 'AWAY', 'THIRD', 'RETRO', 'NONE']) edition?: 'HOME' | 'AWAY' | 'THIRD' | 'RETRO' | 'NONE';
  @ApiPropertyOptional() @IsOptional() @IsString() templateKey?: string;
  @ApiPropertyOptional() @IsOptional() colors?: Record<string, unknown> | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowName?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowNumber?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowArtwork?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() photoFront?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() photoBack?: string | null;
  @ApiPropertyOptional() @IsOptional() printAreas?: Record<string, unknown> | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
}

export class UpdateClubDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() aliases?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() fontKeys?: string[];
  @ApiPropertyOptional() @IsOptional() home?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() away?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() third?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class SaveDesignDto {
  @ApiProperty({ description: 'The kit product this design is for.' }) @IsString() @IsNotEmpty() productSlug!: string;
  @ApiProperty({ description: 'The design spec; see backend/src/kits/kit-design.ts.' }) spec!: Record<string, unknown>;
}

export class PrintStatusDto {
  @ApiProperty({ enum: ['AWAITING_REVIEW', 'APPROVED', 'PRINTED', 'READY'] })
  @IsIn(['AWAITING_REVIEW', 'APPROVED', 'PRINTED', 'READY']) status!: 'AWAITING_REVIEW' | 'APPROVED' | 'PRINTED' | 'READY';
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
