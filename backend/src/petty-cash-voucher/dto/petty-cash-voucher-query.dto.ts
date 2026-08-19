import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

export class PettyCashVoucherQueryDto extends PagedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  boxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;
}
