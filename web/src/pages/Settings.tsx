import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { apiDownload, apiGet, apiPatch, apiPost } from '../api/client.js';
import {
  ChevronLeft, ChevronRight, CloudIcon, DatabaseIcon, DownloadIcon, HeadphonesIcon, PaletteIcon,
  ServerIcon, SettingsIcon, StarIcon, UploadCloudIcon, XIcon
} from '../components/Icons.js';
import { PageHeader, type Page } from '../components/Layout.js';
import { usePlayer } from '../store.js';
import { applyPreferences, normalizeThemeMode, THEME_OPTIONS } from '../theme.js';
import { formatSize } from '../utils.js';

type SubPage = 'main' | 'general' | 'playback' | 'theme' | 'sync' | 'metadata' | 'storage' | 'backup';

interface RestoreResult {
  restored: { progress: number; bookmarks: number; sessions: number; settings: number };
  skipped: { progress: number; bookmarks: number; sessions: number };
}

const ACCENT_COLORS = ['#c99b72', '#6b7de8', '#2f9be0', '#e45fad', '#e05252', '#f08a2e', '#e8c22f', '#3eb56a'];
const FONTS = [
  { key: 'system', label: '系统' }, { key: 'serif', label: '衬线' }, { key: 'sans', label: '无衬线' }
];

