import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

export class AccountTransferQueryDto extends PagedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountId?: string;
}
