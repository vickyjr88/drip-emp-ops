import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DepreciationMethod {
  STRAIGHT_LINE = 'STRAIGHT_LINE',
}

export class CreateFixedAssetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assetCode!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  blockId?: string;

  @ApiProperty()
  @IsDateString()
  acquisitionDate!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  acquisitionCost!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  usefulLifeMonths!: number;

  @ApiPropertyOptional({ enum: DepreciationMethod, default: DepreciationMethod.STRAIGHT_LINE })
  @IsOptional()
  @IsEnum(DepreciationMethod)
  depreciationMethod?: DepreciationMethod;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  residualValue?: number;
}
