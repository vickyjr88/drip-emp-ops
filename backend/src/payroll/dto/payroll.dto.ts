import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

const KINDS = ['GRADUATED', 'PERCENTAGE', 'TIERED', 'FIXED'];
const BASES = ['GROSS', 'TAXABLE', 'BASIC'];

export class DeductionBandDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sequence?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lowerBound?: number;

  @ApiPropertyOptional({ description: 'Null for the top band.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  upperBound?: number | null;

  @ApiProperty({ description: 'Decimal rate, e.g. 0.25 for 25%.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate!: number;

  @ApiPropertyOptional({ description: 'Caps this band’s contribution.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number | null;
}

export class CreateDeductionRuleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS)
  kind!: string;

  @ApiPropertyOptional({ enum: BASES, default: 'GROSS' })
  @IsOptional()
  @IsIn(BASES)
  basis?: string;

  @ApiProperty({ description: 'Date this version starts applying.' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @ApiPropertyOptional({ description: 'Decimal rate for PERCENTAGE kinds.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmount?: number;

  @ApiPropertyOptional({ description: 'Monthly relief subtracted after the bands.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reliefAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employerRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employerFixed?: number;

  @ApiPropertyOptional({ description: 'Whether this reduces pay before TAXABLE deductions.' })
  @IsOptional()
  @IsBoolean()
  reducesTaxable?: boolean;

  @ApiProperty({ description: 'Account code the deduction is credited to.' })
  @IsString()
  @IsNotEmpty()
  liabilityAccountCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employerExpenseAccountCode?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isStatutory?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [DeductionBandDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeductionBandDto)
  bands?: DeductionBandDto[];
}

export class PayrollEntryDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allowances?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  overtime?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bonus?: number;

  @ApiPropertyOptional({ description: 'Days worked, for daily-rated staff.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  daysWorked?: number;
}

export class CreatePayrollRunDto {
  @ApiProperty({ description: 'Month being paid, e.g. 2026-08.' })
  @IsString()
  @IsNotEmpty()
  periodMonth!: string;

  @ApiPropertyOptional({ description: 'Limit the run to these employees.' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds?: string[];

  @ApiPropertyOptional({ type: [PayrollEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayrollEntryDto)
  entries?: PayrollEntryDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
