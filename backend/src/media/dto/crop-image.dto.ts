import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

/**
 * What to keep of an image: either a rectangle in the image's own pixels (as displayed: after any camera-orientation
 * rotation), or `square: true` for the largest centred square. The image is cropped in place.
 */
export class CropImageDto {
  @ApiProperty({ description: 'The library image to crop. It is replaced by the cropped picture and keeps its address.' })
  @IsString()
  assetId!: string;

  @ApiPropertyOptional({ description: 'Take the largest centred square instead of a rectangle.' })
  @IsOptional()
  @IsBoolean()
  square?: boolean;

  @ApiPropertyOptional() @ValidateIf((o) => !o.square) @Type(() => Number) @IsNumber() @Min(0) x?: number;
  @ApiPropertyOptional() @ValidateIf((o) => !o.square) @Type(() => Number) @IsNumber() @Min(0) y?: number;
  @ApiPropertyOptional() @ValidateIf((o) => !o.square) @Type(() => Number) @IsNumber() @Min(1) width?: number;
  @ApiPropertyOptional() @ValidateIf((o) => !o.square) @Type(() => Number) @IsNumber() @Min(1) height?: number;
}

export class RestoreImageDto {
  @ApiProperty({ description: 'The image whose most recent crop is to be undone.' })
  @IsString()
  assetId!: string;
}
