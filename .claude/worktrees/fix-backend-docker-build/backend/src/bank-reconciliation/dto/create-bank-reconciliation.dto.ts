import { IsArray, IsDateString, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBankReconciliationDto {
  @ApiProperty()
  @IsUUID()
  bankAccountId!: string;

  @ApiProperty()
  @IsDateString()
  statementDate!: string;

  @ApiProperty()
  @IsNumber()
  statementBalance!: number;

  @ApiProperty()
  @IsNumber()
  systemBalance!: number;

  @ApiPropertyOptional({ type: [String], description: 'JournalLine IDs marked as cleared on the statement' })
  @IsOptional()
  @IsArray()
  clearedJournalLineIds?: string[];
}
