const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // ‰PNG

/**
 * Decodes a base64 PNG data URL, verifying the magic bytes.
 * Throws on malformed input — callers map this to a 400.
 */
export function parsePngDataUrl(dataUrl: string): Buffer {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error('Expected a PNG data URL');
  }
  const buf = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), 'base64');
  if (buf.length === 0 || !buf.subarray(0, 4).equals(PNG_MAGIC)) {
    throw new Error('Data URL payload is not a PNG image');
  }
  return buf;
}
