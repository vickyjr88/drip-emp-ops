import { IsString, IsNotEmpty, IsUUID, IsInt, Min, IsOptional, IsDecimal, IsEnum, IsBoolean, IsUrl, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UnitStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
  RENTED = 'RENTED',
  BLOCKED = 'BLOCKED',
}

export class CreateUnitDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  blockId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  unitNumber!: string;

  @ApiProperty()
  @IsInt()
  floorNumber!: number;

  @ApiProperty()
  @IsDecimal()
  sizeSqm!: string | number;

  @ApiProperty()
  @IsDecimal()
  priceKes!: string | number;

  @ApiProperty()
  @IsDecimal()
  priceUsd!: string | number;

  @ApiPropertyOptional({ enum: UnitStatus, default: UnitStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  parkingSlots?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasBalcony?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasStore?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  featuredImageUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  galleryImages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  floorPlanUrl?: string;
}
