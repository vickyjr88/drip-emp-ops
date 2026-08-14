import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePageContentDto {
  @ApiProperty({
    description:
      'Full content document for the page. Shape varies per page; missing fields fall back to the built-in defaults on read.',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  content!: Record<string, any>;
}
