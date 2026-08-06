import { describe, it, expect } from 'vitest';
import { dataUrlToBytes, dataUrlContentType, bytesToString, stringToBytes, bytesToBase64, parsePngDataUrl } from './buffer.js';

describe('buffer', () => {
  it('round-trips string to bytes', () => {
    const str = 'hello world';
    expect(bytesToString(stringToBytes(str))).toBe(str);
  });

  it('extracts PNG data URL content type and bytes', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    expect(dataUrlContentType(dataUrl)).toBe('image/png');
    expect(dataUrlToBytes(dataUrl)).toBeInstanceOf(Uint8Array);
  });

  it('throws for invalid data URL', () => {
    expect(() => dataUrlToBytes('not a data url')).toThrow();
  });

  it('decodes and validates a PNG data URL', () => {
    const png =
      'data:image/png;base64,' +
      bytesToBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(parsePngDataUrl(png)).toBeInstanceOf(Uint8Array);
  });

  it('rejects a PNG data URL with invalid magic bytes', () => {
    const notPng = 'data:image/png;base64,' + bytesToBase64(new Uint8Array([1, 2, 3, 4, 5]));
    expect(() => parsePngDataUrl(notPng)).toThrow('not a PNG image');
  });

  it('rejects a non-PNG data URL', () => {
    expect(() => parsePngDataUrl('data:image/jpeg;base64,/9j/')).toThrow('Expected a PNG data URL');
  });
});
