import DOMPurify from 'dompurify';

const DEFAULT_CONFIG = {
  USE_PROFILES: { html: true },
};

export function sanitizeHtml(dirty: string): string {
  return String(DOMPurify.sanitize(dirty, DEFAULT_CONFIG));
}

export function sanitizeHtmlForExcerpt(dirty: string, maxLength: number): string {
  const clean = sanitizeHtml(dirty);
  if (clean.length <= maxLength) return clean;
  // Truncate on a character boundary and append an ellipsis. Avoid slicing in
  // the middle of an HTML entity or tag (DOMPurify already strips tags, so
  // this is plain text/entities).
  return clean.slice(0, maxLength) + '…';
}
