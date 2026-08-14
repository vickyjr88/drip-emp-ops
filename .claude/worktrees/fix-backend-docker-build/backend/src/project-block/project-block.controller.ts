import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { ProjectBlockService } from './project-block.service';
import { CreateProjectBlockDto } from './dto/create-project-block.dto';
import { UpdateProjectBlockDto } from './dto/update-project-block.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('project-blocks')
@Controller('project-block')
export class ProjectBlockController {
  constructor(private readonly service: ProjectBlockService) {}

  @Post()
  @Permissions(buildPermissionKey('ProjectBlock', 'create'))
  create(@Body() dto: CreateProjectBlockDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('ProjectBlock', 'read'))
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Permissions(buildPermissionKey('ProjectBlock', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('ProjectBlock', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateProjectBlockDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('ProjectBlock', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
