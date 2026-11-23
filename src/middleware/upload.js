import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { documentNameError } from '../services/documentService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileSize, files: 10 },
  fileFilter: (_req, file, callback) => {
    const message = documentNameError(file.originalname);
    if (message) return callback(new ApiError(400, message));
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
