import { IsString, IsNotEmpty, IsUUID, IsDecimal, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSalesContractDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  contractNumber!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  unitId!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  primaryCustomerId!: string;

  @ApiPropertyOptional({ default: 'KES' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty()
  @IsDecimal()
  totalAgreedPrice!: string | number;

  @ApiPropertyOptional({ default: 'ACTIVE' })
  @IsOptional()
  @IsString()
  contractStatus?: string;
}
