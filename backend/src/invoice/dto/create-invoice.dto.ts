import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum InvoiceSourceType {
  SALES_CONTRACT = 'SALES_CONTRACT',
  TENANCY = 'TENANCY',
  MANUAL = 'MANUAL',
}

export class InvoiceLineInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  glAccountId?: string;

  @ApiPropertyOptional({ description: 'Tax rate ID to apply on top of this line amount (e.g. VAT Output)' })
  @IsOptional()
  @IsUUID()
  taxRateId?: string;
}

export class CreateInvoiceDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ enum: InvoiceSourceType, default: InvoiceSourceType.MANUAL })
  @IsOptional()
  @IsEnum(InvoiceSourceType)
  sourceType?: InvoiceSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({ default: 'KES' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty()
  @IsDateString()
  dueDate!: string;

  @ApiProperty({ type: [InvoiceLineInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  lines!: InvoiceLineInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class BulkGenerateInvoicesDto {
  @ApiProperty({ enum: InvoiceSourceType })
  @IsEnum(InvoiceSourceType)
  sourceType!: InvoiceSourceType;

  @ApiProperty({ description: 'Due date applied to every generated invoice' })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: string;
}
