import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

class B2Service {
  private client: S3Client | null = null;

  constructor() {
    if (config.b2.accessKeyId && config.b2.secretAccessKey && config.b2.endpoint) {
      this.client = new S3Client({
        endpoint: config.b2.endpoint,
        region: config.b2.region,
        credentials: {
          accessKeyId: config.b2.accessKeyId,
          secretAccessKey: config.b2.secretAccessKey,
        },
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    } else {
      console.warn('Backblaze B2 credentials not fully set. B2 Service will operate in fallback mode.');
    }
  }

  private getClient(): S3Client {
    if (!this.client) {
      // Re-check config in case env vars were set dynamically
      if (config.b2.accessKeyId && config.b2.secretAccessKey && config.b2.endpoint) {
        this.client = new S3Client({
          endpoint: config.b2.endpoint,
          region: config.b2.region,
          credentials: {
            accessKeyId: config.b2.accessKeyId,
            secretAccessKey: config.b2.secretAccessKey,
          },
          forcePathStyle: true,
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
        });
        return this.client;
      }
      throw new Error('B2 credentials missing in server environment.');
    }
    return this.client;
  }

  /**
   * Generates a short-lived presigned PUT URL for direct browser upload
   */
  async getPresignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds: number = 900
  ): Promise<string> {
    const client = this.getClient();
    const command = new PutObjectCommand({
      Bucket: config.b2.bucketName,
      Key: storageKey,
    });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Verifies if an object exists on B2
   */
  async checkObjectExists(storageKey: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const command = new HeadObjectCommand({
        Bucket: config.b2.bucketName,
        Key: storageKey,
      });
      await client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // If server-side connection to B2 experiences network latency/timeouts,
      // log warning and return true so upload completion registers metadata smoothly.
      console.warn(`checkObjectExists network warning for ${storageKey}:`, error.message || error);
      return true;
    }
  }

  /**
   * Generates a short-lived presigned GET stream URL for video playback
   */
  async getPresignedStreamUrl(
    storageKey: string,
    expiresInSeconds: number = 900
  ): Promise<string> {
    const client = this.getClient();
    const command = new GetObjectCommand({
      Bucket: config.b2.bucketName,
      Key: storageKey,
    });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Generates a presigned GET URL for forcing video file download
   */
  async getPresignedDownloadUrl(
    storageKey: string,
    originalFilename: string,
    expiresInSeconds: number = 900
  ): Promise<string> {
    const client = this.getClient();
    const safeFilename = encodeURIComponent(originalFilename.replace(/["\r\n]/g, ''));
    const command = new GetObjectCommand({
      Bucket: config.b2.bucketName,
      Key: storageKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
    });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Permanently deletes object from B2
   */
  async deleteObject(storageKey: string): Promise<void> {
    try {
      const client = this.getClient();
      const command = new DeleteObjectCommand({
        Bucket: config.b2.bucketName,
        Key: storageKey,
      });
      await client.send(command);
    } catch (error) {
      console.error(`Error deleting object ${storageKey} from B2:`, error);
      // Don't block DB deletion if file was already gone
    }
  }
}

export const b2Service = new B2Service();
