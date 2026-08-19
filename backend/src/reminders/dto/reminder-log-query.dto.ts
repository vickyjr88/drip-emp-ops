import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ReminderDispatchStatus, ReminderTargetType } from '@prisma/client';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

export class ReminderLogQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ enum: ReminderDispatchStatus })
  @IsOptional()
  @IsIn(['PENDING', 'SENT', 'FAILED', 'SKIPPED'])
  status?: ReminderDispatchStatus;

  @ApiPropertyOptional({ enum: ReminderTargetType })
  @IsOptional()
  @IsIn(['SALES_INSTALLMENT', 'RENT', 'UTILITY', 'INVOICE'])
  targetType?: ReminderTargetType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ruleId?: string;
}
