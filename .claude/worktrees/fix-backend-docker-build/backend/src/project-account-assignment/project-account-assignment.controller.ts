import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { ProjectAccountAssignmentService } from './project-account-assignment.service';
import { UpsertProjectAccountAssignmentDto } from './dto/upsert-project-account-assignment.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('project-account-assignments')
@Controller('projects/:projectId/account-assignments')
export class ProjectAccountAssignmentController {
  constructor(private readonly service: ProjectAccountAssignmentService) {}

  @Get()
  @Permissions(buildPermissionKey('ProjectAccountAssignment', 'read'))
  findForProject(@Param('projectId') projectId: string) {
    return this.service.findForProject(projectId);
  }

  @Post()
  @Permissions(buildPermissionKey('ProjectAccountAssignment', 'create'))
  upsert(@Param('projectId') projectId: string, @Body() dto: UpsertProjectAccountAssignmentDto) {
    return this.service.upsertForProject(projectId, dto);
  }

  @Delete(':id')
  @Permissions(buildPermissionKey('ProjectAccountAssignment', 'delete'))
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
