import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

export type StorageAccount = 'account1' | 'account2';

class B2Service {
  private client1: S3Client | null = null;
  private client2: S3Client | null = null;

  private getClientAndBucket(storageAccount: StorageAccount = 'account2'): { client: S3Client; bucketName: string } {
    if (storageAccount === 'account1') {
      const cfg = config.b2.account1;
      if (!this.client1) {
        if (cfg.accessKeyId && cfg.secretAccessKey && cfg.endpoint) {
          this.client1 = new S3Client({
            endpoint: cfg.endpoint,
            region: cfg.region,
            credentials: {
              accessKeyId: cfg.accessKeyId,
              secretAccessKey: cfg.secretAccessKey,
            },
            forcePathStyle: true,
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
          });
        }
      }
      if (this.client1) {
        return { client: this.client1, bucketName: cfg.bucketName };
      }
    }

    // Default: Account 2 (New Uploads)
    if (!this.client2) {
      if (config.b2.accessKeyId && config.b2.secretAccessKey && config.b2.endpoint) {
        this.client2 = new S3Client({
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
      }
    }

    if (this.client2) {
      return { client: this.client2, bucketName: config.b2.bucketName };
    }

    // Fallback if client1 is configured
    if (this.client1) {
      return { client: this.client1, bucketName: config.b2.account1.bucketName };
    }

    throw new Error('B2 credentials missing in server environment.');
  }

  /**
   * Generates a short-lived presigned PUT URL for direct browser upload
   */
  async getPresignedUploadUrl(
    storageKey: string,
    contentType: string,
    expiresInSeconds: number = 900,
    storageAccount: StorageAccount = 'account2'
  ): Promise<string> {
    const { client, bucketName } = this.getClientAndBucket(storageAccount);
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
      ContentType: contentType,
    });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Verifies if an object exists on B2
   */
  async checkObjectExists(
    storageKey: string,
    storageAccount: StorageAccount = 'account2'
  ): Promise<boolean> {
    try {
      const { client, bucketName } = this.getClientAndBucket(storageAccount);
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
      });
      await client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      console.warn(`checkObjectExists network warning for ${storageKey}:`, error.message || error);
      return true;
    }
  }

  /**
   * Generates a short-lived presigned GET stream URL for video playback
   */
  async getPresignedStreamUrl(
    storageKey: string,
    expiresInSeconds: number = 900,
    storageAccount: StorageAccount = 'account2'
  ): Promise<string> {
    const { client, bucketName } = this.getClientAndBucket(storageAccount);
    const command = new GetObjectCommand({
      Bucket: bucketName,
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
    expiresInSeconds: number = 900,
    storageAccount: StorageAccount = 'account2'
  ): Promise<string> {
    const { client, bucketName } = this.getClientAndBucket(storageAccount);
    const safeFilename = encodeURIComponent(originalFilename.replace(/["\r\n]/g, ''));
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
    });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Permanently deletes object from B2
   */
  async deleteObject(
    storageKey: string,
    storageAccount: StorageAccount = 'account2'
  ): Promise<void> {
    try {
      const { client, bucketName } = this.getClientAndBucket(storageAccount);
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
      });
      await client.send(command);
    } catch (error) {
      console.error(`Error deleting object ${storageKey} from B2:`, error);
    }
  }
}

export const b2Service = new B2Service();
