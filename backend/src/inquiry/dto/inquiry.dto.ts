import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsValidPhoneNumber } from '../../common/phone.util';

export class CreateInquiryDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiPropertyOptional({ example: '+254113206481' }) @IsOptional() @IsValidPhoneNumber() phone?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(4000) message!: string;
}
