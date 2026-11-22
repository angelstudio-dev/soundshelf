import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../api/client.js';
import { ChevronLeft, CheckIcon, PlusIcon, RefreshIcon, ServerIcon, TrashIcon } from '../components/Icons.js';
import { PageHeader } from '../components/Layout.js';
import type { Source, SourceLibrary } from '../types.js';
import { relativeDate } from '../utils.js';

type Step = 'list' | 'choose-type' | 'credentials' | 'libraries';

export function Servers({ onBack }: { onBack: () => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [step, setStep] = useState<Step>('list');
  const [type, setType] = useState<'plex' | 'audiobookshelf'>('plex');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [libraries, setLibraries] = useState<SourceLibrary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const reload = () => apiGet<{ sources: Source[] }>('/libraries')
    .then((data) => setSources(data.sources)).catch(() => undefined);

  useEffect(() => { reload(); }, []);

  const probe = async () => {
    if (!baseUrl || !token) { setMessage('请填写服务器地址和令牌'); return; }
    setBusy(true); setMessage('');
    try {
      const data = await apiPost<{ libraries: SourceLibrary[] }>('/libraries/probe', { type, baseUrl, token });
      setLibraries(data.libraries);
      setSelected(new Set(data.libraries.map((lib) => lib.key)));
      setStep('libraries');
    } catch (error) {
      setMessage(`连接失败：${String(error)}`);
    } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setMessage('');
    try {
      await apiPost('/libraries', {
        type, name: name || (type === 'plex' ? 'Plex' : 'Audiobookshelf'),
        baseUrl, token, libraryIds: [...selected]
      });
      setMessage('服务器已添加，可在列表中选择同步');
      setStep('list');
      reload();
    } catch (error) {
      setMessage(`保存失败：${String(error)}`);
    } finally { setBusy(false); }
  };

  if (step === 'list') {
    return (
      <>
        <button className="back-button" onClick={onBack}><ChevronLeft size={20} /> 设置</button>
        <PageHeader title="服务器" subtitle={`${sources.length} 个已配置`} />
        {message && <div className="notice">{message}</div>}
        {!sources.length && <div className="info-banner"><strong>没有可用的服务器</strong><span>添加服务器以开始操作。</span></div>}
        <div className="settings-section">
          {sources.map((source) => (
            <div className="source-item" key={source.id}>
              <div><strong>{source.name}</strong>
                <small>{source.type} · {source.book_count} 本书 · {source.last_synced_at ? `${relativeDate(source.last_synced_at)}同步` : '尚未同步'}</small></div>
              <div className="source-actions">
                <button className="icon-button" disabled={busy} onClick={() => {
                  setBusy(true);
                  void apiPost(`/libraries/${source.id}/sync`).then(() => { setMessage('同步完成'); reload(); })
                    .catch((error) => setMessage(String(error))).finally(() => setBusy(false));
                }}><RefreshIcon size={18} /></button>
                <button className="icon-button" onClick={() => {
                  void apiDelete(`/libraries/${source.id}`).then(reload);
                }}><TrashIcon size={17} /></button>
              </div>
            </div>
          ))}
        </div>
        <button className="secondary-button wide" onClick={() => setStep('choose-type')}>
          <PlusIcon size={17} /> 添加服务器
        </button>
      </>
    );
  }

  if (step === 'choose-type') {
    return (
      <>
        <button className="back-button" onClick={() => setStep('list')}><ChevronLeft size={20} /> 服务器</button>
        <PageHeader title="添加服务器" />
        <div className="settings-section">
          <button className="link-row" onClick={() => { setType('plex'); setName('Plex'); setStep('credentials'); }}>
            <ServerIcon size={19} /><span><strong>Plex 媒体服务器</strong><small>连接 Plex 账户</small></span>
          </button>
          <button className="link-row" onClick={() => { setType('audiobookshelf'); setName('Audiobookshelf'); setStep('credentials'); }}>
            <ServerIcon size={19} /><span><strong>Audiobookshelf</strong><small>自托管有声书服务器</small></span>
          </button>
        </div>
        <p className="muted">SoundShelf 自托管版使用服务器地址 + 访问令牌连接，无需第三方登录跳转。</p>
      </>
    );
  }

  if (step === 'credentials') {
    return (
      <>
        <button className="back-button" onClick={() => setStep('choose-type')}><ChevronLeft size={20} /> 选择类型</button>
        <PageHeader title={type === 'plex' ? 'Plex' : 'Audiobookshelf'} />
        {message && <div className="notice">{message}</div>}
        <div className="settings-section">
          <label className="field-label">服务器地址</label>
          <input className="field-input" placeholder="https://media.example.com:32400" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <label className="field-label">访问令牌</label>
          <input className="field-input" placeholder="X-Plex-Token 或 API Token" value={token} onChange={(e) => setToken(e.target.value)} />
          <label className="field-label">自定义标题（可选）</label>
          <input className="field-input" placeholder={name} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary-button wide" disabled={busy} onClick={() => void probe()}>
            {busy ? '正在连接…' : '连接并读取资料库'}
          </button>
        </div>
        <p className="muted">Plex 令牌：Plex Web → 设置 → 账户 → 已订阅设备，或查看播放地址中的 X-Plex-Token 参数。</p>
      </>
    );
  }

  return (
    <>
      <button className="back-button" onClick={() => setStep('credentials')}><ChevronLeft size={20} /> 服务器信息</button>
      <PageHeader title="资料库" subtitle="选择一个或多个库" />
      {message && <div className="notice">{message}</div>}
      <div className="settings-section">
        {libraries.map((lib) => {
          const active = selected.has(lib.key);
          return (
            <button key={lib.key} className="library-row" onClick={() => {
              const next = new Set(selected);
              if (active) next.delete(lib.key); else next.add(lib.key);
              setSelected(next);
            }}>
              <span>{lib.title}</span>
              <span className={`mini-switch ${active ? 'on' : ''}`}>{active && <CheckIcon size={13} />}</span>
            </button>
          );
        })}
        {!libraries.length && <p className="empty-hint">没有检测到可用资料库</p>}
      </div>
      <button className="primary-button wide" disabled={busy || !selected.size} onClick={() => void save()}>
        {busy ? '正在保存…' : `继续 · 已选 ${selected.size} 个库`}
      </button>
    </>
  );
}
