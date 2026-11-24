import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateSocialSettingsDto {
  @ApiPropertyOptional({ description: 'Post to the Facebook Page on the schedule' })
  @IsOptional()
  @IsBoolean()
  facebookEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Post to Threads on the schedule' })
  @IsOptional()
  @IsBoolean()
  threadsEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Post to Instagram on the schedule' })
  @IsOptional()
  @IsBoolean()
  instagramEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Post to X on the schedule (X charges for each post)' })
  @IsOptional()
  @IsBoolean()
  xEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Post to TikTok on the schedule' })
  @IsOptional()
  @IsBoolean()
  tiktokEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['INBOX', 'DIRECT'], description: 'INBOX sends TikTok posts to the owner\'s TikTok inbox to finish; DIRECT publishes them (only once TikTok has audited the app)' })
  @IsOptional()
  @IsIn(['INBOX', 'DIRECT'])
  tiktokMode?: 'INBOX' | 'DIRECT';

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

  @ApiPropertyOptional({ enum: ['FACEBOOK', 'THREADS', 'INSTAGRAM', 'X', 'TIKTOK'], description: 'Where to post. Defaults to the Facebook Page.' })
  @IsOptional()
  @IsIn(['FACEBOOK', 'THREADS', 'INSTAGRAM', 'X', 'TIKTOK'])
  channel?: 'FACEBOOK' | 'THREADS' | 'INSTAGRAM' | 'X' | 'TIKTOK';
}
