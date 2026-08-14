import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class RecategoriseLineDto {
  @ApiProperty()
  @IsUUID()
  lineId!: string;

  @ApiPropertyOptional({ description: 'Move this line to a different GL account.' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Move this line to a different project. Null detaches it from any project.',
  })
  @IsOptional()
  @IsUUID()
  storeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  memo?: string;
}

/**
 * Amounts and dates are intentionally absent: this corrects where spend is
 * reported, never what was spent.
 */
export class RecategoriseJournalDto {
  @ApiProperty({ type: [RecategoriseLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecategoriseLineDto)
  lines!: RecategoriseLineDto[];
}
