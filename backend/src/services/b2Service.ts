import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutBucketCorsCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

export type StorageAccount = 'account1' | 'account2';

class B2Service {
  private client1: S3Client | null = null;
  private client2: S3Client | null = null;
  private corsConfigured: Record<string, boolean> = {};

  async ensureCors(storageAccount: StorageAccount = 'account2'): Promise<void> {
    if (this.corsConfigured[storageAccount]) return;
    try {
      const { client, bucketName } = this.getClientAndBucket(storageAccount);
      await client.send(
        new PutBucketCorsCommand({
          Bucket: bucketName,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                AllowedOrigins: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        })
      );
      this.corsConfigured[storageAccount] = true;
      console.log(`Successfully configured S3 CORS rules for ${storageAccount} (${bucketName})`);
    } catch (error: any) {
      console.warn(`Could not auto-apply CORS for ${storageAccount}:`, error.message || error);
    }
  }

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
   * Generates a short-lived presigned PUT URL for direct browser upload (small files)
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

  // ── Multipart Upload (for large files with parallel chunks) ──

  /**
   * Initiates an S3 multipart upload and returns the uploadId
   */
  async createMultipartUpload(
    storageKey: string,
    contentType: string,
    storageAccount: StorageAccount = 'account2'
  ): Promise<string> {
    const { client, bucketName } = this.getClientAndBucket(storageAccount);
    const result = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: storageKey,
        ContentType: contentType,
      })
    );
    if (!result.UploadId) throw new Error('Failed to initiate multipart upload');
    return result.UploadId;
  }

  /**
   * Generates presigned URLs for individual part uploads
   */
  async getPartUploadUrls(
    storageKey: string,
    uploadId: string,
    totalParts: number,
    expiresInSeconds: number = 3600,
    storageAccount: StorageAccount = 'account2'
  ): Promise<{ partNumber: number; uploadUrl: string }[]> {
    const { client, bucketName } = this.getClientAndBucket(storageAccount);
    const urls: { partNumber: number; uploadUrl: string }[] = [];

    for (let i = 1; i <= totalParts; i++) {
      const command = new UploadPartCommand({
        Bucket: bucketName,
        Key: storageKey,
        UploadId: uploadId,
        PartNumber: i,
      });
      const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
      urls.push({ partNumber: i, uploadUrl: url });
    }

    return urls;
  }

  /**
   * Completes a multipart upload by assembling all parts
   */
  async completeMultipartUpload(
    storageKey: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[],
    storageAccount: StorageAccount = 'account2'
  ): Promise<void> {
    const { client, bucketName } = this.getClientAndBucket(storageAccount);
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucketName,
        Key: storageKey,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      })
    );
  }

  /**
   * Aborts a multipart upload (cleanup on failure)
   */
  async abortMultipartUpload(
    storageKey: string,
    uploadId: string,
    storageAccount: StorageAccount = 'account2'
  ): Promise<void> {
    try {
      const { client, bucketName } = this.getClientAndBucket(storageAccount);
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucketName,
          Key: storageKey,
          UploadId: uploadId,
        })
      );
    } catch (err) {
      console.warn('Failed to abort multipart upload:', err);
    }
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

  private thumbnailAccountCache: Map<string, StorageAccount> = new Map();

  /**
   * Generates a presigned GET stream URL for video playback
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
   * Generates a presigned thumbnail URL with account verification and dual-account fallback
   * Resolves issues where some thumbnails were saved to account1 and some to account2
   */
  async getPresignedThumbnailUrl(
    storageKey: string,
    preferredAccount?: StorageAccount,
    expiresInSeconds: number = 7200
  ): Promise<string> {
    const primary: StorageAccount = preferredAccount || 'account2';
    const secondary: StorageAccount = primary === 'account2' ? 'account1' : 'account2';

    if (this.thumbnailAccountCache.has(storageKey)) {
      const cachedAccount = this.thumbnailAccountCache.get(storageKey)!;
      return this.getPresignedStreamUrl(storageKey, expiresInSeconds, cachedAccount);
    }

    try {
      const existsOnPrimary = await this.checkObjectExists(storageKey, primary);
      if (existsOnPrimary) {
        this.thumbnailAccountCache.set(storageKey, primary);
        return this.getPresignedStreamUrl(storageKey, expiresInSeconds, primary);
      }
      const existsOnSecondary = await this.checkObjectExists(storageKey, secondary);
      if (existsOnSecondary) {
        this.thumbnailAccountCache.set(storageKey, secondary);
        return this.getPresignedStreamUrl(storageKey, expiresInSeconds, secondary);
      }
    } catch {
      // In case of error, continue with primary
    }

    return this.getPresignedStreamUrl(storageKey, expiresInSeconds, primary);
  }

  /**
   * Generates a presigned GET URL for forcing video file download
   * Uses clean ASCII filename syntax compatible with Backblaze B2 S3 API
   */
  async getPresignedDownloadUrl(
    storageKey: string,
    originalFilename: string,
    expiresInSeconds: number = 900,
    storageAccount: StorageAccount = 'account2'
  ): Promise<string> {
    const { client, bucketName } = this.getClientAndBucket(storageAccount);
    
    // Sanitize filename for strict Backblaze B2 S3 API Content-Disposition compatibility
    // B2 rejects extended value syntax (filename*=UTF-8'') with:
    // "invalid b2-content-disposition: parameter at ... must use valid extended value syntax"
    const cleanFilename = (originalFilename || 'video.mp4')
      .replace(/[\r\n"\\;/]/g, '')
      .replace(/[^\x20-\x7E]/g, '_')
      .trim() || 'video.mp4';

    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
        ResponseContentDisposition: `attachment; filename="${cleanFilename}"`,
      });
      return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    } catch (err) {
      console.warn('Failed to sign with ResponseContentDisposition, falling back to standard presigned stream URL:', err);
      return this.getPresignedStreamUrl(storageKey, expiresInSeconds, storageAccount);
    }
  }

  /**
   * Directly uploads object stream or buffer from server to B2 (bypasses browser CORS)
   */
  async uploadObjectStream(
    storageKey: string,
    body: any,
    contentType: string,
    storageAccount: StorageAccount = 'account2'
  ): Promise<void> {
    const { client, bucketName } = this.getClientAndBucket(storageAccount);
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
      Body: body,
      ContentType: contentType,
    });
    await client.send(command);
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
