import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

export class BlogPostQueryDto extends PagedQueryDto {
  // Staff list every post regardless of status; the public listing always
  // forces this true at the service call site rather than trusting a caller
  // to pass it, so a draft can never leak by a missing query param.
  @ApiPropertyOptional({ description: 'Staff-only: include unpublished drafts' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDrafts?: boolean;
}
