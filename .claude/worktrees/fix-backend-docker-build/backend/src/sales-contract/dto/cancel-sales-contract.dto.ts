import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CancelSalesContractDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({
    description: 'Cancellation charge rate as a fraction of amount paid to date (e.g. 0.1 for 10%). Defaults to the project\'s configured rate.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  cancellationChargeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cancelledBy?: string;
}
