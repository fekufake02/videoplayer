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
    endpoint: process.env.B2_ENDPOINT || '',
    region: process.env.B2_REGION || 'us-west-004',
    bucketName: process.env.B2_BUCKET_NAME || '',
    accessKeyId: process.env.B2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.B2_SECRET_ACCESS_KEY || '',
  },

  sessionSecret: process.env.SESSION_SECRET || 'dev_secret_change_me_in_production_32_chars',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
};
