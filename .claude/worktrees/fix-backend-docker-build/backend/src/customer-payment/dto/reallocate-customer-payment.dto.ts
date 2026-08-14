import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReallocateCustomerPaymentDto {
  @ApiProperty({ description: 'Contract to move this payment (or part of it) to' })
  @IsUUID()
  destinationContractId!: string;

  @ApiPropertyOptional({
    description: 'Amount to move; omit to reallocate the full payment. If less than the full amount, the original payment is split.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reallocatedBy?: string;
}
