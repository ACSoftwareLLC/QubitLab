import { describe, it, expect, vi } from 'vitest';
import { r2Upload, r2Get, r2Delete } from './r2.js';
import type { HonoContext } from './types.js';

function makeFakeContext(binding: 'AVATARS' | 'THUMBNAILS', bucket: unknown): HonoContext {
  return {
    env: { [binding]: bucket },
  } as unknown as HonoContext;
}

describe('r2 helpers', () => {
  it('uploads an object with metadata', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const bucket = { put };
    const c = makeFakeContext('AVATARS', bucket);
    const data = new Uint8Array([1, 2, 3, 4]);

    await r2Upload(c, 'AVATARS', 'users/1/avatar.png', data, 'image/png');

    expect(put).toHaveBeenCalledWith('users/1/avatar.png', data, {
      httpMetadata: { contentType: 'image/png' },
    });
  });

  it('returns null when an object is missing', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const bucket = { get };
    const c = makeFakeContext('THUMBNAILS', bucket);

    const res = await r2Get(c, 'THUMBNAILS', 'missing.png');

    expect(res).toBeNull();
  });

  it('returns a response for an existing object', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
        controller.close();
      },
    });
    const writeHttpMetadata = vi.fn((headers: Headers) => {
      headers.set('Content-Type', 'image/png');
    });
    const get = vi.fn().mockResolvedValue({
      body: stream,
      httpEtag: '"etag"',
      size: 4,
      writeHttpMetadata,
    });
    const bucket = { get };
    const c = makeFakeContext('THUMBNAILS', bucket);

    const res = await r2Get(c, 'THUMBNAILS', 'thumb.png');

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get('content-type')).toBe('image/png');
    expect(res!.headers.get('content-length')).toBe('4');
    expect(res!.headers.get('etag')).toBe('"etag"');
  });

  it('deletes an object', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const bucket = { delete: del };
    const c = makeFakeContext('AVATARS', bucket);

    await r2Delete(c, 'AVATARS', 'old.png');

    expect(del).toHaveBeenCalledWith('old.png');
  });
});
