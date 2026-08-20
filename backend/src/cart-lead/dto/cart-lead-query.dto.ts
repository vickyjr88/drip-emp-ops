import { ApiPropertyOptional } from '@nestjs/swagger';
import { CartLeadSource, CartLeadStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

export class CartLeadQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ enum: CartLeadSource })
  @IsOptional()
  @IsEnum(CartLeadSource)
  source?: CartLeadSource;

  @ApiPropertyOptional({ enum: CartLeadStatus })
  @IsOptional()
  @IsEnum(CartLeadStatus)
  status?: CartLeadStatus;
}
