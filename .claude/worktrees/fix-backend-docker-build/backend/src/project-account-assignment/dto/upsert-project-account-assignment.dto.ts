import { IsEnum, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AccountPurpose } from '@prisma/client';

export class UpsertProjectAccountAssignmentDto {
  @ApiProperty({ enum: AccountPurpose })
  @IsEnum(AccountPurpose)
  purpose!: AccountPurpose;

  @ApiProperty()
  @IsUUID()
  bankAccountId!: string;
}
