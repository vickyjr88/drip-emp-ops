import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ReminderChannel,
  ReminderTargetType,
  ReminderTiming,
  RentalPaymentCategory,
} from '@prisma/client';

export class CreateReminderRuleDto {
  @ApiProperty({ example: '15 days before installment' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ReminderTargetType })
  @IsEnum(ReminderTargetType)
  targetType!: ReminderTargetType;

  @ApiProperty({ enum: ReminderTiming })
  @IsEnum(ReminderTiming)
  timing!: ReminderTiming;

  @ApiPropertyOptional({ description: 'Days from the due date. Always positive.', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  offsetDays?: number;

  @ApiPropertyOptional({ enum: ReminderChannel, default: ReminderChannel.BOTH })
  @IsOptional()
  @IsEnum(ReminderChannel)
  channel?: ReminderChannel;

  @ApiPropertyOptional({ description: 'Restrict to one project. Omit to apply everywhere.' })
  @IsOptional()
  @IsUUID()
  storeId?: string | null;

  @ApiPropertyOptional({ enum: RentalPaymentCategory, description: 'UTILITY rules only.' })
  @IsOptional()
  @IsEnum(RentalPaymentCategory)
  utilityCategory?: RentalPaymentCategory | null;

  @ApiPropertyOptional({
    description:
      'Supports {{customerName}}, {{amount}}, {{currency}}, {{dueDate}}, {{daysUntilDue}}, {{daysOverdue}}, {{unitNumber}}, {{projectName}}, {{description}}, {{reference}}.',
  })
  @IsOptional()
  @IsString()
  smsTemplate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailSubject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emailTemplate?: string;

  @ApiPropertyOptional({ description: 'Hour 0-23. Sends inside the window are held.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursStart?: number | null;

  @ApiPropertyOptional({ description: 'Hour 0-23.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  quietHoursEnd?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateReminderRuleDto extends PartialType(CreateReminderRuleDto) {}
