import { useEffect, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '../api/client.js';
import { ChevronRight, PlusIcon, RefreshIcon, SettingsIcon } from '../components/Icons.js';
import { PageHeader, type Page } from '../components/Layout.js';
import { usePlayer } from '../store.js';
import type { Source } from '../types.js';
import { relativeDate } from '../utils.js';

interface Preferences {
  smartRewind: boolean;
  autoRewindSeconds: number;
  autoplayNext: boolean;
}

export function Settings({ onNavigate, onLogout }: { onNavigate: (page: Page) => void; onLogout: () => Promise<void> }) {
  const [preferences, setPreferences] = useState<Preferences>({ smartRewind: true, autoRewindSeconds: 10, autoplayNext: true });
  const [sources, setSources] = useState<Source[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const player = usePlayer();

  const reloadSources = () => apiGet<{ sources: Source[] }>('/libraries')
    .then((data) => setSources(data.sources)).catch(() => undefined);

  useEffect(() => {
    apiGet<{ preferences?: Preferences }>('/settings')
      .then((data) => { if (data.preferences) setPreferences({ ...preferences, ...data.preferences }); })
      .catch(() => undefined);
    reloadSources();
  }, []);

  const update = (patch: Partial<Preferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    void apiPatch('/settings', { key: 'preferences', value: next });
  };

  return (
    <>
      <PageHeader title="设置" subtitle="偏好、书源与账户" />
      {message && <div className="notice">{message}</div>}

      <section className="settings-section">
        <h2>播放偏好</h2>
        <label className="toggle-row"><span>暂停后继续时自动回退</span>
          <input type="checkbox" checked={preferences.smartRewind} onChange={(event) => update({ smartRewind: event.target.checked })} />
        </label>
        <label className="toggle-row"><span>播完后自动播放下一本</span>
          <input type="checkbox" checked={preferences.autoplayNext} onChange={(event) => update({ autoplayNext: event.target.checked })} />
        </label>
        <label className="select-row"><span>回退时长</span>
          <select value={preferences.autoRewindSeconds} onChange={(event) => update({ autoRewindSeconds: Number(event.target.value) })}>
            <option value={5}>5 秒</option><option value={10}>10 秒</option><option value={15}>15 秒</option><option value={30}>30 秒</option>
          </select>
        </label>
      </section>

      <section className="settings-section">
        <div className="section-head"><h2>书库与书源</h2>
          <button className="icon-button" onClick={() => setShowAdd(!showAdd)}>{showAdd ? '取消' : <PlusIcon size={20} />}</button>
        </div>
        {sources.map((source) => (
          <div className="source-item" key={source.id}>
            <div>
              <strong>{source.name}</strong>
              <small>{source.type} · {source.book_count} 本书 · {source.last_synced_at ? `${relativeDate(source.last_synced_at)}同步` : '尚未同步'}</small>
            </div>
            <button className="icon-button" disabled={syncing === source.id}
              onClick={() => {
                setSyncing(source.id);
                void apiPost(`/libraries/${source.id}/sync`).then(() => {
                  setMessage('同步完成');
                  return reloadSources();
                }).catch((error) => setMessage(String(error))).finally(() => setSyncing(null));
              }}>
              <RefreshIcon size={18} />
            </button>
          </div>
        ))}
        {showAdd && <SourceForm onDone={(text) => { setMessage(text); setShowAdd(false); reloadSources(); }} />}
      </section>

      <section className="settings-section">
        <h2>数据</h2>
        <button className="link-row" onClick={() => onNavigate('stats')}><SettingsIcon size={17} /> 收听统计 <ChevronRight size={17} /></button>
        {player.book && <button className="link-row" onClick={() => player.close()}>停止当前播放</button>}
      </section>

      <section className="settings-section">
        <h2>账户</h2>
        <button className="secondary-button wide" onClick={() => void onLogout()}>退出登录</button>
        <p className="muted">SoundShelf 0.1.0 · 自托管 · MIT 许可</p>
      </section>
    </>
  );
}

function SourceForm({ onDone }: { onDone: (message: string) => void }) {
  const [form, setForm] = useState({ type: 'audiobookshelf', name: '', baseUrl: '', token: '', paths: '' });
  return (
    <form className="source-form" onSubmit={(event) => {
      event.preventDefault();
      void apiPost('/libraries', {
        type: form.type, name: form.name,
        baseUrl: form.baseUrl, token: form.token,
        paths: form.paths.split(',').map((item) => item.trim()).filter(Boolean)
      }).then(() => onDone('书源已添加，请点击同步')).catch((error) => onDone(String(error)));
    }}>
      <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
        <option value="audiobookshelf">Audiobookshelf</option>
        <option value="plex">Plex</option>
        <option value="local">本地目录</option>
      </select>
      <input required placeholder="名称" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      {form.type !== 'local' && <>
        <input required placeholder="服务器地址，如 https://abs.example.com" value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />
        <input required placeholder="API Token" value={form.token} onChange={(event) => setForm({ ...form, token: event.target.value })} />
      </>}
      {form.type === 'local' && <input required placeholder="容器内路径，多个用逗号分隔" value={form.paths} onChange={(event) => setForm({ ...form, paths: event.target.value })} />}
      <button className="primary-button" type="submit">添加书源</button>
    </form>
  );
}
