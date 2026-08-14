import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConstructionStage } from '../../construction-status/dto/update-construction-status.dto';

export class CreateSitePhotoDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  blockId!: string;

  @ApiPropertyOptional({ enum: ConstructionStage })
  @IsOptional()
  @IsEnum(ConstructionStage)
  stage?: ConstructionStage;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objectKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  uploadedBy?: string;
}
