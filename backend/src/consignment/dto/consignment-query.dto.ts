import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ConsignmentStatus } from '@prisma/client';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
};

export class ConsignmentQueryDto extends PagedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ enum: ['OPEN', 'SETTLED', 'WRITTEN_OFF'] })
  @IsOptional()
  @IsIn(['OPEN', 'SETTLED', 'WRITTEN_OFF'])
  status?: ConsignmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  overdueOnly?: boolean;
}
