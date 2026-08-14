import { IsUUID, IsDecimal, IsOptional, IsBoolean, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUnitOwnershipDto {
  @ApiProperty()
  @IsUUID()
  unitId!: string;

  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiProperty({ description: 'Percentage of ownership (e.g., 100.0)' })
  @IsDecimal()
  ownershipPercentage!: number | string;

  @ApiPropertyOptional({ description: 'Primary owner flag' })
  @IsOptional()
  @IsBoolean()
  isPrimaryOwner?: boolean;

  @ApiPropertyOptional({ description: 'Reason recorded on the ownership trail' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Actor recorded on the ownership trail' })
  @IsOptional()
  @IsString()
  changedBy?: string;
}
