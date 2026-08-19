import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Base for every list endpoint that should return a paginated envelope.
 *
 * Unlike PaginationDto, extending this class is a commitment: the response is
 * always `{ items, total, skip, take }`, never a bare array. PaginationDto's
 * "paginate by default but hand back an array anyway" shape is what let a
 * caller treat an envelope as a plain list and crash on `T is not iterable` --
 * a fixed, unconditional shape removes that failure mode rather than
 * documenting around it.
 */
export class PagedQueryDto {
  @ApiPropertyOptional({ description: 'Number of records to skip', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  // 500 rather than a tighter page-sized cap: several callers (picker
  // dropdowns, CSV-style bulk views) legitimately need "give me everything"
  // rather than one page, and a hard per-page UI limit is enforced by the
  // page-size options offered in the UI, not by what the API will accept.
  @ApiPropertyOptional({ description: 'Number of records to take', default: 25, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number = 25;

  @ApiPropertyOptional({ description: 'Case-insensitive text search, fields vary by endpoint' })
  @IsOptional()
  @IsString()
  search?: string;
}
