import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { CartLeadFollowUp, CartLeadSource, CartLeadStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

export class CartLeadQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ enum: CartLeadSource })
  @IsOptional()
  @IsEnum(CartLeadSource)
  source?: CartLeadSource;

  @ApiPropertyOptional({ enum: CartLeadStatus })
  @IsOptional()
  @IsEnum(CartLeadStatus)
  status?: CartLeadStatus;

  @ApiPropertyOptional({ enum: CartLeadFollowUp, description: 'Where the automatic follow-up stands: PENDING, DONE, FAILED or SKIPPED' })
  @IsOptional()
  @IsEnum(CartLeadFollowUp)
  followUp?: CartLeadFollowUp;

  /**
   * The live worklist: still NEW or CONTACTED, nothing dismissed or already
   * converted. Separate from `status` (an exact match on one status) since
   * "still outstanding" is two statuses at once -- the working Cart Leads
   * list wants this, the history page wants the opposite.
   */
  @ApiPropertyOptional({ description: 'true = only NEW/CONTACTED; false = only EXPIRED/CONVERTED (history)' })
  @IsOptional()
  @Transform(toBoolean)
  outstanding?: boolean;
}
