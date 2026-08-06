import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const SESSION_KEY = 'analytics_session_id';
const TRACK_URL = '/auth/analytics/track';

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, id);
  return id;
}

function getScreen(): string {
  return `${window.screen.width}x${window.screen.height}`;
}

function sendTrack(payload: Record<string, unknown>) {
  const data = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(TRACK_URL, new Blob([data], { type: 'application/json' }));
  } else {
    fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: data,
    }).catch(() => {
      // Fail silently; analytics should never break the app.
    });
  }
}

export function useAnalytics() {
  const location = useLocation();
  const lastPathRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(getOrCreateSessionId());

  useEffect(() => {
    const path = location.pathname + location.search;
    if (lastPathRef.current === path) {
      return;
    }
    lastPathRef.current = path;

    sendTrack({
      type: 'page_view',
      path,
      sessionId: sessionIdRef.current,
      referrer: document.referrer || undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      screen: getScreen(),
    });
  }, [location]);
}

export function trackEvent(name: string, metadata?: Record<string, unknown>) {
  sendTrack({
    type: 'event',
    path: window.location.pathname,
    sessionId: getOrCreateSessionId(),
    referrer: document.referrer || undefined,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    screen: getScreen(),
    metadata: { name, ...(metadata || {}) },
  });
}
