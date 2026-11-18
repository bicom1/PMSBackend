import { User } from '../models/User.js';

async function purgeExpiredRefreshTokens() {
  await User.updateMany(
    { 'refreshTokens.0': { $exists: true } },
    { $pull: { refreshTokens: { expiresAt: { $lt: new Date() } } } },
  );
}

export function startMaintenanceJobs() {
  purgeExpiredRefreshTokens().catch((error) => {
    console.error('Refresh token purge failed', error.message);
  });
  const timer = setInterval(() => {
    purgeExpiredRefreshTokens().catch((error) => {
      console.error('Refresh token purge failed', error.message);
    });
  }, 12 * 60 * 60 * 1000);
  timer.unref?.();
}
