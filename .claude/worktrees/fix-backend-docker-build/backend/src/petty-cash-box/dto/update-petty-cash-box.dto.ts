import { PartialType } from '@nestjs/swagger';
import { CreatePettyCashBoxDto } from './create-petty-cash-box.dto';

export class UpdatePettyCashBoxDto extends PartialType(CreatePettyCashBoxDto) {}
