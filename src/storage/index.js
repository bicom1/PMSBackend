import { env } from '../config/env.js';
import * as local from './localStorage.js';

let driverPromise;

function s3Ready() {
  return env.storageDriver === 's3' && env.s3.bucket && env.s3.accessKeyId && env.s3.secretAccessKey;
}

export function getStorage() {
  if (!driverPromise) {
    if (env.storageDriver === 's3' && !s3Ready()) {
      console.warn('S3 keys are missing. Documents are saved on this server until S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are set.');
    }
    driverPromise = s3Ready() ? import('./s3Storage.js') : Promise.resolve(local);
  }
  return driverPromise;
}
