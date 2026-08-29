import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateResellerPayoutDto {
  @ApiProperty()
  @IsUUID()
  resellerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stagedBy?: string;
}
