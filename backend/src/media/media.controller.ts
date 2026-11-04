import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../auth/decorators/public.decorator';
import { CropImageDto, RestoreImageDto } from './dto/crop-image.dto';
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
  async upload(@UploadedFile() file?: any, @Query('purpose') purpose?: string, @Req() request?: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // "document" is for receipts and scans attached to a record: stored, but kept out of the image library.
    return this.mediaService.uploadProjectAsset(file, {
      purpose: purpose === 'document' ? 'DOCUMENT' : 'LIBRARY',
      uploadedBy: request?.user?.email,
    });
  }

  /**
   * Crops an image in place: the picture under the same address is replaced by the cropped one, so everywhere it is
   * used shows the cropped version and nothing breaks. The previous version is kept and can be restored.
   */
  @ApiBearerAuth()
  @Post('crop')
  async crop(@Body() dto: CropImageDto, @Req() request?: any) {
    const selection = dto.square
      ? ({ square: true } as const)
      : { x: dto.x ?? NaN, y: dto.y ?? NaN, width: dto.width ?? NaN, height: dto.height ?? NaN };
    return this.mediaService.cropAsset(dto.assetId, selection, request?.user?.email);
  }

  /** Undoes the most recent crop of an image. */
  @ApiBearerAuth()
  @Post('restore')
  async restore(@Body() dto: RestoreImageDto) {
    return this.mediaService.restoreAsset(dto.assetId);
  }

  /**
   * Images already uploaded, for the "choose an existing image" picker.
   *
   * Declared before the catch-all `:objectKey` route for the same reason the
   * stat route is: otherwise Nest matches "library" as an object key.
   */
  @ApiBearerAuth()
  @Get('library')
  async library(@Query('limit') limit?: string, @Query('cursor') cursor?: string, @Query('search') search?: string) {
    const parsed = Number(limit);
    return this.mediaService.listLibrary({
      limit: Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 60,
      cursor: cursor || undefined,
      search: search || undefined,
    });
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
  async getObject(@Param('objectKey') objectKey: string, @Req() request: any, @Res({ passthrough: true }) response: any) {
    const asset = await this.mediaService.getObject(objectKey, request?.headers?.['if-none-match']);

    // An image keeps its address when it is cropped, so caches must check back instead of holding the old picture for
    // hours. `no-cache` still lets them keep a copy; the ETag turns the check into a cheap "not modified".
    response.setHeader('Cache-Control', 'no-cache');
    if (asset.etag) response.setHeader('ETag', `"${asset.etag}"`);
    if (asset.lastModified) response.setHeader('Last-Modified', new Date(asset.lastModified).toUTCString());
    if (asset.notModified) {
      response.status(304);
      return;
    }

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