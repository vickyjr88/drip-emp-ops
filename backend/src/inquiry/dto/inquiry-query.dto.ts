import { ApiPropertyOptional } from '@nestjs/swagger';
import { InquiryStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

export class InquiryQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ enum: InquiryStatus })
  @IsOptional()
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;
}
