import type { HonoContext } from './types.js';

export async function r2Upload(
  c: HonoContext,
  binding: 'AVATARS' | 'THUMBNAILS',
  key: string,
  data: ArrayBuffer | Uint8Array,
  contentType: string
): Promise<void> {
  const bucket = c.env[binding];
  await bucket.put(key, data, { httpMetadata: { contentType } });
}

export async function r2Get(
  c: HonoContext,
  binding: 'AVATARS' | 'THUMBNAILS',
  key: string
): Promise<Response | null> {
  const bucket = c.env[binding];
  const object = await bucket.get(key);
  if (!object) return null;

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  if (object.size) {
    headers.set('content-length', String(object.size));
  }

  return new Response(object.body as ReadableStream, { headers });
}

export async function r2Delete(
  c: HonoContext,
  binding: 'AVATARS' | 'THUMBNAILS',
  key: string
): Promise<void> {
  await c.env[binding].delete(key);
}