export function Settings({ onNavigate, onLogout }: { onNavigate: (page: Page) => void; onLogout: () => Promise<void> }) {
  const [sub, setSub] = useState<SubPage>('main');
  const [prefs, setPrefs] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState('');
  const [pendingRestore, setPendingRestore] = useState<{ fileName: string; payload: unknown } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const player = usePlayer();

  useEffect(() => {
    apiGet<Record<string, unknown>>('/settings')
      .then((loaded) => { setPrefs(loaded); applyPreferences(loaded); })
      .catch(() => undefined);
  }, []);

  const set = (key: string, value: unknown) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    applyPreferences(next);
    void apiPatch('/settings', { key, value });
  };

  const downloadBackup = async () => {
    try {
      const { blob, filename } = await apiDownload('/backup');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename ?? 'soundshelf-backup.json';
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('备份文件已下载，请妥善保存');
    } catch {
      setMessage('备份下载失败，请重试');
    }
  };

  const onRestoreFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { app?: string; formatVersion?: number } | null;
      if (!parsed || parsed.app !== 'soundshelf' || parsed.formatVersion !== 1) {
        setMessage('所选文件不是有效的 SoundShelf 备份');
        return;
      }
      setPendingRestore({ fileName: file.name, payload: parsed });
    } catch {
      setMessage('所选文件不是有效的备份文件');
    }
  };

  const confirmRestore = async () => {
    if (!pendingRestore || restoring) return;
    setRestoring(true);
    try {
      const result = await apiPost<RestoreResult>('/backup/restore', pendingRestore.payload);
      setPendingRestore(null);
      const skipped = result.skipped.progress + result.skipped.bookmarks + result.skipped.sessions;
      setMessage(`恢复完成：进度 ${result.restored.progress} 条、书签 ${result.restored.bookmarks} 条、`
        + `收听历史 ${result.restored.sessions} 条、设置 ${result.restored.settings} 项`
        + (skipped > 0 ? `；${skipped} 条因书籍不在当前书库中已跳过` : ''));
      const loaded = await apiGet<Record<string, unknown>>('/settings').catch(() => null);
      if (loaded) { setPrefs(loaded); applyPreferences(loaded); }
      await player.refreshBookmarks().catch(() => undefined);
    } catch (error) {
      setPendingRestore(null);
      setMessage(`恢复失败：${error instanceof Error ? error.message : '请重试'}`);
    } finally {
      setRestoring(false);
    }
  };

  const accent = (prefs.accent as string) || ACCENT_COLORS[0];
  const themeMode = normalizeThemeMode(prefs.theme);

  const back = () => setSub('main');
  const numPref = (key: string, fallback: number): number => {
    const value = prefs[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };

  if (sub === 'general') {
    return <SubLayout title="通用" onBack={back}>
      <Toggle label="数据库自动刷新" value={prefs.autoRefresh !== false} onChange={(v) => set('autoRefresh', v)} />
      <Toggle label="减少振动" value={Boolean(prefs.reduceHaptics)} onChange={(v) => set('reduceHaptics', v)} />
      <p className="muted">启用时，应用将不定期地查找资源库的新增内容。</p>
    </SubLayout>;
  }

  if (sub === 'playback') {
    return <SubLayout title="播放" onBack={back}>
      <Toggle label="智能回退" value={prefs.smartRewind !== false} onChange={(v) => set('smartRewind', v)} />
      <Toggle label="播完后自动播放下一本" value={prefs.autoplayNext !== false} onChange={(v) => set('autoplayNext', v)} />
      <div className="select-row"><span>回退时长</span>
        <select value={String(prefs.rewindSeconds ?? 10)} onChange={(e) => set('rewindSeconds', Number(e.target.value))}>
          <option value="5">5 秒</option><option value="10">10 秒</option><option value="15">15 秒</option><option value="30">30 秒</option>
        </select>
      </div>
      {player.book && <button className="link-row" onClick={() => player.close()}>停止当前播放</button>}
    </SubLayout>;
  }

  if (sub === 'theme') {
    return <SubLayout title="主题" onBack={back}>
      <h3 className="config-title">外观</h3>
      <div className="theme-options" role="radiogroup" aria-label="外观">
        {THEME_OPTIONS.map((option) => (
          <button key={option.key} type="button" role="radio" aria-checked={themeMode === option.key}
            className={`theme-option ${themeMode === option.key ? 'selected' : ''}`}
            onClick={() => set('theme', option.key)}>
            <span className={`theme-preview ${option.key}`} aria-hidden="true"><i /><i /></span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      <p className="muted">选择「跟随系统」时，外观会随设备的深浅色设置自动切换。</p>
      <div className="select-row"><span>字体样式</span>
        <select value={(prefs.fontStyle as string) || 'serif'} onChange={(e) => set('fontStyle', e.target.value)}>
          {FONTS.map((font) => <option key={font.key} value={font.key}>{font.label}</option>)}
        </select>
      </div>
      <h3 className="config-title">主题颜色</h3>
      <div className="color-grid">
        {ACCENT_COLORS.map((color) => (
          <button key={color} className={`color-dot ${accent === color ? 'selected' : ''}`}
            style={{ backgroundColor: color }} onClick={() => set('accent', color)} aria-label={color} />
        ))}
      </div>
      <p className="muted">主题颜色会立即应用到整个界面。</p>
    </SubLayout>;
  }

  if (sub === 'sync') {
    return <SubLayout title="云同步" onBack={back}>
      <Toggle label="多设备同步" value={prefs.cloudSync !== false} onChange={(v) => set('cloudSync', v)} />
      <p className="muted">播放进度、播放列表、书签与历史记录保存在自托管服务器上，登录同一账号即可跨设备同步。</p>
      <h3 className="config-title">状态</h3>
      <div className="settings-section">
        <div className="status-row"><span>账户</span><i className="green-dot" /></div>
        <div className="status-row"><span>连接</span><i className="green-dot" /></div>
        <div className="status-row"><span>空间配额</span><i className="green-dot" /></div>
      </div>
      <button className="secondary-button wide" onClick={() => { void apiGet('/progress').then(() => setMessage('同步完成')).catch(() => setMessage('同步失败')); }}>
        立即同步
      </button>
      {message && <div className="notice">{message}</div>}
    </SubLayout>;
  }

  if (sub === 'metadata') {
    return <SubLayout title="元数据" onBack={back}>
      <Toggle label="读取内嵌元数据" value={prefs.embeddedMetadata !== false} onChange={(v) => set('embeddedMetadata', v)} />
      <p className="muted"> SoundShelf 可以从 M4B 和 MP3 文件读取内嵌的章节和演播者数据。</p>
      <div className="settings-section"><div className="status-row"><span>有声书元数据</span><strong>{numPref('metadataProgress', 0)}%</strong></div></div>
      <p className="muted">详细的有声书信息会按需获取，或由系统在后台获取。</p>
      <button className="secondary-button wide" onClick={() => {
        void apiPostSync().then(() => setMessage('已触发刷新')).catch((error) => setMessage(String(error)));
      }}>立即刷新</button>
      {message && <div className="notice">{message}</div>}
    </SubLayout>;
  }

  if (sub === 'backup') {
    return <SubLayout title="数据备份" onBack={back}>
      <p className="muted">备份当前账号的播放进度、书签与笔记、全部设置（含每本书的播放偏好与播放清单）和收听历史，保存为一个 JSON 文件。不包含书库与音频文件本身。</p>
      <h3 className="config-title">备份</h3>
      <button className="secondary-button wide" onClick={() => void downloadBackup()}>
        <DownloadIcon size={17} /> 导出备份
      </button>
      <h3 className="config-title">恢复</h3>
      <p className="muted">从备份文件恢复会<b>替换</b>当前账号的上述数据，无法撤销。恢复只影响你自己的账号。</p>
      <input ref={restoreInputRef} type="file" accept=".json,application/json" hidden onChange={(event) => void onRestoreFile(event)} />
      <button className="secondary-button wide" onClick={() => restoreInputRef.current?.click()}>
        <UploadCloudIcon size={17} /> 选择备份文件恢复
      </button>
      {message && <div className="notice">{message}</div>}
      {pendingRestore && (
        <div className="sheet-backdrop" onClick={() => !restoring && setPendingRestore(null)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-header"><strong>恢复备份</strong>
              <button className="icon-button" onClick={() => setPendingRestore(null)} disabled={restoring}><XIcon size={20} /></button>
            </div>
            <p className="muted">确定要用「{pendingRestore.fileName}」恢复吗？当前账号的播放进度、书签、设置与收听历史将被备份内容替换，此操作无法撤销。</p>
            <div className="sheet-actions">
              <button className="secondary-button" onClick={() => setPendingRestore(null)} disabled={restoring}>取消</button>
              <button className="primary-button" onClick={() => void confirmRestore()} disabled={restoring}>
                {restoring ? '恢复中…' : '确认恢复'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SubLayout>;
  }

  if (sub === 'storage') {
    return <SubLayout title="存储空间" onBack={back}>
      <h3 className="config-title">元数据</h3>
      <div className="settings-section">
        <div className="status-row"><span>数据库大小</span><strong>4 kB</strong></div>
        <button className="danger-link" onClick={() => setMessage('演示环境不执行清空操作')}>清空</button>
      </div>
      <button className="secondary-button wide" onClick={() => setSub('backup')}>导出备份</button>
      <Toggle label="备份中包含下载" value={Boolean(prefs.backupDownloads)} onChange={(v) => set('backupDownloads', v)} />
      <h3 className="config-title">图片缓存</h3>
      <div className="settings-section">
        <div className="status-row"><span>大小</span><strong>{formatSize(numPref('cacheBytes', 0)) || '1.8 MB'}</strong></div>
        <div className="status-row"><span>上限 200 MB</span>
          <span className="stepper"><button onClick={() => set('cacheLimit', Math.max(50, numPref('cacheLimit', 200) - 50))}>−</button>
            <b>{numPref('cacheLimit', 200)} MB</b>
            <button onClick={() => set('cacheLimit', Math.min(1000, numPref('cacheLimit', 200) + 50))}>＋</button></span>
        </div>
        <button className="danger-link" onClick={() => { localStorage.removeItem('ss-downloaded'); setMessage('本地缓存已清除'); }}>清除缓存</button>
      </div>
      {message && <div className="notice">{message}</div>}
    </SubLayout>;
  }

  return (
    <>
      <PageHeader title="设置" subtitle="偏好、服务器与数据" />
      <button className="premium-banner" onClick={() => setMessage('自托管版本已包含全部功能，无需订阅')}>
        <StarIcon size={20} /> <span><strong>解锁高级版</strong><small>自托管版本已全部开放</small></span> <ChevronRight size={18} />
      </button>
      {message && <div className="notice">{message}</div>}

      <h3 className="config-title">界面</h3>
      <div className="settings-section">
        <button className="link-row" onClick={() => setSub('general')}><SettingsIcon size={18} /> 通用 <ChevronRight size={17} /></button>
        <button className="link-row" onClick={() => setSub('playback')}><HeadphonesIcon size={18} /> 播放 <ChevronRight size={17} /></button>
        <button className="link-row" onClick={() => setSub('theme')}><PaletteIcon size={18} /> 主题
          <span className="row-value">{THEME_OPTIONS.find((option) => option.key === themeMode)?.label}</span>
          <span className="accent-preview" style={{ backgroundColor: accent }} /> <ChevronRight size={17} /></button>
      </div>

      <h3 className="config-title">高级</h3>
      <div className="settings-section">
        <button className="link-row" onClick={() => setSub('sync')}><CloudIcon size={18} /> 云同步 <ChevronRight size={17} /></button>
        <button className="link-row" onClick={() => setSub('metadata')}><DatabaseIcon size={18} /> 元数据 <ChevronRight size={17} /></button>
        <button className="link-row" onClick={() => setSub('storage')}><DatabaseIcon size={18} /> 存储 <ChevronRight size={17} /></button>
        <button className="link-row" onClick={() => setSub('backup')}><DownloadIcon size={18} /> 数据备份 <ChevronRight size={17} /></button>
        <button className="link-row" onClick={() => onNavigate('servers')}><ServerIcon size={18} /> 服务器 <ChevronRight size={17} /></button>
        <button className="link-row" onClick={() => onNavigate('stats')}><HeadphonesIcon size={18} /> 收听统计 <ChevronRight size={17} /></button>
      </div>

      <div className="settings-section">
        <button className="secondary-button wide" onClick={() => void onLogout()}>退出登录</button>
        <p className="muted">SoundShelf 0.1.0 · 自托管 · MIT 许可</p>
      </div>
    </>
  );
}

function SubLayout({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <>
      <button className="back-button" onClick={onBack}><ChevronLeft size={20} /> 设置</button>
      <PageHeader title={title} />
      {children}
    </>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <label className="toggle-row"><span>{label}</span>
    <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function apiPostSync(): Promise<unknown> {
  // 触发后台同步队列（若配置了书源）
  return apiPatch('/settings', { key: 'metadataRefreshedAt', value: Date.now() });
}
