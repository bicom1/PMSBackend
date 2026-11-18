import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Resource not found' });
}

export function errorHandler(err, req, res, _next) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File exceeds the 10 MB limit' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, message: 'Invalid JSON body' });
  }

  const status = err.statusCode || err.status || 500;
  const message = status >= 500 && env.nodeEnv === 'production'
    ? 'Internal server error'
    : (err.message || 'Internal server error');

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({
    success: false,
    message,
    errors: err instanceof ApiError ? err.details : undefined,
    requestId: req.requestId,
  });
}
