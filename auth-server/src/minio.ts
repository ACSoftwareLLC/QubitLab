import * as Minio from 'minio';
import { config } from './config.js';

export const minioClient = new Minio.Client({
  endPoint: config.minio.endpoint,
  port: config.minio.port,
  useSSL: config.minio.useSsl,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates the app's buckets if they don't exist. MinIO may still be starting
 * when this service boots (docker-compose has no usable healthcheck for the
 * minio image), so retry with backoff before giving up.
 */
export async function ensureBuckets(attempts = 10): Promise<void> {
  const buckets = [config.minio.bucketAvatars, config.minio.bucketThumbnails];

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      for (const bucket of buckets) {
        if (!(await minioClient.bucketExists(bucket))) {
          await minioClient.makeBucket(bucket);
          console.log(`Created MinIO bucket "${bucket}"`);
        }
      }
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      await sleep(Math.min(1000 * attempt, 5000));
    }
  }
}
