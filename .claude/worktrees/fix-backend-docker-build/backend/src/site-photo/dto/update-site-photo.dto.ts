import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateSitePhotoDto } from './create-site-photo.dto';

export class UpdateSitePhotoDto extends PartialType(OmitType(CreateSitePhotoDto, ['blockId'] as const)) {}
