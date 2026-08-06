import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  fetchAnalyticsData,
  type AnalyticsSummary,
  type AnalyticsTimeseries,
  type AnalyticsBreakdown,
  type AnalyticsPages,
  type AnalyticsEvents,
  type AnalyticsEvent,
} from '../api/analytics';
import './AnalyticsPage.css';

const COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#f472b6', '#94a3b8'];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function mergeTimeseries(
  ts: AnalyticsTimeseries
): { date: string; pageViews: number; uniqueVisitors: number; newUsers: number }[] {
  const map = new Map<string, { date: string; pageViews: number; uniqueVisitors: number; newUsers: number }>();
  for (const row of ts.pageViews) {
    map.set(row.date, {
      date: row.date,
      pageViews: row.pageViews,
      uniqueVisitors: row.uniqueVisitors,
      newUsers: 0,
    });
  }
  for (const row of ts.newUsers) {
    const existing = map.get(row.date);
    if (existing) {
      existing.newUsers = row.newUsers;
    } else {
      map.set(row.date, {
        date: row.date,
        pageViews: 0,
        uniqueVisitors: 0,
        newUsers: row.newUsers,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatEventDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: string;
  color: string;
}) {
  return (
    <div className="analytics-card analytics-kpi" style={{ borderLeftColor: color }}>
      <div className="analytics-kpi-icon" style={{ color }}>
        <i className={`bi ${icon}`} />
      </div>
      <div className="analytics-kpi-body">
        <div className="analytics-kpi-value">{typeof value === 'number' ? formatNumber(value) : value}</div>
        <div className="analytics-kpi-label">{label}</div>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="analytics-empty">
      <i className="bi bi-bar-chart-line" />
      <p>{message}</p>
    </div>
  );
}

function PieBlock({
  title,
  data,
  dataKey,
}: {
  title: string;
  data: { name: string; value: number }[];
  dataKey: 'browsers' | 'os' | 'devices';
}) {
  if (data.length === 0) {
    return (
      <div className="analytics-card">
        <h3 className="analytics-card-title">{title}</h3>
        <EmptyChart message="No data for this period" />
      </div>
    );
  }

  return (
    <div className="analytics-card">
      <h3 className="analytics-card-title">{title}</h3>
      <div className="analytics-chart analytics-pie">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {data.map((_entry, index) => (
                <Cell key={`cell-${dataKey}-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.5rem',
                color: '#e2e8f0',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{
    summary: AnalyticsSummary | null;
    timeseries: AnalyticsTimeseries | null;
    geography: AnalyticsBreakdown | null;
    clients: AnalyticsBreakdown | null;
    pages: AnalyticsPages | null;
    events: AnalyticsEvents | null;
    error: string | null;
  }>({
    summary: null,
    timeseries: null,
    geography: null,
    clients: null,
    pages: null,
    events: null,
    error: null,
  });

  const { summary, timeseries, geography, clients, pages, events, error } = data;

  const mergedSeries = useMemo(() => {
    if (!timeseries) return [];
    return mergeTimeseries(timeseries);
  }, [timeseries]);

  useEffect(() => {
    let cancelled = false;
    fetchAnalyticsData(days)
      .then((next) => {
        if (cancelled) return;
        setData(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setData((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to load analytics',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (!user?.isAdmin) {
    return (
      <div className="analytics-page">
        <div className="analytics-content">
          <div className="analytics-error">Only admins can view analytics.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      <div className="analytics-content">
        <div className="analytics-header">
          <div>
            <h1 className="analytics-title">
              <i className="bi bi-graph-up-arrow" /> Analytics
            </h1>
            <p className="analytics-subtitle">Growth and engagement metrics for QubitLab.</p>
          </div>
          <div className="analytics-range">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                className={`analytics-range-button ${days === d ? 'active' : ''}`}
                onClick={() => setDays(d)}
              >
                Last {d} days
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="analytics-error">
            <i className="bi bi-exclamation-triangle" /> {error}
          </div>
        )}

        {summary && (
          <div className="analytics-kpi-grid">
            <SummaryCard label="Page views" value={summary.pageViews} icon="bi-eye" color="#38bdf8" />
            <SummaryCard label="Unique visitors" value={summary.uniqueVisitors} icon="bi-people" color="#a78bfa" />
            <SummaryCard
              label="Returning visitors"
              value={summary.returningVisitors}
              icon="bi-person-check"
              color="#34d399"
            />
            <SummaryCard label="New users" value={summary.newUsers} icon="bi-person-plus" color="#fbbf24" />
            <SummaryCard
              label="Circuits created"
              value={summary.circuitsCreated}
              icon="bi-cpu"
              color="#f87171"
            />
            <SummaryCard
              label="Shared circuits"
              value={summary.sharedCircuits}
              icon="bi-share"
              color="#60a5fa"
            />
            <SummaryCard
              label="Blog posts"
              value={summary.blogPostsPublished}
              icon="bi-journal-text"
              color="#f472b6"
            />
            <SummaryCard
              label="Active sessions"
              value={summary.activeSessions}
              icon="bi-lightning-charge"
              color="#94a3b8"
            />
          </div>
        )}

        <div className="analytics-grid">
          <div className="analytics-card analytics-card-wide">
            <h3 className="analytics-card-title">Traffic over time</h3>
            {mergedSeries.length === 0 ? (
              <EmptyChart message="No traffic data for this period" />
            ) : (
              <div className="analytics-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={mergedSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" tickFormatter={formatDate} stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      labelFormatter={(label) => formatDate(label as string)}
                      contentStyle={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        color: '#e2e8f0',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="pageViews"
                      name="Page views"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="uniqueVisitors"
                      name="Unique visitors"
                      stroke="#a78bfa"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="newUsers"
                      name="New users"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="analytics-card">
            <h3 className="analytics-card-title">Top pages</h3>
            {pages && pages.pages.length === 0 ? (
              <EmptyChart message="No page data for this period" />
            ) : (
              <div className="analytics-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={pages?.pages || []} layout="vertical" margin={{ left: 24, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" stroke="#94a3b8" />
                    <YAxis
                      type="category"
                      dataKey="path"
                      stroke="#94a3b8"
                      width={100}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        color: '#e2e8f0',
                      }}
                    />
                    <Bar dataKey="views" name="Views" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="uniqueVisitors" name="Unique visitors" fill="#a78bfa" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <PieBlock title="Browsers" data={clients?.browsers || []} dataKey="browsers" />
          <PieBlock title="Operating systems" data={clients?.os || []} dataKey="os" />
          <PieBlock title="Devices" data={clients?.devices || []} dataKey="devices" />

          <div className="analytics-card">
            <h3 className="analytics-card-title">Top timezones</h3>
            {geography && geography.timezones.length === 0 ? (
              <EmptyChart message="No timezone data for this period" />
            ) : (
              <div className="analytics-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={geography?.timezones || []} margin={{ bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#94a3b8" angle={-30} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        color: '#e2e8f0',
                      }}
                    />
                    <Bar dataKey="value" name="Visitors" fill="#34d399" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="analytics-card">
            <h3 className="analytics-card-title">Top languages</h3>
            {geography && geography.languages.length === 0 ? (
              <EmptyChart message="No language data for this period" />
            ) : (
              <div className="analytics-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={geography?.languages || []} margin={{ bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#94a3b8" angle={-30} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        color: '#e2e8f0',
                      }}
                    />
                    <Bar dataKey="value" name="Visitors" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="analytics-card">
          <h3 className="analytics-card-title">Recent events</h3>
          {events && events.events.length === 0 ? (
            <EmptyChart message="No events for this period" />
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Path</th>
                    <th>User</th>
                    <th>Browser</th>
                    <th>OS</th>
                    <th>Device</th>
                    <th>Timezone</th>
                    <th>Referrer</th>
                  </tr>
                </thead>
                <tbody>
                  {events?.events.map((event: AnalyticsEvent) => (
                    <tr key={event.id}>
                      <td>{formatEventDate(event.created_at)}</td>
                      <td>
                        <span className="analytics-tag">{event.type}</span>
                      </td>
                      <td className="analytics-path">{event.path}</td>
                      <td>{event.user_id ? 'Authenticated' : 'Anonymous'}</td>
                      <td>{event.browser || '—'}</td>
                      <td>{event.os || '—'}</td>
                      <td>{event.device_type || '—'}</td>
                      <td>{event.timezone || '—'}</td>
                      <td className="analytics-referrer">{event.referrer || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
