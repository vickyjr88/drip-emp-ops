import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray } from 'class-validator';

export class DataImportDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Parsed rows. Each carries a rowNumber plus one key per column.',
  })
  @IsArray()
  // A guard against a runaway paste, not a business limit.
  @ArrayMaxSize(20000)
  rows!: Array<Record<string, unknown>>;
}
