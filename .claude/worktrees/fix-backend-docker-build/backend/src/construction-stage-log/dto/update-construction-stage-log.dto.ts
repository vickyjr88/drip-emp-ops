import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConstructionStage } from '../../construction-status/dto/update-construction-status.dto';

export class UpdateConstructionStageLogDto {
  @ApiPropertyOptional({ enum: ConstructionStage })
  @IsOptional()
  @IsEnum(ConstructionStage)
  stage?: ConstructionStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  photoUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedBy?: string;
}
