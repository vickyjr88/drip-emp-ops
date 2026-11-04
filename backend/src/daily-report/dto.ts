import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateDailyReportSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: ['emporiumdrip@gmail.com'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  emailRecipients?: string[];

  @ApiPropertyOptional({ example: ['0722000000'], description: 'Kenyan numbers in any usual format' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(/^\+?[\d\s-]{9,16}$/, { each: true, message: 'each WhatsApp number must be a phone number' })
  whatsappRecipients?: string[];
}
