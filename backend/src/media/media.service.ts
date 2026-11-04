import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Client } from 'minio';
import sharp from 'sharp';
import type { OutputInfo, Sharp } from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { readImageDimensions } from './image-dimensions.util';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

export type CropRect = { x: number; y: number; width: number; height: number };

/** What the library and the media manager show for one image. */
export type MediaAssetView = {
  id: string;
  objectKey: string;
  url: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  uploadedAt: Date;
  /** When the picture last changed. The address stays the same after a crop, so this is what tells a cache to refetch. */
  updatedAt: Date;
  /** True once the image has been cropped: an earlier version exists and can be restored. */
  hasPreviousVersion: boolean;
};

type StoredVersion = {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  replacedAt: string;
  replacedBy: string | null;
};

/** Where earlier versions are kept. Never listed as library images. */
const VERSIONS_PREFIX = 'versions/';
/** How many earlier versions of one image are kept; older ones are deleted. */
const MAX_VERSIONS = 5;

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const MIN_CROP_PX = 16;
/** Refuse to decode anything beyond this many pixels, whatever the file size: a small file can expand enormously. */
const MAX_INPUT_PIXELS = 80_000_000;
const SYNC_EVERY_MS = 30_000;
const ENRICH_PER_CALL = 24;

const contentTypeForName = (name: string) => {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return (
    ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml' } as Record<string, string>)[ext ?? ''] ??
    'application/octet-stream'
  );
};

