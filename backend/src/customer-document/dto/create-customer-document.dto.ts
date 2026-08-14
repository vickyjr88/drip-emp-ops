import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CustomerDocumentTypeDto {
  NATIONAL_ID = 'NATIONAL_ID',
  PASSPORT = 'PASSPORT',
  KRA_PIN = 'KRA_PIN',
  PROOF_OF_ADDRESS = 'PROOF_OF_ADDRESS',
  BANK_STATEMENT = 'BANK_STATEMENT',
  SALE_CONTRACT = 'SALE_CONTRACT',
  LEASE_AGREEMENT = 'LEASE_AGREEMENT',
  NEXT_OF_KIN_ID = 'NEXT_OF_KIN_ID',
  PHOTO = 'PHOTO',
  OTHER = 'OTHER',
}

export class CreateCustomerDocumentDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  customerId!: string;

  @ApiProperty({ enum: CustomerDocumentTypeDto })
  @IsEnum(CustomerDocumentTypeDto)
  documentType!: CustomerDocumentTypeDto;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  objectKey!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
