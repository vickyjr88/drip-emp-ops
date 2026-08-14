import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Client } from 'minio';

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

    return {
      objectKey,
      url: `${this.publicBaseUrl.replace(/\/$/, '')}/media/${objectKey}`,
      contentType: file.mimetype,
      fileName: file.originalname,
    };
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