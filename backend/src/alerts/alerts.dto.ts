import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class UpdateAlertSettingsDto {
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

  @ApiPropertyOptional({ example: 'admin_alert' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9_]+$/, { message: 'a template name is lower-case letters, digits and underscores' })
  whatsappTemplate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  dailyWhatsAppCap?: number;

  @ApiPropertyOptional({ example: { 'inquiry.contact': { whatsapp: false } } })
  @IsOptional()
  @IsObject()
  kinds?: Record<string, { email?: boolean; whatsapp?: boolean }>;
}
