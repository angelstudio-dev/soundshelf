import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';
import { PageHeader } from '../components/Layout.js';
import type { Stats as StatsType } from '../types.js';
import { formatDuration, formatShortDuration } from '../utils.js';

export function StatsPage() {
  const [stats, setStats] = useState<StatsType | null>(null);
  useEffect(() => { apiGet<StatsType>('/stats').then(setStats).catch(() => undefined); }, []);
  const max = Math.max(1, ...(stats?.daily.map((day) => day.seconds) ?? [1]));

  return (
    <>
      <PageHeader title="收听统计" subtitle="你的聆听记录" />
      <section className="stats-grid four">
        <div className="stat-card"><span>累计收听</span><strong>{formatShortDuration(stats?.totalSeconds ?? 0)}</strong></div>
        <div className="stat-card"><span>本周</span><strong>{formatShortDuration(stats?.weekSeconds ?? 0)}</strong></div>
        <div className="stat-card"><span>收听天数</span><strong>{stats?.listeningDays ?? 0} 天</strong></div>
        <div className="stat-card"><span>已读完</span><strong>{stats?.finishedBooks ?? 0} 本</strong></div>
      </section>
      <section className="chart-section">
        <h2>最近 30 天</h2>
        <div className="bar-chart">
          {stats?.daily.map((day) => (
            <div className="bar-column" key={day.date} title={`${day.date} · ${formatDuration(day.seconds)}`}>
              <span style={{ height: `${Math.max(2, (day.seconds / max) * 100)}%` }} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
