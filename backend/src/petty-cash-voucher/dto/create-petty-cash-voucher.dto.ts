import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PettyCashVoucherType {
  TOPUP = 'TOPUP',
  EXPENSE = 'EXPENSE',
}

export class CreatePettyCashVoucherDto {
  @ApiProperty()
  @IsUUID()
  boxId!: string;

  @ApiProperty({ enum: PettyCashVoucherType })
  @IsEnum(PettyCashVoucherType)
  type!: PettyCashVoucherType;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payee?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  purpose!: string;

  @ApiPropertyOptional({ description: 'ChartOfAccount ID; expense vouchers default to General Expense, topups default to the bank/cash account' })
  @IsOptional()
  @IsUUID()
  glAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: string;
}
