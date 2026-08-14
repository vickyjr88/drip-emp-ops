import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentFrequency {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMI_ANNUALLY = 'SEMI_ANNUALLY',
  ANNUALLY = 'ANNUALLY',
}

export class GeneratePaymentScheduleDto {
  @ApiProperty({ description: 'First installment period starts from this date' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: 'Total duration of the payment plan in months, e.g. 36 for 3 years' })
  @IsInt()
  @Min(1)
  @Max(600)
  durationMonths!: number;

  @ApiProperty({ enum: PaymentFrequency })
  @IsEnum(PaymentFrequency)
  frequency!: PaymentFrequency;

  @ApiPropertyOptional({ description: 'Optional upfront deposit due on the start date, deducted from the amount spread across the remaining installments' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;
}
