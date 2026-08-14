import { Controller, Get, Post, Body, Param, Patch, Delete, Query } from '@nestjs/common';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { FindOneParamsDto } from '../common/dto/find-one-params.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('projects')
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @Permissions(buildPermissionKey('Project', 'create'))
  create(@Body() dto: CreateProjectDto) {
    return this.projectService.create(dto);
  }

  @Get()
  @Permissions(buildPermissionKey('Project', 'read'))
  findAll(@Query() pagination: PaginationDto) {
    return this.projectService.findAll(pagination);
  }

  @Get(':id')
  @Permissions(buildPermissionKey('Project', 'read'))
  findOne(@Param('id') id: string, @Query() query: FindOneParamsDto) {
    return this.projectService.findOne(id, query.include);
  }

  @Patch(':id')
  @Permissions(buildPermissionKey('Project', 'update'))
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('Project', 'delete'))
  remove(@Param('id') id: string) {
    return this.projectService.remove(id);
  }
}
