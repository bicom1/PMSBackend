import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { startMaintenanceJobs } from './jobs/index.js';
import { ensureClinicFoundation } from './services/bootstrapService.js';

export async function startServer() {
  await connectDb();
  if (env.nodeEnv !== 'test') await ensureClinicFoundation();
  const app = createApp();
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`CPMS API listening on port ${env.port}`);
  });
  startMaintenanceJobs();
  const shutdown = async () => {
    server.close();
    const mongoose = (await import('mongoose')).default;
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

const invokedDirectly = process.argv[1]?.replaceAll('\\', '/').endsWith('/src/server.js');
if (invokedDirectly) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
