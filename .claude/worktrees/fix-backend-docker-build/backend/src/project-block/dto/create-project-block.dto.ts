import { IsString, IsNotEmpty, IsUUID, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectBlockDto {
  @ApiProperty({ description: 'ID of the project this block belongs to' })
  @IsUUID()
  @IsNotEmpty()
  projectId!: string;

  @ApiProperty({ description: 'Name of the block' })
  @IsString()
  @IsNotEmpty()
  blockName!: string;

  @ApiProperty({ description: 'Total number of floors in the block' })
  @IsInt()
  @Min(1)
  totalFloors!: number;
}
