import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRefundDto {
  @ApiProperty()
  @IsUUID()
  receiptId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  method!: string;

  @ApiPropertyOptional({ description: 'Bank/mobile money account to pay the refund from; defaults to the account the original receipt was received into' })
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestedBy?: string;
}

export class ApproveRefundDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  processedBy?: string;
}

export class RejectRefundDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  processedBy?: string;
}
