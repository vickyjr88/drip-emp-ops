import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PriceTier } from '@prisma/client';

export class CreateResellerDto {
  @ApiProperty({ example: 'MNJ' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Mama Njeri Shoes' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiPropertyOptional({ enum: PriceTier, default: 'RESELLER' })
  @IsOptional()
  @IsEnum(PriceTier)
  priceTier?: PriceTier;

  @ApiPropertyOptional({ description: 'Most stock value they may hold at once. 0 means no limit.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateResellerDto extends CreateResellerDto {}
