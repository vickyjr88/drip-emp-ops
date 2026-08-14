import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('ledger')
@Controller()
export class LedgerController {
  constructor(private readonly service: LedgerService) {}

  @Post('journal-entries')
  @Permissions(buildPermissionKey('JournalEntry', 'create'))
  createManualJournal(@Body() dto: CreateJournalEntryDto) {
    return this.service.createManualJournal(dto);
  }

  @Get('journal-entries')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('source') source?: string,
    @Query('sourceId') sourceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      source,
      sourceId,
      from,
      to,
    });
  }

  @Get('journal-entries/:id')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('journal-entries/:id/reverse')
  @Permissions(buildPermissionKey('JournalEntry', 'update'))
  reverse(@Param('id') id: string, @Body('postedBy') postedBy?: string) {
    return this.service.reverseJournal(id, postedBy);
  }

  @Get('reports/general-ledger/:accountId')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  generalLedger(@Param('accountId') accountId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.generalLedger({ accountId, from, to });
  }

  @Get('reports/trial-balance')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  trialBalance(@Query('asOf') asOf?: string) {
    return this.service.trialBalance(asOf);
  }
}
