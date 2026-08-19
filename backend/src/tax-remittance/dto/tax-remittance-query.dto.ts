import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

export class TaxRemittanceQueryDto extends PagedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxRateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeId?: string;
}
