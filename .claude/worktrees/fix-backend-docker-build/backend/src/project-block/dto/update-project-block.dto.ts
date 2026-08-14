import { PartialType } from '@nestjs/swagger';
import { CreateProjectBlockDto } from './create-project-block.dto';

export class UpdateProjectBlockDto extends PartialType(CreateProjectBlockDto) {}
