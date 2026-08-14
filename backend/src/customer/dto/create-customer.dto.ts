import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * A customer, as a shoe shop needs one: who they are and how to reach them.
 *
 * The ID number, tax PIN and next-of-kin this used to require belonged to
 * property contracts. Asking a shopper for a passport number to buy trainers
 * would lose the sale, so they are gone rather than made optional.
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

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '+254113206481' })
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
