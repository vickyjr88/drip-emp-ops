import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8, description: 'New password set by an administrator' })
  @IsString()
  @MinLength(8)
  password!: string;
}
