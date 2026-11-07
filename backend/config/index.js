const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);

const config = {
  env: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV', 'development') === 'production',
  port: parseInt(env('PORT', '5000'), 10),
  appUrl: env('APP_URL', 'http://localhost:5173').replace(/\/$/, ''),
  apiUrl: env('API_URL', 'http://localhost:5000').replace(/\/$/, ''),
  corsOrigins: env('CORS_ORIGINS', 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  db: {
    host: env('DB_HOST', '127.0.0.1'),
    port: parseInt(env('DB_PORT', '3306'), 10),
    user: env('DB_USER', 'root'),
    password: env('DB_PASSWORD', ''),
    database: env('DB_NAME', 'epaper'),
  },
  jwt: { secret: env('JWT_SECRET', ''), expiresIn: env('JWT_EXPIRES_IN', '12h') },
  encryptionKey: env('SETTINGS_ENCRYPTION_KEY', env('JWT_SECRET', '')),
  bcryptRounds: parseInt(env('BCRYPT_ROUNDS', '12'), 10),
  maxLoginAttempts: parseInt(env('MAX_LOGIN_ATTEMPTS', '5'), 10),
  lockMinutes: parseInt(env('LOCK_MINUTES', '15'), 10),
  upload: {
    maxBytes: parseInt(env('MAX_UPLOAD_MB', '40'), 10) * 1024 * 1024,
    maxFiles: parseInt(env('MAX_FILES_PER_UPLOAD', '60'), 10),
  },
  paths: {
    root: path.join(__dirname, '..'),
    uploads: path.join(__dirname, '..', 'uploads'),
    originals: path.join(__dirname, '..', 'storage', 'originals'),
    tmp: path.join(__dirname, '..', 'storage', 'tmp'),
    frontendDist: path.resolve(__dirname, '..', env('FRONTEND_DIST', '../frontend/dist')),
  },
  admin: {
    name: env('ADMIN_NAME', 'Super Admin'),
    email: env('ADMIN_EMAIL', 'admin@example.com'),
    password: env('ADMIN_PASSWORD', 'Admin@12345'),
  },
  smtp: {
    host: env('SMTP_HOST', ''),
    port: parseInt(env('SMTP_PORT', '587'), 10),
    secure: env('SMTP_SECURE', 'false') === 'true',
    user: env('SMTP_USER', ''),
    pass: env('SMTP_PASS', ''),
    from: env('MAIL_FROM', 'ePaper <no-reply@example.com>'),
  },
  vapid: {
    publicKey: env('VAPID_PUBLIC_KEY', ''),
    privateKey: env('VAPID_PRIVATE_KEY', ''),
    subject: env('VAPID_SUBJECT', 'mailto:admin@example.com'),
  },
};

if (!config.jwt.secret || config.jwt.secret.length < 16) {
  console.error('FATAL: JWT_SECRET must be set in backend/.env (at least 16 characters).');
  process.exit(1);
}

module.exports = config;
