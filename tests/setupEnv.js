import fs from 'fs';

const uri = fs.readFileSync(new URL('./.mongo-uri', import.meta.url), 'utf8').trim();
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = uri;
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
process.env.DATA_ENCRYPTION_KEY = 'ab'.repeat(32);
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.COOKIE_SECURE = 'false';
process.env.CLINIC_TIMEZONE = 'Asia/Karachi';
process.env.UPLOAD_DIR = 'storage-test';
process.env.MAX_FILE_SIZE = '10485760';
process.env.STORAGE_DRIVER = 'local';
