import { runQuery } from './db.js';
import { getClientIp } from './ip.js';
import { sha256Hex, randomUUID } from './crypto.js';
import { getSessionId } from './session.js';
import type { HonoContext } from './types.js';

export type AnalyticsEventType = 'circuit_created' | 'circuit_shared' | 'blog_published';

export type AnalyticsEventPayload = {
  type: AnalyticsEventType;
  path: string;
  userId: string;
  metadata?: Record<string, unknown>;
};

const KNOWN_BROWSERS = [
  'Chrome',
  'Safari',
  'Firefox',
  'Edge',
  'Opera',
  'Brave',
  'Arc',
  'Vivaldi',
];

function parseBrowser(userAgent: string): { name: string; version: string | null } {
  for (const name of KNOWN_BROWSERS) {
    const regex = new RegExp(`${name}(?:\\/([0-9.]+))?`, 'i');
    const match = userAgent.match(regex);
    if (match) {
      return { name, version: match[1] ?? null };
    }
  }
  return { name: 'Unknown', version: null };
}

function parseOs(userAgent: string): string {
  const patterns = [
    { name: 'Windows', regex: /Windows NT ([0-9.]+)/ },
    { name: 'macOS', regex: /Mac OS X ([0-9_[.]+)/ },
    { name: 'iOS', regex: /(iPhone|iPad|iPod).*OS ([0-9_]+)/ },
    { name: 'Android', regex: /Android ([0-9.]+)/ },
    { name: 'Linux', regex: /Linux/ },
  ];
  for (const { name, regex } of patterns) {
    if (regex.test(userAgent)) return name;
  }
  return 'Unknown';
}

function parseDeviceType(userAgent: string): string {
  if (/iPhone|Android.*Mobile/.test(userAgent)) return 'mobile';
  if (/iPad|Android(?!.*Mobile)|Tablet/.test(userAgent)) return 'tablet';
  if (/Mobile/.test(userAgent)) return 'mobile';
  return 'desktop';
}

function parseDevice(userAgent: string): string | null {
  const match = userAgent.match(/\(([^)]+)\)/);
  if (!match) return null;
  const fragment = match[1].trim();
  // Drop common OS identifiers to surface the device model when present.
  const device = fragment
    .split(';')
    .map((s) => s.trim())
    .filter(
      (s) =>
        !s.startsWith('Windows') &&
        !s.startsWith('Macintosh') &&
        !s.startsWith('Linux') &&
        !s.startsWith('Android') &&
        !s.startsWith('CPU') &&
        !s.startsWith('U;') &&
        !s.startsWith('en-US') &&
        !/^x64|^iPhone|^iPad/.test(s)
    )
    .join('; ');
  return device || null;
}

export function hashIp(ip: string): Promise<string> {
  return sha256Hex(ip);
}

export function hashSession(sessionId: string, ip: string): Promise<string> {
  return sha256Hex(`${sessionId}:${ip}`);
}

export function sanitizePath(path: string): string {
  try {
    const url = new URL(path, 'http://localhost');
    return url.pathname;
  } catch {
    return path.split('?')[0].split('#')[0];
  }
}

export function sanitizeReferrer(referrer: string | undefined): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export async function recordAnalyticsEvent(
  c: HonoContext,
  payload: AnalyticsEventPayload
): Promise<void> {
  const sessionId = getSessionId(c);
  const ip = getClientIp(c);
  const userAgent = c.req.header('User-Agent') || '';
  const browser = parseBrowser(userAgent);
  const os = parseOs(userAgent);
  const deviceType = parseDeviceType(userAgent);
  const device = parseDevice(userAgent);

  const sessionHash = sessionId
    ? await hashSession(sessionId, ip)
    : await sha256Hex(`backend:${payload.userId}:${ip}`);
  const ipHash = await hashIp(ip);
  const path = sanitizePath(payload.path);
  const referrer = sanitizeReferrer(c.req.header('Referer'));
  const now = new Date().toISOString();

  const metadata = payload.metadata ? JSON.stringify(payload.metadata) : null;

  await runQuery(
    c,
    `INSERT INTO analytics_events
      (id, type, path, user_id, session_hash, ip_hash, user_agent,
       browser, browser_version, os, device, device_type, country,
       timezone, language, referrer, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      payload.type,
      path,
      payload.userId,
      sessionHash,
      ipHash,
      userAgent,
      browser.name,
      browser.version,
      os,
      device,
      deviceType,
      c.req.header('CF-IPCountry') || null,
      null,
      c.req.header('Accept-Language') || null,
      referrer,
      metadata,
      now,
    ]
  );
}

