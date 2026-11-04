import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';
import { OUTREACH_KINDS, type OutreachKind } from '../whatsapp-outreach.kinds';

export class SendOutreachDto {
  @ApiProperty({ enum: OUTREACH_KINDS })
  @IsIn(OUTREACH_KINDS)
  kind!: OutreachKind;

  @ApiProperty({ type: [String], description: 'Customers to message, at most 50 per call.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  customerIds!: string[];

  @ApiPropertyOptional({ description: 'Send even to a customer who already received this message.' })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class OutreachRecipientsQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ enum: OUTREACH_KINDS })
  @IsOptional()
  @IsIn(OUTREACH_KINDS)
  kind?: OutreachKind;
}

export class OutreachUnsentQueryDto {
  @ApiProperty({ enum: OUTREACH_KINDS })
  @IsIn(OUTREACH_KINDS)
  kind!: OutreachKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
