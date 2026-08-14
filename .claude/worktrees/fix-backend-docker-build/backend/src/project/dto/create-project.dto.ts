import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ description: 'Unique code for the project' })
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Name of the project' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Narrative description of the project', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Location of the project', required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ description: 'Featured image URL or uploaded data URL', required: false })
  @IsOptional()
  @IsString()
  featuredImageUrl?: string;

  @ApiProperty({ description: 'Project gallery image URLs or uploaded data URLs', required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  galleryImages?: string[];

  @ApiProperty({ description: 'Whether the project is archived', default: false })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
