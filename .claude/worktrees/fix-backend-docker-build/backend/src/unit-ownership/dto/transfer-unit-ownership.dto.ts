import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferUnitOwnershipDto {
  @ApiProperty({ description: 'Customer the ownership is being transferred to' })
  @IsUUID()
  toCustomerId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  changedBy?: string;
}
