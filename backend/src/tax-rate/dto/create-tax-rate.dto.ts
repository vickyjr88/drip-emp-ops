import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaxApplication } from '@prisma/client';

export class CreateTaxRateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'Decimal rate, e.g. 0.16 for 16%' })
  @IsNumber()
  @Min(0)
  @Max(1)
  rate!: number;

  @ApiProperty({ enum: TaxApplication })
  @IsEnum(TaxApplication)
  appliesTo!: TaxApplication;

  @ApiProperty({ description: 'ChartOfAccount ID this tax posts to (e.g. VAT Output, VAT Input, WHT Payable)' })
  @IsUUID()
  glAccountId!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
