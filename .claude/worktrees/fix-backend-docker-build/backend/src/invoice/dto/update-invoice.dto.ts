import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class CancelInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  cancelledBy?: string;
}
