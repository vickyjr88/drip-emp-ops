import {
  BadRequestException,
  Controller,
  Logger,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../auth/decorators/public.decorator';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaService: MediaService) {}

  @ApiBearerAuth()
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file?: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.mediaService.uploadProjectAsset(file);
  }

  /**
   * Images already uploaded, for the "choose an existing image" picker.
   *
   * Declared before the catch-all `:objectKey` route for the same reason the
   * stat route is: otherwise Nest matches "library" as an object key.
   */
  @ApiBearerAuth()
  @Get('library')
  async library(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    const parsed = Number(limit);
    return this.mediaService.listImages(
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 60,
      cursor || undefined,
    );
  }

  /**
   * Declared before the catch-all `:objectKey` route below, otherwise Nest
   * matches "stat" as an object key and this never runs.
   */
  @ApiBearerAuth()
  @Get('stat/:objectKey')
  async statObject(@Param('objectKey') objectKey: string) {
    return this.mediaService.statAsset(objectKey);
  }

  @Public()
  @Get(':objectKey')
  async getObject(@Param('objectKey') objectKey: string) {
    const asset = await this.mediaService.getObject(objectKey);

    const file = new StreamableFile(asset.stream, {
      type: asset.contentType,
      disposition: `inline; filename="${asset.fileName}"`,
    });

    // A browser that navigates away, or swaps an <img> src, drops the
    // connection mid-download. Nest logs that as ERROR "aborted" with a stack
    // trace, which is noise -- nothing failed, the reader just left. Real
    // stream failures are still logged; only the client-disconnect case is
    // quietened.
    file.setErrorHandler((error, response) => {
      const clientLeft =
        (error as NodeJS.ErrnoException)?.code === 'ECONNRESET' ||
        error?.message === 'aborted';
      if (!clientLeft) {
        this.logger.error(`Streaming ${objectKey} failed: ${error?.message}`);
      }
      if (!response.destroyed) response.end();
    });

    return file;
  }
}