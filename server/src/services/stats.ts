import { db } from '../db.js';
import type { Stats } from '../types.js';

const dayKey = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(0, 10);

export function getStats(userId: string): Stats {
  const sessions = db.prepare('SELECT started_at, seconds FROM sessions WHERE user_id = ?').all(userId) as
    { started_at: number; seconds: number }[];
  const byDay = new Map<string, number>();
  let totalSeconds = 0;
  for (const session of sessions) {
    const key = dayKey(session.started_at);
    const seconds = Number(session.seconds) || 0;
    totalSeconds += seconds;
    byDay.set(key, (byDay.get(key) ?? 0) + seconds);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = today.getTime() / 1000 - 6 * 86400;
  const weekSeconds = sessions.filter((s) => s.started_at >= weekStart).reduce((sum, s) => sum + s.seconds, 0);

  let streak = 0;
  const cursor = new Date(today);
  if (!byDay.has(dayKey(cursor.getTime() / 1000))) cursor.setDate(cursor.getDate() - 1);
  while (byDay.has(dayKey(cursor.getTime() / 1000))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const daily = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (29 - index));
    const key = dayKey(date.getTime() / 1000);
    return { date: key, seconds: Math.round(byDay.get(key) ?? 0) };
  });

  const finishedBooks = (db.prepare(`SELECT COUNT(*) AS count FROM progress WHERE user_id = ? AND finished = 1`)
    .get(userId) as { count: number }).count;

  return {
    totalSeconds: Math.round(totalSeconds),
    weekSeconds: Math.round(weekSeconds),
    listeningDays: byDay.size,
    streak,
    finishedBooks,
    daily
  };
}
