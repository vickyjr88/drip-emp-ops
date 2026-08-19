import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

export class CustomerQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ enum: ['RETAIL', 'RESELLER', 'WHOLESALE'] })
  @IsOptional()
  @IsIn(['RETAIL', 'RESELLER', 'WHOLESALE'])
  priceTier?: 'RETAIL' | 'RESELLER' | 'WHOLESALE';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  isActive?: boolean;

  @ApiPropertyOptional({ enum: ['name-asc', 'name-desc', 'email-asc'], default: 'name-asc' })
  @IsOptional()
  @IsIn(['name-asc', 'name-desc', 'email-asc'])
  sortBy?: 'name-asc' | 'name-desc' | 'email-asc';
}
