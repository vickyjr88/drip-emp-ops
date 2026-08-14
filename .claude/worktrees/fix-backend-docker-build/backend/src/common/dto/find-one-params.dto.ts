import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FindOneParamsDto {
  @ApiPropertyOptional({ description: 'Comma-separated list of relations to include (e.g. blocks,blocks.units)' })
  @IsOptional()
  @IsString()
  include?: string;
}
