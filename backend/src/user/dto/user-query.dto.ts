import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

export class UserQueryDto extends PagedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roleId?: string;
}
