import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileSize, files: 10 },
  fileFilter: (_req, file, callback) => {
    const name = String(file.originalname || '').toLowerCase();
    if (file.mimetype !== 'application/pdf' || !name.endsWith('.pdf')) {
      return callback(new ApiError(400, 'Only PDF documents are allowed'));
    }
    return callback(null, true);
  },
});

export function uploadPdfs(req, res, next) {
  upload.array('files', 10)(req, res, (error) => {
    if (error) return next(error);
    return next();
  });
}
