import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface B2AccountConfig {
  endpoint: string;
  region: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function getAccountConfig(account: 'account1' | 'account2' = 'account2'): B2AccountConfig | null {
  if (account === 'account1') {
    const endpoint = process.env.B2_ENDPOINT_1 || process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com';
    const region = process.env.B2_REGION_1 || process.env.B2_REGION || 'us-east-005';
    const bucketName = process.env.B2_BUCKET_NAME_1 || process.env.B2_BUCKET_NAME || 'videoplayerprivate';
    const accessKeyId = process.env.B2_ACCESS_KEY_ID_1 || process.env.B2_ACCESS_KEY_ID || '0053cfd7aa7a1a50000000001';
    const secretAccessKey = process.env.B2_SECRET_ACCESS_KEY_1 || process.env.B2_SECRET_ACCESS_KEY || 'K005PvY2c8L9wpe9stpBJmlw7VQXJqA';

    if (accessKeyId && secretAccessKey) {
      return { endpoint, region, bucketName, accessKeyId, secretAccessKey };
    }
  }

  // Default: account 2
  const endpoint = process.env.B2_ENDPOINT_2 || process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com';
  const region = process.env.B2_REGION_2 || process.env.B2_REGION || 'us-east-005';
  const bucketName = process.env.B2_BUCKET_NAME_2 || process.env.B2_BUCKET_NAME || 'videoplayer122';
  const accessKeyId = process.env.B2_ACCESS_KEY_ID_2 || process.env.B2_ACCESS_KEY_ID || '005353c1870b0160000000002';
  const secretAccessKey = process.env.B2_SECRET_ACCESS_KEY_2 || process.env.B2_SECRET_ACCESS_KEY || 'K005HYWVzEBc9jrsg+yzervtJHBKIEY';

  if (accessKeyId && secretAccessKey) {
    return { endpoint, region, bucketName, accessKeyId, secretAccessKey };
  }

  return null;
}

const s3Clients: Record<string, S3Client> = {};

function getS3Client(cfg: B2AccountConfig): S3Client {
  const cacheKey = `${cfg.endpoint}:${cfg.accessKeyId}`;
  if (!s3Clients[cacheKey]) {
    s3Clients[cacheKey] = new S3Client({
      endpoint: cfg.endpoint.startsWith('http') ? cfg.endpoint : `https://${cfg.endpoint}`,
      region: cfg.region,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }
  return s3Clients[cacheKey];
}

/**
 * Generates a presigned GET URL for an object stored on Backblaze B2
 */
export async function getB2PresignedUrl(
  storageKey: string,
  expiresInSeconds: number = 3600,
  preferredAccount: 'account1' | 'account2' = 'account2'
): Promise<string | null> {
  const accounts: ('account1' | 'account2')[] = preferredAccount === 'account2' ? ['account2', 'account1'] : ['account1', 'account2'];

  for (const acc of accounts) {
    const cfg = getAccountConfig(acc);
    if (!cfg) continue;

    try {
      const client = getS3Client(cfg);
      const command = new GetObjectCommand({
        Bucket: cfg.bucketName,
        Key: storageKey,
      });
      const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
      if (url) return url;
    } catch (err) {
      console.warn(`B2 presigning failed for ${storageKey} on ${acc}:`, err);
    }
  }

  return null;
}
