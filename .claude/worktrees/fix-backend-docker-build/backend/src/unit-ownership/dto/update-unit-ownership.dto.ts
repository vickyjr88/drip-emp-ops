import { PartialType } from '@nestjs/swagger';
import { CreateUnitOwnershipDto } from './create-unit-ownership.dto';

export class UpdateUnitOwnershipDto extends PartialType(CreateUnitOwnershipDto) {}
