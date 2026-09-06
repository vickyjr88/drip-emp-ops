import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateBlogPostDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) slug!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(400) excerpt!: string;
  @ApiProperty() @IsString() @IsNotEmpty() body!: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() coverImageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) author?: string;
  // Publishing is a deliberate act, not a side effect of creating the row --
  // a post is a draft until this is explicitly set true, matching how
  // Product.isActive gates a product from the storefront.
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() publish?: boolean;
}

export class UpdateBlogPostDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(400) excerpt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() body?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() coverImageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) author?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() publish?: boolean;
}
