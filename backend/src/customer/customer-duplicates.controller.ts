import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { CustomerMergeService } from './customer-merge.service';

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 200) : []);
const actorOf = (req: any) => String(req.user?.email ?? req.user?.sub ?? 'staff');

/** A separate path from /customers so "duplicates" is never read as a customer id. Reading needs customer.read; merging deletes records, so it needs customer.delete. */
@ApiBearerAuth()
@ApiTags('customers')
@Controller('customer-duplicates')
export class CustomerDuplicatesController {
  constructor(private readonly merges: CustomerMergeService) {}

  @Get()
  @Permissions(buildPermissionKey('Customer', 'read'))
  groups() {
    return this.merges.groups();
  }

  @Post('preview')
  @Permissions(buildPermissionKey('Customer', 'read'))
  preview(@Body() body: { keepId?: string; mergeIds?: unknown }) {
    return this.merges.preview(String(body?.keepId ?? ''), ids(body?.mergeIds));
  }

  @Post('merge')
  @Permissions(buildPermissionKey('Customer', 'delete'))
  merge(@Body() body: { keepId?: string; mergeIds?: unknown }, @Req() req: any) {
    return this.merges.merge(String(body?.keepId ?? ''), ids(body?.mergeIds), actorOf(req));
  }

  @Post('merge-safe')
  @Permissions(buildPermissionKey('Customer', 'delete'))
  mergeSafe(@Body() body: { keepIds?: unknown }, @Req() req: any) {
    return this.merges.mergeSafe(ids(body?.keepIds), actorOf(req));
  }
}
