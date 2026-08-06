export interface AnalyticsSummary {
  days: number;
  since: string;
  pageViews: number;
  uniqueVisitors: number;
  returningVisitors: number;
  newUsers: number;
  activeSessions: number;
  circuitsCreated: number;
  sharedCircuits: number;
  blogPostsPublished: number;
  topPage: { path: string; views: number } | null;
  totalUsers: number;
  totalCircuits: number;
  totalShared: number;
  sharedThisWeek: number;
}

export interface AnalyticsTimeseries {
  days: number;
  since: string;
  pageViews: { date: string; pageViews: number; uniqueVisitors: number }[];
  newUsers: { date: string; newUsers: number }[];
  circuitsCreated: { date: string; circuits: number }[];
  sharedCircuits: { date: string; shared: number }[];
}

export interface AnalyticsBreakdown {
  days: number;
  since: string;
  timezones: { name: string; value: number }[];
  countries: { name: string; value: number }[];
  languages: { name: string; value: number }[];
  browsers: { name: string; value: number }[];
  os: { name: string; value: number }[];
  devices: { name: string; value: number }[];
}

export interface AnalyticsPages {
  days: number;
  since: string;
  limit: number;
  pages: { path: string; views: number; uniqueVisitors: number }[];
}

export interface AnalyticsEvent {
  id: string;
  type: string;
  path: string;
  user_id: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  country: string | null;
  timezone: string | null;
  language: string | null;
  referrer: string | null;
  created_at: string;
}

export interface AnalyticsEvents {
  days: number;
  since: string;
  limit: number;
  events: AnalyticsEvent[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchAnalyticsSummary(days: number): Promise<AnalyticsSummary> {
  return get(`/auth/analytics/summary?days=${days}`);
}

export function fetchAnalyticsTimeseries(days: number): Promise<AnalyticsTimeseries> {
  return get(`/auth/analytics/timeseries?days=${days}`);
}

export function fetchAnalyticsGeography(days: number): Promise<AnalyticsBreakdown> {
  return get(`/auth/analytics/geography?days=${days}`);
}

export function fetchAnalyticsClients(days: number): Promise<AnalyticsBreakdown> {
  return get(`/auth/analytics/clients?days=${days}`);
}

export function fetchAnalyticsPages(days: number, limit = 20): Promise<AnalyticsPages> {
  return get(`/auth/analytics/pages?days=${days}&limit=${limit}`);
}

export function fetchAnalyticsEvents(days: number, limit = 50): Promise<AnalyticsEvents> {
  return get(`/auth/analytics/events?days=${days}&limit=${limit}`);
}

export async function fetchAnalyticsData(days: number) {
  const [summary, timeseries, geography, clients, pages, events] = await Promise.all([
    fetchAnalyticsSummary(days),
    fetchAnalyticsTimeseries(days),
    fetchAnalyticsGeography(days),
    fetchAnalyticsClients(days),
    fetchAnalyticsPages(days),
    fetchAnalyticsEvents(days),
  ]);
  return {
    summary,
    timeseries,
    geography,
    clients,
    pages,
    events,
    error: null,
  };
}
