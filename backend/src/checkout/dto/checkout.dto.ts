import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Min, MinLength, ValidateNested,
} from 'class-validator';

export class CheckoutLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CheckoutDto {
  @ApiProperty({ type: [CheckoutLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutLineDto)
  lines!: CheckoutLineDto[];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '+254113206481' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({
    description: 'Where to deliver. Omit for collection at a shop.',
  })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @ApiPropertyOptional({
    description: 'Sets a password so the buyer can sign in and see their orders. Optional: buying should not require an account.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ description: 'Which shop fulfils this. Defaults to the first active store.' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({
    description: "The referring reseller's public code, captured from a shared link. Ignored if unknown or if it would attribute the order to the person placing it.",
  })
  @IsOptional()
  @IsString()
  referralCode?: string;

  @ApiPropertyOptional({
    description: 'A paid-marketing campaign code, captured from a shared link (?camp=). Mutually exclusive with referralCode in practice -- attribution is last-click-wins across both, so the client only ever sends whichever was clicked most recently.',
  })
  @IsOptional()
  @IsString()
  campaignCode?: string;
}

export class CustomerSignupDto {
  @ApiProperty() @IsString() @IsNotEmpty() firstName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() lastName!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @IsNotEmpty() phone!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
