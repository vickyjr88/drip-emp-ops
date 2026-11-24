import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * A customer, as a shoe shop needs one: who they are and how to reach them.
 *
 * The ID number, tax PIN and next-of-kin this used to require belonged to
 * property contracts. Asking a shopper for a passport number to buy trainers
 * would lose the sale, so they are gone rather than made optional.
 *
 * Email is optional at the door: a walk-in rung up from the till often has
 * only a name and a phone number in hand. It stays required at the column
 * (unique, used as the portal login), so a caller with no real address gets a
 * placeholder derived from the phone number instead -- see customer.service.ts.
 */
export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiPropertyOptional({ description: 'Falls back to a placeholder derived from the phone number when omitted.' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '+254113206481' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({ enum: ['RETAIL', 'RESELLER', 'WHOLESALE'], description: 'Which price list they buy at. Defaults to RETAIL. A shop buying to resell is RESELLER or WHOLESALE.' })
  @IsOptional()
  @IsIn(['RETAIL', 'RESELLER', 'WHOLESALE'])
  priceTier?: 'RETAIL' | 'RESELLER' | 'WHOLESALE';

  @ApiPropertyOptional({ description: 'The shop or business they buy for, when they buy as a trade customer.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessName?: string;
}
