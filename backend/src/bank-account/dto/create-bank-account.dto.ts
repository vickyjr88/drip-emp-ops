import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BankAccountType {
  BANK = 'BANK',
  MOBILE_MONEY = 'MOBILE_MONEY',
}

export class CreateBankAccountDto {
  @ApiPropertyOptional({ enum: BankAccountType, default: BankAccountType.BANK })
  @IsOptional()
  @IsEnum(BankAccountType)
  type?: BankAccountType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @ApiProperty({ description: 'Bank name, or mobile money provider (e.g. M-Pesa, Airtel Money) when type is MOBILE_MONEY' })
  @IsString()
  @IsNotEmpty()
  bankName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ default: 'KES' })
  @IsOptional()
  @IsString()
  currencyCode?: string;

  @ApiProperty({ description: 'ChartOfAccount ID this bank account maps to' })
  @IsUUID()
  glAccountId!: string;

  @ApiPropertyOptional({ description: 'Project this account is dedicated to; omit for a shared company-level account' })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
