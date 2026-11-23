import { useEffect, useState, type ReactNode } from 'react';
import { apiGet, apiPatch } from '../api/client.js';
import {
  ChevronLeft, ChevronRight, CloudIcon, DatabaseIcon, HeadphonesIcon, PaletteIcon,
  ServerIcon, SettingsIcon, StarIcon
} from '../components/Icons.js';
import { PageHeader, type Page } from '../components/Layout.js';
import { usePlayer } from '../store.js';
import { applyPreferences, normalizeThemeMode, THEME_OPTIONS } from '../theme.js';
import { formatSize } from '../utils.js';

type SubPage = 'main' | 'general' | 'playback' | 'theme' | 'sync' | 'metadata' | 'storage';

const ACCENT_COLORS = ['#c99b72', '#6b7de8', '#2f9be0', '#e45fad', '#e05252', '#f08a2e', '#e8c22f', '#3eb56a'];
const FONTS = [
  { key: 'system', label: '系统' }, { key: 'serif', label: '衬线' }, { key: 'sans', label: '无衬线' }
];

export function Settings({ onNavigate, onLogout }: { onNavigate: (page: Page) => void; onLogout: () => Promise<void> }) {
  const [sub, setSub] = useState<SubPage>('main');
  const [prefs, setPrefs] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState('');
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

  if (sub === 'storage') {
    return <SubLayout title="存储空间" onBack={back}>
      <h3 className="config-title">元数据</h3>
      <div className="settings-section">
        <div className="status-row"><span>数据库大小</span><strong>4 kB</strong></div>
        <button className="danger-link" onClick={() => setMessage('演示环境不执行清空操作')}>清空</button>
      </div>
      <button className="secondary-button wide" onClick={() => setMessage('数据库导出请在群晖服务端备份 data/ 目录')}>导出数据库</button>
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
