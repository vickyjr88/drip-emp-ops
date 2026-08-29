import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { PriceTier } from '@prisma/client';

export class CreateResellerDto {
  @ApiProperty({ example: 'MNJ' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  /**
   * The trading name, when there is one. Deliberately optional and distinct
   * from `contactName`: a reseller converted from an ordinary customer has no
   * business name to give, and must never have one invented for them just to
   * fill this field -- that name would then permanently mask their real
   * first/last name everywhere a display name is shown (customerDisplayName
   * prefers businessName when set). Required only when `contactName` is also
   * absent, so a record is never created with no name to show at all.
   */
  @ApiPropertyOptional({ example: 'Mama Njeri Shoes' })
  @ValidateIf((dto) => !dto.contactName)
  @IsString()
  @IsNotEmpty()
  businessName?: string;

  @ApiPropertyOptional({ description: "The person's own name, when the account isn't a registered business." })
  @ValidateIf((dto) => !dto.businessName)
  @IsString()
  @IsNotEmpty()
  contactName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiPropertyOptional({ enum: PriceTier, default: 'RESELLER' })
  @IsOptional()
  @IsEnum(PriceTier)
  priceTier?: PriceTier;

  @ApiPropertyOptional({ description: 'Most stock value they may hold at once. 0 means no limit.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * Unlike create, an update never requires either name field: a PATCH that
 * only changes `isActive` or `creditLimit` must not be forced to also
 * resend a name just to satisfy create's "at least one name" rule. Both
 * override the inherited @ValidateIf-gated @IsNotEmpty with a plain
 * @IsOptional, so either can be omitted, sent blank to clear, or sent with
 * a value to change -- reseller.service.ts's own `!== undefined` checks are
 * what decide whether an omitted field is left untouched.
 */
export class UpdateResellerDto extends CreateResellerDto {
  @ApiPropertyOptional({ example: 'Mama Njeri Shoes' })
  @IsOptional()
  @IsString()
  declare businessName?: string;

  @ApiPropertyOptional({ description: "The person's own name, when the account isn't a registered business." })
  @IsOptional()
  @IsString()
  declare contactName?: string;
}
