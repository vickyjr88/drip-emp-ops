import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateSiteInspectionDto } from './create-site-inspection.dto';

export class UpdateSiteInspectionDto extends PartialType(OmitType(CreateSiteInspectionDto, ['blockId'] as const)) {}
