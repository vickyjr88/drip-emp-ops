import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ConstructionStage {
  PLANNING = 'PLANNING',
  FOUNDATION = 'FOUNDATION',
  STRUCTURE = 'STRUCTURE',
  ROOFING = 'ROOFING',
  FINISHING = 'FINISHING',
  HANDOVER = 'HANDOVER',
}

export class UpdateConstructionStatusDto {
  @ApiPropertyOptional({ enum: ConstructionStage })
  @IsOptional()
  @IsEnum(ConstructionStage)
  currentStage?: ConstructionStage;

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

  @ApiPropertyOptional({ type: [String], description: 'Supporting photo URLs for this progress update' })
  @IsOptional()
  @IsArray()
  photoUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  updatedBy?: string;
}
