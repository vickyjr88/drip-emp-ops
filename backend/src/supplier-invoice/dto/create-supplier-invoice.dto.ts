import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupplierInvoiceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  invoiceNumber!: string;

  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiProperty()
  @IsDateString()
  invoiceDate!: string;

  @ApiProperty()
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ default: 'KES' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: 'Gross invoice amount (what is payable to the supplier). If taxRateId is set, VAT input is backed out of this total when posting the expense/tax split.' })
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ description: 'ChartOfAccount ID for the expense; defaults to General Expense if omitted' })
  @IsOptional()
  @IsUUID()
  glExpenseAccountId?: string;

  @ApiPropertyOptional({ description: 'Input VAT rate to back out of the gross amount for the expense/VAT-input split, if any.' })
  @IsOptional()
  @IsUUID()
  taxRateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: string;
}
