import { IsString, IsNotEmpty, IsUUID, IsDecimal, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentReallocationAuditDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  paymentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceContractId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  destinationContractId?: string;

  @ApiProperty()
  @IsDecimal()
  reallocatedAmount!: string | number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reallocatedBy!: string;
}
