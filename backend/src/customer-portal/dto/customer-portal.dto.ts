import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CustomerLoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class CustomerChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class RequestRentChangeDto {
  @ApiProperty()
  @IsUUID()
  unitId!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  proposedRent!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ownerNote?: string;
}

export class ReviewRentChangeDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

export class SetCustomerPortalAccessDto {
  @ApiProperty({ minLength: 8, description: 'New portal password for this customer.' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class CustomerSelfSignupDto {
  @ApiProperty() @IsString() @IsNotEmpty() firstName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() lastName!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @IsNotEmpty() phone!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class CustomerForgotPasswordDto {
  @ApiProperty() @IsEmail() email!: string;
}

export class CustomerResetPasswordDto {
  @ApiProperty({ description: 'The token from the emailed link.' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class SubmitResellerApplicationDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) businessName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
}

export class UpdateCustomerProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(30) phone?: string;
  /** Only meaningful for a trade customer; sent as an empty string to clear. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) businessName?: string;
}

export class RecordReferralClickDto {
  @ApiProperty({ description: "The referring reseller's public code, from a shared link's ?ref= param." })
  @IsString()
  @IsNotEmpty()
  code!: string;
}