/** The format a crop is written in: the source's own where sharp can write it, PNG for those it cannot (GIF, SVG). */
function outputFormat(contentType: string): { ext: string; mime: string; encode: (img: Sharp) => Sharp } {
  switch (contentType) {
    case 'image/jpeg':
      return { ext: '.jpg', mime: 'image/jpeg', encode: (i) => i.jpeg({ quality: 92, mozjpeg: true }) };
    case 'image/webp':
      return { ext: '.webp', mime: 'image/webp', encode: (i) => i.webp({ quality: 92 }) };
    case 'image/avif':
      return { ext: '.avif', mime: 'image/avif', encode: (i) => i.avif({ quality: 70 }) };
    default:
      return { ext: '.png', mime: 'image/png', encode: (i) => i.png() };
  }
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private lastSync = 0;
  private syncing: Promise<void> | null = null;
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;
  private readonly client: Client;
  private bucketReady = false;

  constructor(private readonly prisma: PrismaService) {
    const databaseUrl = process.env.DATABASE_URL || '';
    const useDockerNetwork = databaseUrl.includes('@db:');
    const endPoint = process.env.MINIO_ENDPOINT || (useDockerNetwork ? 'minio' : 'localhost');
    const port = Number(process.env.MINIO_PORT || (useDockerNetwork ? 9000 : 19000));

    this.bucketName = process.env.MINIO_BUCKET || 'project-media';
    this.publicBaseUrl =
      process.env.MEDIA_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:3100';

    this.client = new Client({
      endPoint,
      port,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
      secretKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin123',
    });
  }

  private urlFor(objectKey: string) {
    return `${this.publicBaseUrl.replace(/\/$/, '')}/media/${objectKey}`;
  }

  async uploadProjectAsset(file: UploadedFile, options: { purpose?: 'LIBRARY' | 'DOCUMENT'; uploadedBy?: string } = {}) {
    await this.ensureBucket();

    const objectKey = `${randomUUID()}${this.getFileExtension(file.originalname)}`;

    await this.client.putObject(this.bucketName, objectKey, file.buffer, file.buffer.length, {
      'Content-Type': file.mimetype,
    });

    const dimensions = readImageDimensions(file.buffer);
    const fileName = (file.originalname || objectKey).slice(0, 200);

    // A failure to record must not fail the upload: the object is stored and the sync below picks it up later.
    const asset = await this.prisma.mediaAsset
      .create({
        data: {
          objectKey,
          fileName,
          contentType: file.mimetype,
          sizeBytes: file.buffer.length,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
          purpose: options.purpose ?? 'LIBRARY',
          uploadedBy: options.uploadedBy ?? null,
        },
      })
      .catch((error) => {
        this.logger.warn(`Could not record upload ${objectKey}: ${error instanceof Error ? error.message : error}`);
        return null;
      });

    return {
      id: asset?.id ?? null,
      objectKey,
      url: this.urlFor(objectKey),
      contentType: file.mimetype,
      fileName: file.originalname,
      // Size metadata for the CMS: byte length always, pixel dimensions when the
      // format is one we can read (null for PDFs, SVGs and anything exotic).
      sizeBytes: file.buffer.length,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    };
  }

  /**
   * Images already in the library, newest first, for the media manager and every "choose an existing image" picker.
   *
   * The list comes from the MediaAsset table. Objects uploaded before that table existed are added to it from the
   * bucket (see syncFromBucket), so nothing already in use goes missing from the library. Receipts and scans uploaded
   * as DOCUMENT are not listed.
   */
  async listLibrary(params: { limit?: number; cursor?: string; search?: string } = {}) {
    await this.syncFromBucket();

    const limit = Math.min(Math.max(params.limit ?? 60, 1), 200);
    const where: Prisma.MediaAssetWhereInput = {
      purpose: 'LIBRARY',
      contentType: { startsWith: 'image/' },
      ...(params.search?.trim() ? { fileName: { contains: params.search.trim(), mode: 'insensitive' } } : {}),
    };

    const rows = await this.prisma.mediaAsset.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const total = await this.prisma.mediaAsset.count({ where });

    const page = rows.slice(0, limit);
    const items = page.map((row) => this.view(row));
    void this.fillMissingDimensions(page.filter((row) => row.width === null || row.height === null));

    return { items, nextCursor: rows.length > limit ? page[page.length - 1].id : null, total };
  }

  private versionsOf(row: { versions?: unknown }): StoredVersion[] {
    return Array.isArray(row.versions) ? (row.versions as StoredVersion[]) : [];
  }

  private view(row: any): MediaAssetView {
    return {
      id: row.id,
      objectKey: row.objectKey,
      url: this.urlFor(row.objectKey),
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      uploadedAt: row.createdAt,
      updatedAt: row.updatedAt ?? row.createdAt,
      hasPreviousVersion: this.versionsOf(row).length > 0,
    };
  }

  /**
   * Adds images that are in the bucket but not in the table: everything uploaded before the library had a table.
   * Their name is the object key (the original file name was never kept) and their date the object's own.
   * Cheap when nothing is new, and throttled, so opening the picker repeatedly does not keep listing the bucket.
   */
  private async syncFromBucket() {
    if (Date.now() - this.lastSync < SYNC_EVERY_MS) return;
    if (this.syncing) return this.syncing;

    this.syncing = (async () => {
      try {
        await this.ensureBucket();
        const objects: Array<{ name: string; size: number; lastModified: Date }> = [];
        await new Promise<void>((resolve, reject) => {
          const stream = this.client.listObjectsV2(this.bucketName, '', true);
          stream.on('data', (item: any) => {
            if (item.name && !item.name.startsWith(VERSIONS_PREFIX) && IMAGE_EXTENSIONS.test(item.name)) {
              objects.push({ name: item.name, size: item.size, lastModified: item.lastModified });
            }
          });
          stream.on('error', reject);
          stream.on('end', resolve);
        });

        const known = new Set((await this.prisma.mediaAsset.findMany({ select: { objectKey: true } })).map((r) => r.objectKey));
        const missing = objects.filter((object) => !known.has(object.name));
        if (missing.length) {
          await this.prisma.mediaAsset.createMany({
            data: missing.map((object) => ({
              objectKey: object.name,
              fileName: object.name,
              contentType: contentTypeForName(object.name),
              sizeBytes: object.size,
              createdAt: object.lastModified,
            })),
            skipDuplicates: true,
          });
          this.logger.log(`Media library: added ${missing.length} existing image(s) from the bucket`);
        }
        this.lastSync = Date.now();
      } catch (error) {
        // The table still serves what it has; try again on a later call.
        this.logger.warn(`Media library sync failed: ${error instanceof Error ? error.message : error}`);
      } finally {
        this.syncing = null;
      }
    })();
    return this.syncing;
  }

  /** Reads dimensions for images listed without them (the backfilled ones), so the next listing has them. Best effort. */
  private async fillMissingDimensions(rows: Array<{ id: string; objectKey: string }>) {
    for (const row of rows.slice(0, ENRICH_PER_CALL)) {
      try {
        const dimensions = readImageDimensions(await this.readHead(row.objectKey, 65_536));
        if (dimensions) await this.prisma.mediaAsset.update({ where: { id: row.id }, data: dimensions });
      } catch {
        // Not readable (SVG, damaged): the library simply shows no dimensions for it.
      }
    }
  }

  private async readWhole(objectKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucketName, objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  /**
   * Crops an image IN PLACE: the file under the same address is overwritten with the cropped picture, so the library
   * keeps one image and everything already using it shows the cropped version. Nothing breaks and nothing needs
   * re-linking. The picture as it was is kept as a previous version (see restoreAsset), not as a library image.
   *
   * `rect` is in the pixels of the picture as it is displayed (after any camera-orientation rotation), which is what a
   * browser reports as its natural size. `{ square: true }` instead takes the largest centred square.
   */
  async cropAsset(
    assetId: string,
    selection: CropRect | { square: true },
    changedBy?: string,
  ): Promise<MediaAssetView> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!row || !row.contentType.startsWith('image/')) throw new NotFoundException('Image not found');

    await this.ensureBucket();
    let original: Buffer;
    try {
      original = await this.readWhole(row.objectKey);
    } catch {
      throw new NotFoundException('The image file is missing from storage');
    }

    let oriented: { data: Buffer; info: OutputInfo };
    try {
      oriented = await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toBuffer({ resolveWithObject: true });
    } catch {
      throw new BadRequestException('This image cannot be cropped (it could not be read).');
    }
    const { width: fullWidth, height: fullHeight } = oriented.info;

    let left: number;
    let top: number;
    let width: number;
    let height: number;
    if ('square' in selection) {
      width = height = Math.min(fullWidth, fullHeight);
      left = Math.floor((fullWidth - width) / 2);
      top = Math.floor((fullHeight - height) / 2);
    } else {
      left = Math.round(selection.x);
      top = Math.round(selection.y);
      width = Math.round(selection.width);
      height = Math.round(selection.height);
    }
    if (![left, top, width, height].every(Number.isFinite) || left < 0 || top < 0 || width < MIN_CROP_PX || height < MIN_CROP_PX) {
      throw new BadRequestException(`The crop must be at least ${MIN_CROP_PX} x ${MIN_CROP_PX} pixels and inside the image.`);
    }
    // A pixel of tolerance either way: the crop box is drawn on a scaled copy and rounds.
    if (left >= fullWidth || top >= fullHeight || left + width > fullWidth + 1 || top + height > fullHeight + 1) {
      throw new BadRequestException('The crop falls outside the image.');
    }
    const right = Math.min(left + width, fullWidth);
    const bottom = Math.min(top + height, fullHeight);
    if (left === 0 && top === 0 && right === fullWidth && bottom === fullHeight) {
      throw new BadRequestException('That crop is the whole image: there is nothing to crop.');
    }

    const format = outputFormat(row.contentType);
    const cropped = await format
      .encode(sharp(oriented.data).extract({ left, top, width: right - left, height: bottom - top }))
      .toBuffer({ resolveWithObject: true });

    // Keep the picture as it was, then overwrite. The copy goes first: if anything after it fails, nothing is lost.
    const backupKey = `${VERSIONS_PREFIX}${randomUUID()}${this.getFileExtension(row.objectKey)}`;
    await this.client.putObject(this.bucketName, backupKey, original, original.length, { 'Content-Type': row.contentType });
    await this.client.putObject(this.bucketName, row.objectKey, cropped.data, cropped.data.length, { 'Content-Type': format.mime });

    const kept: StoredVersion[] = [
      ...this.versionsOf(row),
      {
        objectKey: backupKey,
        contentType: row.contentType,
        sizeBytes: original.length,
        width: row.width ?? fullWidth,
        height: row.height ?? fullHeight,
        replacedAt: new Date().toISOString(),
        replacedBy: changedBy ?? null,
      },
    ];
    const dropped = kept.splice(0, Math.max(0, kept.length - MAX_VERSIONS));

    let updated;
    try {
      updated = await this.prisma.mediaAsset.update({
        where: { id: row.id },
        data: {
          contentType: format.mime,
          sizeBytes: cropped.data.length,
          width: cropped.info.width,
          height: cropped.info.height,
          versions: kept as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // The file is already overwritten but the record could not say so: put the picture back rather than leave them out of step.
      await this.client.putObject(this.bucketName, row.objectKey, original, original.length, { 'Content-Type': row.contentType }).catch(() => undefined);
      throw error;
    }
    await this.removeObjects(dropped.map((version) => version.objectKey));
    return this.view(updated);
  }

  /** Undoes the most recent crop: puts the previous version back under the same address. */
  async restoreAsset(assetId: string): Promise<MediaAssetView> {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!row) throw new NotFoundException('Image not found');
    const versions = this.versionsOf(row);
    const previous = versions[versions.length - 1];
    if (!previous) throw new BadRequestException('This image has not been cropped, so there is no earlier version to restore.');

    await this.ensureBucket();
    let bytes: Buffer;
    try {
      bytes = await this.readWhole(previous.objectKey);
    } catch {
      throw new NotFoundException('The earlier version is missing from storage');
    }
    await this.client.putObject(this.bucketName, row.objectKey, bytes, bytes.length, { 'Content-Type': previous.contentType });
    const updated = await this.prisma.mediaAsset.update({
      where: { id: row.id },
      data: {
        contentType: previous.contentType,
        sizeBytes: previous.sizeBytes,
        width: previous.width,
        height: previous.height,
        versions: versions.slice(0, -1) as unknown as Prisma.InputJsonValue,
      },
    });
    await this.removeObjects([previous.objectKey]);
    return this.view(updated);
  }

  private async removeObjects(keys: string[]) {
    for (const key of keys) {
      await this.client.removeObject(this.bucketName, key).catch((error: unknown) => {
        this.logger.warn(`Could not delete ${key}: ${error instanceof Error ? error.message : error}`);
      });
    }
  }

  /** Size metadata for an already-stored object, used when re-opening the CMS. */
  async statAsset(objectKey: string) {
    await this.ensureBucket();

    try {
      const stat = await this.client.statObject(this.bucketName, objectKey);
      const contentType = stat.metaData['content-type'] || 'application/octet-stream';

      // Only the header is needed for dimensions, but MinIO streams the object,
      // so read just enough bytes to cover the largest header we parse.
      const dimensions = contentType.startsWith('image/')
        ? readImageDimensions(await this.readHead(objectKey, 65_536))
        : null;

      return {
        objectKey,
        url: `${this.publicBaseUrl.replace(/\/$/, '')}/media/${objectKey}`,
        contentType,
        sizeBytes: stat.size,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      };
    } catch {
      throw new NotFoundException('Media asset not found');
    }
  }

  private async readHead(objectKey: string, byteCount: number): Promise<Buffer> {
    const stream = await this.client.getPartialObject(this.bucketName, objectKey, 0, byteCount);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  /**
   * The stored file, for the public image route. `ifNoneMatch` is the validator the browser (or a CDN) already holds:
   * when it still matches, the file is not read at all and the caller answers "not modified".
   */
  async getObject(objectKey: string, ifNoneMatch?: string) {
    await this.ensureBucket();

    let stat: any;
    try {
      stat = await this.client.statObject(this.bucketName, objectKey);
    } catch {
      throw new NotFoundException('Media asset not found');
    }
    const etag: string | undefined = stat.etag ? String(stat.etag).replace(/"/g, '') : undefined;
    const lastModified: Date | undefined = stat.lastModified;
    const contentType = stat.metaData?.['content-type'] || 'application/octet-stream';

    if (etag && ifNoneMatch && ifNoneMatch.split(',').some((candidate) => candidate.trim().replace(/^W\//, '').replace(/"/g, '') === etag)) {
      return { notModified: true as const, etag, lastModified, contentType, fileName: objectKey };
    }

    try {
      const stream = await this.client.getObject(this.bucketName, objectKey);
      return { notModified: false as const, stream, etag, lastModified, contentType, fileName: objectKey };
    } catch {
      throw new NotFoundException('Media asset not found');
    }
  }

  private async ensureBucket() {
    if (this.bucketReady) {
      return;
    }

    const exists = await this.client.bucketExists(this.bucketName);
    if (!exists) {
      await this.client.makeBucket(this.bucketName, 'us-east-1');
    }

    this.bucketReady = true;
  }

  private getFileExtension(fileName: string) {
    const index = fileName.lastIndexOf('.');
    return index >= 0 ? fileName.slice(index) : '';
  }
}