import { IsString, IsNotEmpty, IsUUID, IsNumber, Min, IsDateString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCustomerPaymentDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  contractId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amountPaid!: number;

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
  paymentDate?: string;
}
