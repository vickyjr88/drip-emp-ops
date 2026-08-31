import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty({ example: 'fb-nov-sale', description: 'Chosen by the admin so the link stays short and readable in an ad.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  // Lowercase letters, numbers and hyphens only -- this goes straight into a
  // URL query string, and keeping it to a safe character set means it never
  // needs escaping or gets mangled by an ad platform's own URL handling.
  @Matches(/^[a-z0-9-]+$/, { message: 'Use only lowercase letters, numbers and hyphens.' })
  code!: string;

  @ApiProperty({ example: 'Facebook November Sale' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
