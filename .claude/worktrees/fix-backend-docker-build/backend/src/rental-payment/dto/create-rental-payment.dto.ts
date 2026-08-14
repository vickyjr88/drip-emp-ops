import { IsUUID, IsNotEmpty, IsOptional, IsString, IsDecimal, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RentalPaymentCategoryDto {
  RENT = 'RENT',
  WATER = 'WATER',
  ELECTRICITY = 'ELECTRICITY',
  GARBAGE = 'GARBAGE',
  SECURITY = 'SECURITY',
  INTERNET = 'INTERNET',
  PARKING = 'PARKING',
  SERVICE_CHARGE = 'SERVICE_CHARGE',
  OTHER = 'OTHER',
}

export class CreateRentalPaymentDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  tenancyId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  receiptNumber!: string;

  @ApiProperty({ enum: RentalPaymentCategoryDto })
  @IsEnum(RentalPaymentCategoryDto)
  category!: RentalPaymentCategoryDto;

  @ApiProperty()
  @IsDecimal()
  amountPaid!: string | number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currency!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  transactionReference!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  billingPeriodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  billingPeriodEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
