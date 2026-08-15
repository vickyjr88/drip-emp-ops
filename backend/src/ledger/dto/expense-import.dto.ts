import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ExpenseImportRowDto {
  @ApiProperty({ description: 'Row number in the source file, used to report errors back.' })
  @IsInt()
  rowNumber!: number;

  @ApiPropertyOptional({ description: 'd/m/yyyy or yyyy-mm-dd' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Positive amount. Separators and a KES prefix are tolerated.' })
  @IsOptional()
  amount?: string | number;

  @ApiPropertyOptional({ description: 'Expense account code, e.g. 5110' })
  @IsOptional()
  @IsString()
  accountCode?: string;

  @ApiPropertyOptional({ description: 'Store code. Falls back to defaultStoreCode.' })
  @IsOptional()
  @IsString()
  storeCode?: string;
}

export class ExpenseImportDto {
  @ApiProperty({ type: [ExpenseImportRowDto] })
  @IsArray()
  // A guard against a runaway paste, not a business limit; the spreadsheets in
  // use are ~2,700 rows.
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => ExpenseImportRowDto)
  rows!: ExpenseImportRowDto[];

  @ApiPropertyOptional({ default: '1000', description: 'Account the spend was paid from.' })
  @IsOptional()
  @IsString()
  creditAccountCode?: string;

  @ApiPropertyOptional({
    description:
      'Store code applied to rows that do not name one. Optional: head-office spend belongs to no store.',
  })
  @IsOptional()
  @IsString()
  defaultStoreCode?: string;

  @ApiPropertyOptional({ description: 'Label for this batch, so it can be undone as a unit.' })
  @IsOptional()
  @IsString()
  batchRef?: string;
}
