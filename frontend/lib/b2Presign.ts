import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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
const objectAccountCache = new Map<string, 'account1' | 'account2'>();

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
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return s3Clients[cacheKey];
}

async function headObjectOnAccount(
  storageKey: string,
  account: 'account1' | 'account2'
): Promise<'exists' | 'not_found' | 'error'> {
  const cfg = getAccountConfig(account);
  if (!cfg) return 'error';
  try {
    const client = getS3Client(cfg);
    await client.send(
      new HeadObjectCommand({
        Bucket: cfg.bucketName,
        Key: storageKey,
      })
    );
    return 'exists';
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode;
    const name = err?.name || '';
    if (
      status === 404 ||
      name === 'NotFound' ||
      name === 'NoSuchKey'
    ) {
      return 'not_found';
    }
    return 'error';
  }
}

/**
 * Generates a presigned GET URL for an object stored on Backblaze B2,
 * verifying which storage account actually holds the key.
 */
export async function getB2PresignedUrl(
  storageKey: string,
  expiresInSeconds: number = 3600,
  preferredAccount: 'account1' | 'account2' = 'account2'
): Promise<string | null> {
  if (!storageKey) return null;

  const cachedAccount = objectAccountCache.get(storageKey);
  if (cachedAccount) {
    const cfg = getAccountConfig(cachedAccount);
    if (cfg) {
      try {
        const client = getS3Client(cfg);
        const url = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: cfg.bucketName, Key: storageKey }),
          { expiresIn: expiresInSeconds }
        );
        if (url) return url;
      } catch {}
    }
  }

  const accounts: ('account1' | 'account2')[] =
    preferredAccount === 'account2' ? ['account2', 'account1'] : ['account1', 'account2'];

  let confirmedMissingCount = 0;

  for (const acc of accounts) {
    const status = await headObjectOnAccount(storageKey, acc);
    if (status === 'exists') {
      objectAccountCache.set(storageKey, acc);
      const cfg = getAccountConfig(acc)!;
      try {
        const client = getS3Client(cfg);
        const url = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: cfg.bucketName, Key: storageKey }),
          { expiresIn: expiresInSeconds }
        );
        if (url) return url;
      } catch (err) {
        console.warn(`B2 presigning failed for ${storageKey} on ${acc}:`, err);
      }
    } else if (status === 'not_found') {
      confirmedMissingCount += 1;
    }
  }

  // If every configured account explicitly confirmed 404/NotFound, do not emit a broken presigned URL
  if (confirmedMissingCount === accounts.length) {
    return null;
  }

  // Fallback to preferred account only when network/HEAD check was inconclusive
  const fallbackCfg = getAccountConfig(preferredAccount);
  if (fallbackCfg) {
    try {
      const client = getAccountConfig(preferredAccount) ? getS3Client(fallbackCfg) : null;
      if (client) {
        const url = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: fallbackCfg.bucketName, Key: storageKey }),
          { expiresIn: expiresInSeconds }
        );
        if (url) return url;
      }
    } catch {}
  }

  return null;
}

