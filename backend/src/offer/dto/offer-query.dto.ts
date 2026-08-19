import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

export class OfferQueryDto extends PagedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  includeEnded?: boolean;
}
