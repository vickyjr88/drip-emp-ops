import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { AccountPurpose } from '@prisma/client';

export class CreateStoreAccountAssignmentDto {
  @ApiProperty({
    enum: AccountPurpose,
    description: 'Which kind of money movement this bank account handles for the store.',
  })
  @IsEnum(AccountPurpose)
  purpose!: AccountPurpose;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankAccountId!: string;
}
