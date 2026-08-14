import {
  IsString,
  IsEmail,
  IsOptional,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'isObjectOrArray', async: false })
class IsObjectOrArrayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    // class-validator's @IsObject() rejects arrays; nextOfKin supports both legacy object and array.
    return value === null || value === undefined || typeof value === 'object';
  }

  defaultMessage(args?: ValidationArguments) {
    return `${args?.property || 'value'} must be an object or array`;
  }
}

export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiProperty()
  @IsString()
  nationalIdPassport!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  kraPin?: string;

  @ApiPropertyOptional({
    description: 'Single next-of-kin object (legacy) or array of next-of-kin entries with ownershipPercentage',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @Validate(IsObjectOrArrayConstraint)
  nextOfKinJson?: any;
}
