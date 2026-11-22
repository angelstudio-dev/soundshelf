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

/** 文件大小的可读格式 */
export function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(2)} ${units[index]}`;
}

/** 收听时长的紧凑显示：287 小时 55 分钟 → 287 小时 55 分钟 */
export function formatLongDuration(seconds: number): { hours: number; minutes: number } {
  const totalMinutes = Math.floor(seconds / 60);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/** 取名字首字母，用于字母索引分组 */
export function nameInitial(name: string): string {
  const clean = (name ?? '').trim();
  if (!clean) return '#';
  const first = clean[0];
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase();
  if (/[0-9]/.test(first)) return '#';
  const code = first.codePointAt(0) ?? 0;
  if (code >= 0x4e00 && code <= 0x9fa5) {
    const boundaries: [number, string][] = [
      [0x4e02, 'A'], [0x4ea5, 'B'], [0x4fa0, 'C'], [0x51cd, 'D'], [0x5490, 'E'],
      [0x54b1, 'F'], [0x59e4, 'G'], [0x63a5, 'H'], [0x67cf, 'J'], [0x6bb3, 'K'],
      [0x6d64, 'L'], [0x767c, 'M'], [0x77db, 'N'], [0x7a05, 'O'], [0x7b2e, 'P'],
      [0x7d31, 'Q'], [0x7f39, 'R'], [0x8161, 'S'], [0x84dd, 'T'], [0x855a, 'W'],
      [0x90a3, 'X'], [0x95e2, 'Y'], [0x9b27, 'Z']
    ];
    let letter = 'Z';
    for (const [boundary, value] of boundaries) if (code < boundary) { letter = value; break; }
    return letter;
  }
  return '#';
}

/** 按首字母分组，返回 { letter, items } 数组 */
export function groupByInitial<T>(items: T[], getName: (item: T) => string): { letter: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const letter = nameInitial(getName(item));
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(item);
  }
  return Array.from(groups, ([letter, group]) => ({ letter, items: group }))
    .sort((a, b) => (a.letter === '#' ? 1 : b.letter === '#' ? -1 : a.letter.localeCompare(b.letter)));
}
