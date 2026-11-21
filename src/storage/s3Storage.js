import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

function client() {
  if (!env.s3.bucket || !env.s3.accessKeyId || !env.s3.secretAccessKey) {
    throw new ApiError(503, 'Object storage is not configured');
  }
  return new S3Client({
    region: env.s3.region || 'us-east-1',
    endpoint: env.s3.endpoint || undefined,
    forcePathStyle: Boolean(env.s3.endpoint),
    credentials: env.s3.accessKeyId
      ? { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey }
      : undefined,
  });
}

export async function saveFile(buffer, { extension = 'bin', contentType = 'application/octet-stream' } = {}) {
  const safeExt = String(extension).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  const storageKey = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${safeExt}`;
  try {
    await client().send(new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      ServerSideEncryption: 'AES256',
    }));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'The file could not be stored. Try again.');
  }
  return { storageKey };
}

export async function openFile(storageKey) {
  if (!storageKey || storageKey.includes('..')) throw new ApiError(400, 'Invalid document key');
  const response = await client().send(new GetObjectCommand({
    Bucket: env.s3.bucket,
    Key: storageKey,
  }));
  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function savePdf(buffer) {
  return saveFile(buffer, { extension: 'pdf', contentType: 'application/pdf' });
}

export async function openPdf(storageKey) {
  return openFile(storageKey);
}
