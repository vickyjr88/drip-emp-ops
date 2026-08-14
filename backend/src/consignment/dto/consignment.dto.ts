import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, Min, ValidateNested,
} from 'class-validator';
import { PriceTier } from '@prisma/client';

export class ConsignmentLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description: "Agreed price per pair. Defaults to the reseller's tier price.",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class CreateConsignmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  resellerId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storeId!: string;

  @ApiPropertyOptional({ enum: PriceTier, description: "Defaults to the reseller's tier." })
  @IsOptional()
  @IsEnum(PriceTier)
  priceTier?: PriceTier;

  @ApiPropertyOptional({ description: 'Defaults to three days from pickup.' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ConsignmentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsignmentLineDto)
  lines!: ConsignmentLineDto[];
}

export class SettleLineDto {
  @ApiProperty({ description: 'The consignment line being reported on.' })
  @IsString()
  @IsNotEmpty()
  lineId!: string;

  @ApiPropertyOptional({ description: 'How many of these sold.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sold?: number;

  @ApiPropertyOptional({ description: 'How many came back unsold.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  returned?: number;
}

export class SettleConsignmentDto {
  @ApiProperty({ type: [SettleLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SettleLineDto)
  lines!: SettleLineDto[];

  @ApiPropertyOptional({ description: 'Payment taken at the same time.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPaid?: number;

  @ApiPropertyOptional({ example: 'MPESA' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;
}
