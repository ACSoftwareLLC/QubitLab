import { createHash, randomUUID } from 'crypto';
import { UAParser } from 'ua-parser-js';
import { pool } from '../db.js';

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

export function hashSession(sessionId: string, ip: string): string {
  return createHash('sha256').update(`${sessionId}:${ip}`).digest('hex');
}

export function generateSessionId(): string {
  return randomUUID();
}

export function backendSessionHash(ip: string, userId?: string): string {
  return hashSession(`backend:${userId || 'anonymous'}`, ip);
}

export interface AnalyticsEventPayload {
  type: string;
  path: string;
  userId?: string | null;
  ip: string;
  userAgent?: string;
  sessionId?: string;
  referrer?: string;
  timezone?: string;
  language?: string;
  country?: string;
  metadata?: Record<string, unknown>;
}

export async function recordAnalyticsEvent(payload: AnalyticsEventPayload): Promise<void> {
  const ip = payload.ip;
  const userAgent = payload.userAgent || '';
  const clientInfo = parseClientInfo(userAgent);
  const sessionHash = payload.sessionId
    ? hashSession(payload.sessionId, ip)
    : backendSessionHash(ip, payload.userId || undefined);
  const ipHash = hashIp(ip);
  const path = sanitizePath(payload.path);
  const referrer = sanitizeReferrer(payload.referrer);

  await pool.query(
    `INSERT INTO analytics_events
     (type, path, user_id, session_hash, ip_hash, user_agent, browser, browser_version,
      os, device, device_type, country, timezone, language, referrer, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      payload.type,
      path,
      payload.userId || null,
      sessionHash,
      ipHash,
      userAgent,
      clientInfo.browser,
      clientInfo.browserVersion,
      clientInfo.os,
      clientInfo.device,
      clientInfo.deviceType,
      payload.country || null,
      payload.timezone || null,
      payload.language || null,
      referrer,
      payload.metadata || null,
    ]
  );
}

export function parseClientInfo(userAgent: string) {
  const parser = new UAParser(userAgent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();
  const engine = parser.getEngine();
  return {
    browser: browser.name || 'Unknown',
    browserVersion: browser.version || null,
    os: os.name || 'Unknown',
    device: device.model || device.vendor || null,
    deviceType: device.type || 'desktop',
    engine: engine.name || null,
  };
}

export function sanitizeReferrer(referrer: string | undefined): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    // Only store the origin; drop path/query to avoid leaking sensitive URLs.
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function sanitizePath(path: string): string {
  // Strip query strings and fragments; keep the clean pathname.
  try {
    const url = new URL(path, 'http://localhost');
    return url.pathname;
  } catch {
    return path.split('?')[0].split('#')[0];
  }
}
