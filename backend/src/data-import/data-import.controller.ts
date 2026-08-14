import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DataImportService } from './data-import.service';
import { DataImportDto } from './dto/data-import.dto';
import { findDefinition } from './import-definitions';
import { buildPermissionKey } from '../auth/permissions/permission.util';

/**
 * Import endpoints are gated on the permission for the entity being imported --
 * importing customers needs customer.create -- rather than a single blanket
 * import permission, which would otherwise let anyone who can import one thing
 * create records of every kind.
 */
@ApiBearerAuth()
@ApiTags('data-imports')
@Controller('data-imports')
export class DataImportController {
  constructor(private readonly service: DataImportService) {}

  private assertCanImport(request: any, key: string) {
    const definition = findDefinition(key);
    if (!definition) return;
    const required = buildPermissionKey(definition.permissionSubject, 'create');
    const held: string[] = request?.user?.permissions ?? [];
    if (!held.includes(required)) {
      throw new ForbiddenException(`Missing permissions: ${required}`);
    }
  }

  @Get()
  definitions() {
    return this.service.definitions();
  }

  @Get(':key/template')
  template(@Param('key') key: string, @Req() request: any, @Res() response: Response) {
    this.assertCanImport(request, key);
    const csv = this.service.buildTemplate(key);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${key}-import-template.csv"`);
    response.send(csv);
  }

  @Post(':key/validate')
  validate(@Param('key') key: string, @Body() dto: DataImportDto, @Req() request: any) {
    this.assertCanImport(request, key);
    return this.service.validate(key, dto.rows as any);
  }

  @Post(':key')
  commit(@Param('key') key: string, @Body() dto: DataImportDto, @Req() request: any) {
    this.assertCanImport(request, key);
    return this.service.commit(key, dto.rows as any);
  }
}
