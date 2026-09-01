/**
 * One-time script to set CORS rules on Backblaze B2 buckets
 * using the B2 native API (not S3 API, which doesn't support PutBucketCors on B2).
 *
 * Usage: npx ts-node scripts/set-b2-cors.ts
 */

const B2_ACCOUNTS = [
  {
    name: 'Account 2 (videoplayer122)',
    keyId: process.env.B2_ACCESS_KEY_ID_2 || '005353c1870b0160000000002',
    appKey: process.env.B2_SECRET_ACCESS_KEY_2 || 'K005HYWVzEBc9jrsg+yzervtJHBKIEY',
    bucketName: 'videoplayer122',
  },
];

const CORS_RULES = [
  {
    corsRuleName: 'allowAllUploads',
    allowedOrigins: ['*'],
    allowedHeaders: ['*'],
    allowedOperations: [
      's3_put',
      's3_post',
      's3_get',
      's3_head',
      's3_delete',
      'b2_upload_file',
      'b2_download_file_by_name',
      'b2_download_file_by_id',
    ],
    exposeHeaders: [
      'ETag',
      'Content-Range',
      'Content-Length',
      'Accept-Ranges',
      'Content-Type',
      'x-amz-request-id',
      'x-amz-id-2',
    ],
    maxAgeSeconds: 3600,
  },
];

async function authorizeB2(keyId: string, appKey: string) {
  const credentials = Buffer.from(`${keyId}:${appKey}`).toString('base64');
  const res = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
    method: 'GET',
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`B2 auth failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function listBuckets(apiUrl: string, authToken: string, accountId: string) {
  const res = await fetch(`${apiUrl}/b2api/v3/b2_list_buckets`, {
    method: 'POST',
    headers: {
      Authorization: authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`b2_list_buckets failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function updateBucketCors(
  apiUrl: string,
  authToken: string,
  accountId: string,
  bucketId: string,
  corsRules: any[]
) {
  const res = await fetch(`${apiUrl}/b2api/v3/b2_update_bucket`, {
    method: 'POST',
    headers: {
      Authorization: authToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accountId,
      bucketId,
      corsRules,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`b2_update_bucket failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function main() {
  for (const account of B2_ACCOUNTS) {
    console.log(`\n--- Processing ${account.name} ---`);

    // Step 1: Authorize
    console.log('Authorizing with B2...');
    const auth: any = await authorizeB2(account.keyId, account.appKey);
    const { apiInfo, authorizationToken } = auth;
    const apiUrl = apiInfo?.storageApi?.apiUrl || auth.apiUrl;
    const accountId = auth.accountId;
    console.log(`  Authorized. Account ID: ${accountId}, API URL: ${apiUrl}`);

    // Step 2: Find bucket ID
    console.log(`Looking up bucket "${account.bucketName}"...`);
    const bucketsRes: any = await listBuckets(apiUrl, authorizationToken, accountId);
    const bucket = bucketsRes.buckets.find((b: any) => b.bucketName === account.bucketName);
    if (!bucket) {
      console.error(`  ERROR: Bucket "${account.bucketName}" not found!`);
      continue;
    }
    console.log(`  Found bucket ID: ${bucket.bucketId}`);
    console.log(`  Current CORS rules: ${JSON.stringify(bucket.corsRules, null, 2)}`);

    // Step 3: Update CORS
    console.log('Applying new CORS rules...');
    const result = await updateBucketCors(apiUrl, authorizationToken, accountId, bucket.bucketId, CORS_RULES);
    console.log(`  ✅ CORS rules updated successfully!`);
    console.log(`  New CORS rules: ${JSON.stringify(result.corsRules, null, 2)}`);
  }

  console.log('\n🎉 Done! CORS rules have been applied. Changes take effect within ~1 minute.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
