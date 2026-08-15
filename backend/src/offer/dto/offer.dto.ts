import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber,
  IsOptional, IsString, Max, Min, ValidateNested,
} from 'class-validator';
import { OfferStatus } from '@prisma/client';

export class OfferLineDto {
  @ApiProperty() @IsString() @IsNotEmpty() variantId!: string;

  @ApiPropertyOptional({
    description: 'Overrides the offer price for this one variant. Rarely needed.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offerPriceKes?: number;
}

export class CreateOfferDto {
  @ApiProperty({ example: 'End of season clearance' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Badge text on the storefront, e.g. "Clearance".' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ description: 'Percentage off retail. Give this or fixedPriceKes, not both.' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(90)
  percentOff?: number;

  @ApiPropertyOptional({ description: 'Flat sale price. Give this or percentOff, not both.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedPriceKes?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiProperty({ type: [OfferLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OfferLineDto)
  lines!: OfferLineDto[];
}

export class UpdateOfferDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(OfferStatus) status?: OfferStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
