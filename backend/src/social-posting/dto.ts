import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateSocialSettingsDto {
  @ApiPropertyOptional({ description: 'Post to the Facebook Page on the schedule' })
  @IsOptional()
  @IsBoolean()
  facebookEnabled?: boolean;

  @ApiPropertyOptional({ example: ['09:00', '13:00', '19:00'], description: 'Nairobi time, HH:MM, at most six' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @Matches(/^([01]?\d|2[0-3]):[0-5]\d$/, { each: true, message: 'each time must be HH:MM' })
  times?: string[];

  @ApiPropertyOptional({ example: 30, description: 'Days before the same product is posted again' })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(365)
  cooldownDays?: number;
}

export class PostNowDto {
  @ApiPropertyOptional({ description: 'A product to post. Omit to let the engine choose the next one.' })
  @IsOptional()
  @IsString()
  productId?: string;
}
