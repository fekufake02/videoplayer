import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from parent or current dir .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/videoplayer',

  b2: {
    // Account 2 (Default for ALL NEW UPLOADS)
    endpoint: process.env.B2_ENDPOINT_2 || 'https://s3.us-east-005.backblazeb2.com',
    region: process.env.B2_REGION_2 || 'us-east-005',
    bucketName: process.env.B2_BUCKET_NAME_2 || 'videoplayer122',
    accessKeyId: process.env.B2_ACCESS_KEY_ID_2 || '005353c1870b0160000000002',
    secretAccessKey: process.env.B2_SECRET_ACCESS_KEY_2 || 'K005HYWVzEBc9jrsg+yzervtJHBKIEY',

    // Account 1 (Legacy account for older videos)
    account1: {
      endpoint: process.env.B2_ENDPOINT_1 || process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com',
      region: process.env.B2_REGION_1 || process.env.B2_REGION || 'us-east-005',
      bucketName: process.env.B2_BUCKET_NAME_1 || process.env.B2_BUCKET_NAME || 'videoplayerprivate',
      accessKeyId: process.env.B2_ACCESS_KEY_ID_1 || process.env.B2_ACCESS_KEY_ID || '0053cfd7aa7a1a50000000001',
      secretAccessKey: process.env.B2_SECRET_ACCESS_KEY_1 || process.env.B2_SECRET_ACCESS_KEY || 'K005PvY2c8L9wpe9stpBJmlw7VQXJqA',
    },
  },

  sessionSecret: process.env.SESSION_SECRET || 'dev_secret_change_me_in_production_32_chars',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
};
