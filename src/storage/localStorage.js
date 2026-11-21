import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

function rootDir() {
  return path.resolve(process.cwd(), env.uploadDir);
}

export function resolveSafe(storageKey) {
  if (!storageKey || typeof storageKey !== 'string' || storageKey.includes('..') || path.isAbsolute(storageKey)) {
    throw new ApiError(400, 'Invalid document key');
  }
  const root = rootDir();
  const full = path.resolve(root, storageKey);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new ApiError(400, 'Invalid document key');
  }
  return full;
}

export async function saveFile(buffer, { extension = 'bin' } = {}) {
  const safeExt = String(extension).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  const storageKey = path.join(new Date().toISOString().slice(0, 10), `${crypto.randomUUID()}.${safeExt}`);
  const destination = resolveSafe(storageKey);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer);
  return { storageKey: storageKey.split(path.sep).join('/') };
}

export async function openFile(storageKey) {
  return fs.readFile(resolveSafe(storageKey));
}

export async function savePdf(buffer) {
  return saveFile(buffer, { extension: 'pdf' });
}

export async function openPdf(storageKey) {
  return openFile(storageKey);
}
