export type SiteStats = {
  users: number;
  circuits: number;
  shared: number;
  sharedThisWeek: number;
};

export async function fetchStats(): Promise<SiteStats> {
  const res = await fetch('/auth/stats', { credentials: 'include' });
  const data = (await res.json().catch(() => ({}))) as SiteStats & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Failed to load stats (${res.status})`);
  }
  return data;
}
