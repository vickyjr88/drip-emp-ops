import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const CONTRACT_TYPES = ['PERMANENT', 'FIXED_TERM', 'CASUAL', 'INTERN'];
const PAY_TYPES = ['MONTHLY', 'DAILY'];
const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'];

export class CreateEmployeeDto {
  @ApiPropertyOptional({ description: 'Generated when omitted.' })
  @IsOptional()
  @IsString()
  employeeNumber?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  kraPin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nssfNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shifNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Project this person’s cost belongs to. Omit if shared.' })
  @IsOptional()
  @IsUUID()
  storeId?: string | null;

  @ApiPropertyOptional({ enum: CONTRACT_TYPES })
  @IsOptional()
  @IsIn(CONTRACT_TYPES)
  contractType?: string;

  @ApiPropertyOptional({ enum: PAY_TYPES })
  @IsOptional()
  @IsIn(PAY_TYPES)
  payType?: string;

  @ApiPropertyOptional({ description: 'Monthly salary, or the daily rate for daily-rated staff.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({ enum: EMPLOYEE_STATUSES })
  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'Portal account, for staff who also sign in.' })
  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateEmployeeDto extends CreateEmployeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare lastName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  declare startDate: string;
}

export class CreateLeaveTypeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({ description: 'Days for a full leave year.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  annualDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  carriesOver?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxCarryOver?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @ApiPropertyOptional({ description: 'Whether casual staff accrue this type.' })
  @IsOptional()
  @IsBoolean()
  accruesForCasual?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateLeaveRequestDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty()
  @IsUUID()
  leaveTypeId!: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReviewLeaveRequestDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

export class OpenBalancesDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year!: number;

  @ApiPropertyOptional({ description: 'Limit to one employee. Omit for everyone.' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class AdjustBalanceDto {
  @ApiProperty({ description: 'Days to add, or a negative number to remove.' })
  @Type(() => Number)
  @IsNumber()
  days!: number;

  @ApiProperty({ description: 'Why the adjustment was made.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;
}
