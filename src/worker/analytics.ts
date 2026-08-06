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

export type ClientInfo = {
  browser: string;
  browserVersion: string | null;
  os: string;
  device: string | null;
  deviceType: string;
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

export function parseClientInfo(userAgent: string): ClientInfo {
  const browser = parseBrowser(userAgent);
  return {
    browser: browser.name,
    browserVersion: browser.version,
    os: parseOs(userAgent),
    device: parseDevice(userAgent),
    deviceType: parseDeviceType(userAgent),
  };
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

async function insertAnalyticsEvent(
  c: HonoContext,
  params: {
    type: string;
    path: string;
    userId: string | null;
    sessionHash: string;
    ipHash: string;
    userAgent: string;
    browser: string;
    browserVersion: string | null;
    os: string;
    device: string | null;
    deviceType: string;
    country: string | null;
    timezone: string | null;
    language: string | null;
    referrer: string | null;
    metadata: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  await runQuery(
    c,
    `INSERT INTO analytics_events
      (id, type, path, user_id, session_hash, ip_hash, user_agent,
       browser, browser_version, os, device, device_type, country,
       timezone, language, referrer, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      params.type,
      params.path,
      params.userId,
      params.sessionHash,
      params.ipHash,
      params.userAgent,
      params.browser,
      params.browserVersion,
      params.os,
      params.device,
      params.deviceType,
      params.country,
      params.timezone,
      params.language,
      params.referrer,
      params.metadata,
      now,
    ]
  );
}

export async function recordAnalyticsEvent(
  c: HonoContext,
  payload: AnalyticsEventPayload
): Promise<void> {
  const sessionId = getSessionId(c);
  const ip = getClientIp(c);
  const userAgent = c.req.header('User-Agent') || '';
  const clientInfo = parseClientInfo(userAgent);
  const sessionHash = sessionId
    ? await hashSession(sessionId, ip)
    : await sha256Hex(`backend:${payload.userId}:${ip}`);
  const ipHash = await hashIp(ip);
  const path = sanitizePath(payload.path);
  const referrer = sanitizeReferrer(c.req.header('Referer'));

  const metadata = payload.metadata ? JSON.stringify(payload.metadata) : null;

  await insertAnalyticsEvent(c, {
    type: payload.type,
    path,
    userId: payload.userId,
    sessionHash,
    ipHash,
    userAgent,
    browser: clientInfo.browser,
    browserVersion: clientInfo.browserVersion,
    os: clientInfo.os,
    device: clientInfo.device,
    deviceType: clientInfo.deviceType,
    country: c.req.header('CF-IPCountry') || null,
    timezone: null,
    language: c.req.header('Accept-Language') || null,
    referrer,
    metadata,
  });
}

export async function recordAnalyticsTrackEvent(
  c: HonoContext,
  body: {
    type: 'page_view' | 'event';
    path: string;
    sessionId: string;
    referrer?: string;
    timezone?: string;
    language?: string;
    country?: string;
    screen?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const ip = getClientIp(c);
  const userAgent = c.req.header('User-Agent') || '';
  const clientInfo = parseClientInfo(userAgent);
  const sessionHash = await hashSession(body.sessionId, ip);
  const ipHash = await hashIp(ip);
  const path = sanitizePath(body.path);
  const referrer = sanitizeReferrer(body.referrer);
  const user = c.get('user');

  const metadata: Record<string, unknown> = body.metadata ? { ...body.metadata } : {};
  if (body.screen) {
    metadata.screen = body.screen;
  }

  await insertAnalyticsEvent(c, {
    type: body.type,
    path,
    userId: user?.id ?? null,
    sessionHash,
    ipHash,
    userAgent,
    browser: clientInfo.browser,
    browserVersion: clientInfo.browserVersion,
    os: clientInfo.os,
    device: clientInfo.device,
    deviceType: clientInfo.deviceType,
    country: body.country || null,
    timezone: body.timezone || null,
    language: body.language || null,
    referrer,
    metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
  });
}

