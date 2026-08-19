import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

export class CustomerDocumentQueryDto extends PagedQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
