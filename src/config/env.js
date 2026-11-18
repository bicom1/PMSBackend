import dotenv from 'dotenv';
import { z } from 'zod';

if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),
  DATA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('storage'),
  MAX_FILE_SIZE: z.coerce.number().default(10 * 1024 * 1024),
  COOKIE_SECURE: z.string().default('false'),
  CLINIC_TIMEZONE: z.string().default('Asia/Karachi'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional().default(''),
  S3_REGION: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_ENDPOINT: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  mongoUri: parsed.data.MONGODB_URI,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
  jwtAccessExpires: parsed.data.JWT_ACCESS_EXPIRES,
  jwtRefreshExpires: parsed.data.JWT_REFRESH_EXPIRES,
  dataEncryptionKey: parsed.data.DATA_ENCRYPTION_KEY,
  clientOrigins: parsed.data.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
  uploadDir: parsed.data.UPLOAD_DIR,
  maxFileSize: parsed.data.MAX_FILE_SIZE,
  cookieSecure: parsed.data.COOKIE_SECURE === 'true',
  clinicTimezone: parsed.data.CLINIC_TIMEZONE,
  storageDriver: parsed.data.STORAGE_DRIVER,
  s3: {
    bucket: parsed.data.S3_BUCKET,
    region: parsed.data.S3_REGION,
    accessKeyId: parsed.data.S3_ACCESS_KEY_ID,
    secretAccessKey: parsed.data.S3_SECRET_ACCESS_KEY,
    endpoint: parsed.data.S3_ENDPOINT,
  },
};
