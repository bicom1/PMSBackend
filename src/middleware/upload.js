import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { documentNameError } from '../services/documentService.js';
import { voiceUploadLimits } from '../services/voiceService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileSize, files: 10 },
  fileFilter: (_req, file, callback) => {
    const message = documentNameError(file.originalname);
    if (message) return callback(new ApiError(400, message));
    return callback(null, true);
  },
});

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: voiceUploadLimits(), files: 1 },
  fileFilter: (_req, file, callback) => {
    const name = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const okExt = /\.(webm|wav|mp3|ogg|m4a|mp4|aac)$/.test(name);
    const okMime = mime.startsWith('audio/') || mime === 'video/webm';
    if (!okExt && !okMime) return callback(new ApiError(400, 'Only audio recordings are allowed'));
    return callback(null, true);
  },
});

export function uploadFiles(req, res, next) {
  upload.array('files', 10)(req, res, (error) => {
    if (error) return next(error);
    return next();
  });
}

export function uploadVoiceAudio(req, res, next) {
  voiceUpload.single('audio')(req, res, (error) => {
    if (error) return next(error);
    return next();
  });
}

export const uploadPdfs = uploadFiles;
