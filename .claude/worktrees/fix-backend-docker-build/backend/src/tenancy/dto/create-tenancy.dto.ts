import { IsUUID, IsNotEmpty, IsOptional, IsString, IsDecimal, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TenancyStatusDto {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}

export class CreateTenancyDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  unitId!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty()
  @IsDateString()
  leaseStart!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  leaseEnd?: string;

  @ApiPropertyOptional({ enum: TenancyStatusDto, default: TenancyStatusDto.ACTIVE })
  @IsOptional()
  @IsEnum(TenancyStatusDto)
  status?: TenancyStatusDto;

  @ApiProperty()
  @IsDecimal()
  monthlyRent!: string | number;

  @ApiPropertyOptional({ default: 'KES' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDecimal()
  depositAmount?: string | number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
