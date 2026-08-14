import { ArrayMinSize, IsArray, IsDateString, IsNumber, Min, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PaymentScheduleInstallmentInputDto {
  @ApiProperty()
  @IsDateString()
  dueDate!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class UpsertPaymentScheduleDto {
  @ApiProperty({ type: [PaymentScheduleInstallmentInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentScheduleInstallmentInputDto)
  installments!: PaymentScheduleInstallmentInputDto[];
}
