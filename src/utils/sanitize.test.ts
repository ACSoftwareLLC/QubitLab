import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeHtmlForExcerpt } from './sanitize';

describe('sanitizeHtml', () => {
  it('strips script tags', () => {
    const dirty = '<p>hello</p><script>alert(1)</script>';
    expect(sanitizeHtml(dirty)).toBe('<p>hello</p>');
  });

  it('removes event handlers', () => {
    const dirty = '<img src=x onerror="alert(1)">';
    expect(sanitizeHtml(dirty)).toBe('<img src="x">');
  });

  it('removes javascript: URLs', () => {
    const dirty = '<a href="javascript:alert(1)">click</a>';
    expect(sanitizeHtml(dirty)).toBe('<a>click</a>');
  });

  it('keeps safe formatting tags', () => {
    const dirty = '<p><strong>bold</strong> <em>italic</em></p>';
    expect(sanitizeHtml(dirty)).toBe('<p><strong>bold</strong> <em>italic</em></p>');
  });
});

describe('sanitizeHtmlForExcerpt', () => {
  it('sanitizes then truncates', () => {
    const dirty = '<p>' + 'a'.repeat(500) + '</p><script>alert(1)</script>';
    const excerpt = sanitizeHtmlForExcerpt(dirty, 300);
    expect(excerpt.startsWith('<p>')).toBe(true);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt).not.toContain('<script>');
    expect(excerpt.length).toBe(301); // '<p>' + 297 'a's + '…'
  });

  it('does not append ellipsis when already short', () => {
    const dirty = '<p>short</p>';
    expect(sanitizeHtmlForExcerpt(dirty, 100)).toBe('<p>short</p>');
  });
});
