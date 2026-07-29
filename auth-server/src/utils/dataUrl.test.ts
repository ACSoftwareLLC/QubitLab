import { describe, it, expect } from 'vitest';
import { parsePngDataUrl } from './dataUrl.js';

const PNG_DATA_URL =
  'data:image/png;base64,' +
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]).toString('base64');

describe('parsePngDataUrl', () => {
  it('decodes a valid PNG data URL', () => {
    const buf = parsePngDataUrl(PNG_DATA_URL);
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(buf.length).toBe(9);
  });

  it('rejects a non-PNG data URL prefix', () => {
    expect(() => parsePngDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toThrow('PNG data URL');
  });

  it('rejects a payload without PNG magic bytes', () => {
    const notPng = 'data:image/png;base64,' + Buffer.from('hello world').toString('base64');
    expect(() => parsePngDataUrl(notPng)).toThrow('not a PNG');
  });

  it('rejects an empty payload', () => {
    expect(() => parsePngDataUrl('data:image/png;base64,')).toThrow('not a PNG');
  });
});
