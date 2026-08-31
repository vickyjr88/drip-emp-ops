import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The code is deliberately not editable here -- it is already live in
 * published ads and printed material by the time anyone would want to
 * rename it, and changing it would silently break every link already
 * handed out. Retiring a campaign is what `isActive` is for.
 */
export class UpdateCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
