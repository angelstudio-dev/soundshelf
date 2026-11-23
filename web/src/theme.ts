import { useEffect, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
  { key: 'system', label: '跟随系统' }
];

const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#f7f4ef', dark: '#111112' };
const THEME_EVENT = 'soundshelf:themechange';

let systemQuery: MediaQueryList | null = null;
let systemListener: (() => void) | null = null;

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'dark';
}

/** 把 `跟随系统` 解析成实际生效的主题。 */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** 应用主题，并在 `跟随系统` 时监听系统外观变化。返回实际生效的主题。 */
export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);

  if (systemQuery && systemListener) {
    systemQuery.removeEventListener('change', systemListener);
    systemQuery = null;
    systemListener = null;
  }
  if (mode === 'system' && window.matchMedia) {
    systemQuery = window.matchMedia('(prefers-color-scheme: light)');
    systemListener = () => applyTheme('system');
    systemQuery.addEventListener('change', systemListener);
  }

  window.dispatchEvent(new CustomEvent<ResolvedTheme>(THEME_EVENT, { detail: resolved }));
  return resolved;
}

function withAlpha(color: string, alpha: number): string {
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  let hex = match[1];
  if (hex.length === 3) hex = hex.split('').map((char) => char + char).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 一次性应用主题、主题色与字体偏好。 */
export function applyPreferences(prefs: Record<string, unknown>): ResolvedTheme {
  const accent = typeof prefs.accent === 'string' && prefs.accent.trim() ? prefs.accent.trim() : '#c99b72';
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-soft', withAlpha(accent, 0.22));
  root.dataset.font = typeof prefs.fontStyle === 'string' ? prefs.fontStyle : 'serif';
  return applyTheme(normalizeThemeMode(prefs.theme));
}

/** 订阅当前实际生效的主题（浅色 / 深色）。 */
export function useResolvedTheme(): ResolvedTheme {
  const read = (): ResolvedTheme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const [theme, setTheme] = useState<ResolvedTheme>(read);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ResolvedTheme>).detail;
      setTheme(detail === 'light' ? 'light' : 'dark');
    };
    window.addEventListener(THEME_EVENT, onChange);
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      window.removeEventListener(THEME_EVENT, onChange);
      observer.disconnect();
    };
  }, []);

  return theme;
}
