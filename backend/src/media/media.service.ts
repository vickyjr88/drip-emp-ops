import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Client } from 'minio';
import { readImageDimensions } from './image-dimensions.util';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

@Injectable()
export class MediaService {
  private readonly bucketName: string;
  private readonly publicBaseUrl: string;
  private readonly client: Client;
  private bucketReady = false;

  constructor() {
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

  async uploadProjectAsset(file: UploadedFile) {
    await this.ensureBucket();

    const objectKey = `${randomUUID()}${this.getFileExtension(file.originalname)}`;

    await this.client.putObject(this.bucketName, objectKey, file.buffer, file.buffer.length, {
      'Content-Type': file.mimetype,
    });

    const dimensions = readImageDimensions(file.buffer);

    return {
      objectKey,
      url: `${this.publicBaseUrl.replace(/\/$/, '')}/media/${objectKey}`,
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
   * Images already in the bucket, newest first.
   *
   * Backs the "choose an existing image" picker, so the same photo can be
   * reused across a project, its blocks and its units without being uploaded
   * again. Only images are returned -- the bucket also holds invoice and
   * receipt attachments, and offering a PDF as a featured image would be a
   * mistake the picker should not allow.
   *
   * Object keys are random UUIDs with no stored filename, so there is nothing
   * useful to search on; the picker pages through by recency instead, which is
   * also the order that makes a just-uploaded image easy to find.
   */
  async listImages(limit = 60, cursor?: string) {
    await this.ensureBucket();

    const objects: Array<{ name: string; size: number; lastModified: Date }> = [];
    await new Promise<void>((resolve, reject) => {
      const stream = this.client.listObjectsV2(this.bucketName, '', true);
      stream.on('data', (item: any) => {
        if (item.name) {
          objects.push({ name: item.name, size: item.size, lastModified: item.lastModified });
        }
      });
      stream.on('error', reject);
      stream.on('end', resolve);
    });

    const images = objects
      .filter((object) => /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(object.name))
      .sort((a, b) => Number(b.lastModified) - Number(a.lastModified));

    // Keyset pagination on the object key: an offset would shift under the
    // caller as new uploads land at the top of the list.
    const start = cursor ? images.findIndex((image) => image.name === cursor) + 1 : 0;
    const page = images.slice(start, start + limit);

    return {
      items: page.map((image) => ({
        objectKey: image.name,
        url: `${this.publicBaseUrl.replace(/\/$/, '')}/media/${image.name}`,
        sizeBytes: image.size,
        uploadedAt: image.lastModified,
      })),
      nextCursor: start + limit < images.length ? page[page.length - 1]?.name ?? null : null,
      total: images.length,
    };
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

  async getObject(objectKey: string) {
    await this.ensureBucket();

    try {
      const [stat, stream] = await Promise.all([
        this.client.statObject(this.bucketName, objectKey),
        this.client.getObject(this.bucketName, objectKey),
      ]);

      return {
        stream,
        contentType: stat.metaData['content-type'] || 'application/octet-stream',
        fileName: objectKey,
      };
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