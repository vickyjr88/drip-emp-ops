import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';
import { CREDENTIAL_GROUPS } from './credential-catalog';
import { testGroup } from './credential-tester';
import { CredentialsService } from './credentials.service';

export class SaveCredentialsDto {
  /**
   * { NAME: "new value" }. A name left out, or a blank value, is left as it is.
   *
   * Called `credentials` on purpose: the audit log blanks everything under a key with that word in it, so even a value typed into the wrong box
   * (a token pasted into an id field) is never written to the log. Redacting by each field's own name would miss that.
   */
  @IsObject()
  credentials!: Record<string, unknown>;
}

/**
 * Portal > Settings: the integration ids and secrets. Reading shows what is set and the last four characters of a secret, never a secret itself;
 * saving encrypts. The audit log records which credentials changed and who changed them, with every value redacted.
 */
@ApiBearerAuth()
@ApiTags('credentials')
@Controller('credentials')
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get()
  @Permissions(buildPermissionKey('Credential', 'read'))
  list() {
    return this.credentials.describe();
  }

  @Put()
  @Permissions(buildPermissionKey('Credential', 'update'))
  async save(@Body() dto: SaveCredentialsDto, @Req() request: any) {
    const changed = await this.credentials.set(dto.credentials, request?.user?.email ?? 'unknown');
    // `id` is what the audit log records as the thing that was changed: here, which credentials (their names, never their values).
    return { id: changed.join(', '), changed, ...this.credentials.describe() };
  }

  @Delete(':key')
  @Permissions(buildPermissionKey('Credential', 'update'))
  async clear(@Param('key') key: string, @Req() request: any) {
    await this.credentials.clear(key, request?.user?.email ?? 'unknown');
    return this.credentials.describe();
  }

  /** One harmless read against the platform with the saved values. */
  @Post('test/:group')
  @Permissions(buildPermissionKey('Credential', 'update'))
  test(@Param('group') group: string) {
    if (!CREDENTIAL_GROUPS.some((g) => g.id === group && g.testable)) throw new BadRequestException('There is no check for that group.');
    return testGroup(group, this.credentials);
  }
}
