import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LedgerService } from './ledger.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { RecategoriseJournalDto } from './dto/recategorise-journal.dto';
import { ExpenseImportDto } from './dto/expense-import.dto';
import { ExpenseImportService } from './expense-import.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { buildPermissionKey } from '../auth/permissions/permission.util';

@ApiBearerAuth()
@ApiTags('ledger')
@Controller()
export class LedgerController {
  constructor(
    private readonly service: LedgerService,
    private readonly importer: ExpenseImportService,
  ) {}

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
    @Query('search') search?: string,
    @Query('storeId') storeId?: string,
    @Query('accountId') accountId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
    @Query('untaggedOnly') untaggedOnly?: string,
  ) {
    return this.service.findAll({
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      source,
      sourceId,
      from,
      to,
      search: search?.trim() || undefined,
      storeId,
      accountId,
      supplierId,
      status,
      minAmount: minAmount ? Number(minAmount) : undefined,
      maxAmount: maxAmount ? Number(maxAmount) : undefined,
      untaggedOnly: untaggedOnly === 'true',
    });
  }

  @Get('journal-entries/:id')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /**
   * The blank template, built from live accounts and projects so the codes it
   * lists cannot drift from the ones the importer will accept.
   */
  @Get('expense-imports/template')
  @Permissions(buildPermissionKey('JournalEntry', 'create'))
  async template(@Res() response: Response) {
    const csv = await this.importer.buildTemplate();
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="project-expense-template.csv"');
    response.send(csv);
  }

  @Post('expense-imports/validate')
  @Permissions(buildPermissionKey('JournalEntry', 'create'))
  validateImport(@Body() dto: ExpenseImportDto) {
    return this.importer.validate(dto.rows, dto.creditAccountCode);
  }

  @Post('expense-imports')
  @Permissions(buildPermissionKey('JournalEntry', 'create'))
  commitImport(@Body() dto: ExpenseImportDto, @Req() request: any) {
    return this.importer.commit(dto.rows, {
      creditAccountCode: dto.creditAccountCode,
      batchRef: dto.batchRef,
      postedBy: request?.user?.email,
    });
  }

  @Get('expense-imports/batches')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  listBatches() {
    return this.importer.listBatches();
  }

  @Delete('expense-imports/batches/:batchRef')
  @Permissions(buildPermissionKey('JournalEntry', 'delete'))
  deleteBatch(@Param('batchRef') batchRef: string) {
    return this.service.deleteImportBatch(batchRef);
  }

  @Delete('journal-entries/:id')
  @Permissions(buildPermissionKey('JournalEntry', 'delete'))
  deleteJournal(@Param('id') id: string) {
    return this.service.deleteJournal(id);
  }

  @Patch('journal-entries/:id/recategorise')
  @Permissions(buildPermissionKey('JournalEntry', 'update'))
  recategorise(@Param('id') id: string, @Body() dto: RecategoriseJournalDto) {
    return this.service.recategoriseJournal(id, dto);
  }

  @Post('journal-entries/:id/reverse')
  @Permissions(buildPermissionKey('JournalEntry', 'update'))
  reverse(@Param('id') id: string, @Body('postedBy') postedBy?: string) {
    return this.service.reverseJournal(id, postedBy);
  }

  @Get('reports/general-ledger/:accountId')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  generalLedger(
    @Param('accountId') accountId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.service.generalLedger({ accountId, from, to, storeId });
  }

  @Get('reports/trial-balance')
  @Permissions(buildPermissionKey('JournalEntry', 'read'))
  trialBalance(@Query('asOf') asOf?: string, @Query('storeId') storeId?: string) {
    return this.service.trialBalance(asOf, storeId);
  }
}
