import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SupplierPaymentAllocationInputDto {
  @ApiProperty()
  @IsUUID()
  supplierInvoiceId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class CreateSupplierPaymentDto {
  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @ApiPropertyOptional({ default: 'KES' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Override the supplier default withholding tax rate for this payment; pass null via omission to use the supplier default' })
  @IsOptional()
  @IsUUID()
  whtRateId?: string;

  @ApiProperty({ type: [SupplierPaymentAllocationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierPaymentAllocationInputDto)
  allocations!: SupplierPaymentAllocationInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stagedBy?: string;
}
