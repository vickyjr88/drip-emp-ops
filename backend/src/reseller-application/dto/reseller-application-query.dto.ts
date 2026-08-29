import { ApiPropertyOptional } from '@nestjs/swagger';
import { ResellerApplicationStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

export class ResellerApplicationQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ enum: ResellerApplicationStatus })
  @IsOptional()
  @IsEnum(ResellerApplicationStatus)
  status?: ResellerApplicationStatus;
}
