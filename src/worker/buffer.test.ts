import { describe, it, expect } from 'vitest';
import { dataUrlToBytes, dataUrlContentType, bytesToString, stringToBytes } from './buffer.js';

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
});
