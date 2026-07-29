import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgres://localhost:5432/quantum_auth',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  nodeEnv: process.env.NODE_ENV || 'development',
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: Number(process.env.MINIO_PORT || 9000),
    useSsl: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucketAvatars: 'avatars',
    bucketThumbnails: 'circuit-thumbnails',
  },
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

if (config.nodeEnv === 'production' && config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters in production');
}
