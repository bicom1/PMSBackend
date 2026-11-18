import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const blockedExtensions = new Set(['exe', 'bat', 'cmd', 'com', 'msi', 'dll', 'scr', 'ps1', 'vbs', 'js', 'jar', 'sh', 'hta', 'cpl', 'msc']);

function extensionOf(name) {
  return (String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || '';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileSize, files: 10 },
  fileFilter: (_req, file, callback) => {
    const extension = extensionOf(file.originalname);
    if (!extension || blockedExtensions.has(extension)) {
      return callback(new ApiError(400, 'This file type cannot be uploaded'));
    }
    return callback(null, true);
  },
});

export function uploadFiles(req, res, next) {
  upload.array('files', 10)(req, res, (error) => {
    if (error) return next(error);
    return next();
  });
}

export const uploadPdfs = uploadFiles;
