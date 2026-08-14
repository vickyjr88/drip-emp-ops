import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUnitTransferDto {
  @ApiProperty()
  @IsUUID()
  contractId!: string;

  @ApiProperty({ description: 'Unit the customer is moving to; must currently be AVAILABLE' })
  @IsUUID()
  toUnitId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transferredBy?: string;
}
