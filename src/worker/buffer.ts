export function stringToBytes(input: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(input);
}

export function bytesToString(bytes: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('Invalid data URL');
  }
  const base64 = dataUrl.slice(commaIndex + 1);
  return base64ToBytes(base64);
}

export function dataUrlContentType(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? null;
}

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff]);
const WEBP_MAGIC = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // "RIFF"
const WEBP_SUBTYPE = new Uint8Array([0x57, 0x45, 0x42, 0x50]); // "WEBP" at offset 8

function hasMagicPrefix(bytes: Uint8Array, magic: Uint8Array): boolean {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

export type ImageType = 'png' | 'jpg' | 'webp';

/**
 * Sniffs the image type from the first bytes of a file.
 * Returns null if the magic bytes do not match a supported format.
 */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (hasMagicPrefix(bytes, PNG_MAGIC)) return 'png';
  if (hasMagicPrefix(bytes, JPEG_MAGIC)) return 'jpg';
  if (
    hasMagicPrefix(bytes, WEBP_MAGIC) &&
    bytes.length >= 12 &&
    hasMagicPrefix(bytes.subarray(8), WEBP_SUBTYPE)
  ) {
    return 'webp';
  }
  return null;
}

/**
 * Decodes a base64 PNG data URL, verifying the magic bytes.
 * Throws on malformed input — callers map this to a 400.
 */
export function parsePngDataUrl(dataUrl: string): Uint8Array {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error('Expected a PNG data URL');
  }
  const bytes = base64ToBytes(dataUrl.slice(PNG_DATA_URL_PREFIX.length));
  if (bytes.length === 0) {
    throw new Error('Data URL payload is empty');
  }
  if (bytes.length < PNG_MAGIC.length) {
    throw new Error('Data URL payload is not a PNG image');
  }
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) {
      throw new Error('Data URL payload is not a PNG image');
    }
  }
  return bytes;
}
