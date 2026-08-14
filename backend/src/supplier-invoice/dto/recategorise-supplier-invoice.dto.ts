import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Only the categorisation fields. Amounts, dates and the supplier are absent by
 * design: this corrects where spend is reported, never what was spent.
 */
export class RecategoriseSupplierInvoiceDto {
  @ApiPropertyOptional({ nullable: true, description: 'Project the spend belongs to. Null clears it.' })
  @IsOptional()
  @IsUUID()
  storeId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Expense category. Must be an EXPENSE account.' })
  @IsOptional()
  @IsUUID()
  glExpenseAccountId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  unitId?: string | null;
}
