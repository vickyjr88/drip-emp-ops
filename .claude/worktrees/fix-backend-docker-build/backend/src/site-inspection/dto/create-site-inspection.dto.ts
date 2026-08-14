import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConstructionStage } from '../../construction-status/dto/update-construction-status.dto';

export enum InspectionOutcome {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  NEEDS_FOLLOW_UP = 'NEEDS_FOLLOW_UP',
}

export class CreateSiteInspectionDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  blockId!: string;

  @ApiProperty({ enum: ConstructionStage })
  @IsEnum(ConstructionStage)
  stage!: ConstructionStage;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  inspectorName!: string;

  @ApiProperty()
  @IsDateString()
  inspectionDate!: string;

  @ApiProperty({ enum: InspectionOutcome })
  @IsEnum(InspectionOutcome)
  outcome!: InspectionOutcome;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  findings?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  photoUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: string;
}
