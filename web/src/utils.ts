export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

export function formatShortDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours >= 10) return `${Math.round(seconds / 3600)} 小时`;
  if (hours > 0) return `${hours} 小时 ${Math.round((seconds % 3600) / 60)} 分`;
  return `${Math.round(seconds / 60)} 分钟`;
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return '未知';
  return new Date(timestamp * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function relativeDate(timestamp: number): string {
  if (!timestamp) return '未知';
  const days = Math.floor((Date.now() / 1000 - timestamp) / 86400);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return formatDate(timestamp);
}

export function progressPercent(book: { duration: number; progress?: { position: number } | null }): number {
  if (!book.duration || !book.progress) return 0;
  return Math.min(100, Math.round((book.progress.position / book.duration) * 100));
}
