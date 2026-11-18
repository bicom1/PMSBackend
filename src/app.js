import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import { requestContext } from './middleware/requestContext.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authLimiter, globalLimiter } from './middleware/rateLimiter.js';
import { registerRoutes } from './routes/index.js';
import './models/index.js';

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (env.clientOrigins.includes(origin)) return true;
  if (env.nodeEnv !== 'development') return false;
  try {
    const url = new URL(origin);
    const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    return localHost && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.set('query parser', 'simple');
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestContext);
  if (env.nodeEnv === 'development') app.use(morgan('dev'));
  if (env.nodeEnv !== 'test') {
    app.use(globalLimiter);
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/signup', authLimiter);
  }
  registerRoutes(app);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
