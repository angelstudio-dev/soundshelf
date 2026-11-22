import { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../api/client.js';
import { CheckIcon, ChevronLeft, LockIcon, PlusIcon, RefreshIcon, ServerIcon, TrashIcon } from '../components/Icons.js';
import { PageHeader } from '../components/Layout.js';
import type { PlexOAuthSession, PlexOAuthStatus, PlexServer, Source, SourceLibrary } from '../types.js';
import { relativeDate } from '../utils.js';

type Step = 'list' | 'choose-type' | 'credentials' | 'oauth' | 'servers' | 'libraries';

export function Servers({ onBack }: { onBack: () => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [step, setStep] = useState<Step>('list');
  const [type, setType] = useState<'plex' | 'audiobookshelf'>('plex');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [session, setSession] = useState<PlexOAuthSession | null>(null);
  const [servers, setServers] = useState<PlexServer[]>([]);
  const [selectedServer, setSelectedServer] = useState('');
  const [manualServerUrl, setManualServerUrl] = useState('');
  const [authOrigin, setAuthOrigin] = useState<'manual' | 'oauth'>('manual');
  const [libraries, setLibraries] = useState<SourceLibrary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copyHint, setCopyHint] = useState('');

  const reload = () => apiGet<{ sources: Source[] }>('/libraries')
    .then((data) => setSources(data.sources)).catch(() => undefined);

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (step !== 'oauth' || !session) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await apiGet<PlexOAuthStatus>(
          `/plex/oauth/check?pinId=${encodeURIComponent(session.pinId)}`
        );
        if (cancelled) return;
        if (status.status === 'complete') {
          setToken(status.token);
          setServers(status.servers);
          const first = status.servers.find((server) => server.reachable && server.baseUrl)
            ?? status.servers[0];
          setSelectedServer(first?.baseUrl ?? '');
          setManualServerUrl(first?.baseUrl ?? '');
          setMessage('');
          setStep('servers');
          return;
        }
        if (status.status === 'expired') {
          setMessage('登录码已过期，请重新获取登录码');
          setSession(null);
          return;
        }
        setMessage('等待在 Plex 页面完成授权…');
      } catch {
        // 轮询中的瞬时网络错误不打断流程。
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [step, session]);

  const startOAuth = async () => {
    setType('plex'); setName('Plex'); setAuthOrigin('oauth');
    setSession(null); setServers([]); setToken(''); setBaseUrl(''); setCopyHint('');
    setStep('oauth'); setMessage('正在获取 Plex 登录码…');
    try {
      const data = await apiPost<PlexOAuthSession>('/plex/oauth/start');
      setSession(data);
      setMessage('');
    } catch (error) {
      setMessage(`发起登录失败：${String(error)}`);
    }
  };

  const probeLibraries = async (url: string, accessToken: string) => {
    if (!url || !accessToken) { setMessage('请选择服务器并确认令牌'); return; }
    const normalized = url.replace(/\/$/, '');
    setBusy(true); setMessage('');
    try {
      const data = await apiPost<{ libraries: SourceLibrary[] }>('/libraries/probe', {
        type, baseUrl: normalized, token: accessToken
      });
      setBaseUrl(normalized);
      setLibraries(data.libraries);
      setSelected(new Set(data.libraries.map((lib) => lib.key)));
      setStep('libraries');
    } catch (error) {
      setMessage(`连接失败：${String(error)}`);
    } finally { setBusy(false); }
  };

  const probeManual = async () => {
    if (!baseUrl || !token) { setMessage('请填写服务器地址和令牌'); return; }
    setAuthOrigin('manual');
    await probeLibraries(baseUrl, token);
  };

  const probeSelectedServer = async () => {
    const url = manualServerUrl.trim() || selectedServer;
    await probeLibraries(url, token);
  };

  const copyText = async (text: string, hint: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopyHint(hint);
    } catch {
      setCopyHint('复制失败，请手动选中文本');
    }
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
      setSession(null); setToken('');
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
          <button className="link-row" onClick={() => void startOAuth()}>
            <ServerIcon size={19} /><span><strong>Plex 媒体服务器</strong><small>使用 Plex 账户登录，无需复制令牌</small></span>
          </button>
          <button className="link-row" onClick={() => {
            setType('plex'); setName('Plex'); setAuthOrigin('manual'); setStep('credentials');
          }}>
            <LockIcon size={19} /><span><strong>已有 Plex 令牌（高级）</strong><small>手动填写服务器地址和访问令牌</small></span>
          </button>
          <button className="link-row" onClick={() => {
            setType('audiobookshelf'); setName('Audiobookshelf'); setAuthOrigin('manual'); setStep('credentials');
          }}>
            <ServerIcon size={19} /><span><strong>Audiobookshelf</strong><small>自托管有声书服务器</small></span>
          </button>
        </div>
        <p className="muted">Plex 推荐使用账户登录：在授权页面确认后，SoundShelf 会自动获取可访问的服务器与资料库。</p>
      </>
    );
  }

  if (step === 'oauth') {
    return (
      <>
        <button className="back-button" onClick={() => setStep('choose-type')}><ChevronLeft size={20} /> 选择类型</button>
        <PageHeader title="Plex 账户登录" subtitle="授权后自动继续" />
        {message && <div className="notice">{message}</div>}
        <div className="settings-section oauth-card">
          {session ? (
            <>
              <p className="muted">在浏览器打开授权页面并确认「允许访问」：</p>
              <a className="primary-button wide oauth-link" href={session.authUrl} target="_blank" rel="noreferrer">
                打开 Plex 授权页面
              </a>
              <p className="muted">或访问 <a href={session.linkUrl} target="_blank" rel="noreferrer">plex.tv/link</a> 并输入下方验证码：</p>
              <div className="pin-code">{session.code}</div>
              <div className="oauth-actions">
                <button className="secondary-button" onClick={() => void copyText(session.code, '验证码已复制')}>
                  复制验证码
                </button>
                <button className="secondary-button" onClick={() => void copyText(session.authUrl, '授权链接已复制')}>
                  复制授权链接
                </button>
              </div>
              {copyHint && <p className="muted">{copyHint}</p>}
              <p className="muted">授权码 30 分钟内有效；完成授权后此页面会自动进入下一步。</p>
            </>
          ) : (
            <button className="primary-button wide" disabled={busy} onClick={() => void startOAuth()}>
              重新获取登录码
            </button>
          )}
        </div>
      </>
    );
  }

  if (step === 'servers') {
    return (
      <>
        <button className="back-button" onClick={() => setStep('choose-type')}><ChevronLeft size={20} /> 选择类型</button>
        <PageHeader title="选择 Plex 服务器" subtitle="账户下可访问的媒体服务器" />
        {message && <div className="notice">{message}</div>}
        <div className="settings-section">
          {servers.map((server) => {
            const active = selectedServer === server.baseUrl && !manualServerUrl.trim();
            return (
              <button key={server.machineIdentifier || server.name} className="library-row" onClick={() => {
                setSelectedServer(server.baseUrl);
                setManualServerUrl('');
              }}>
                <span>
                  <strong>{server.name}</strong>
                  <small>{server.baseUrl || '未发现可达地址'} · {server.version || '未知版本'} · {server.owned ? '所有者' : '共享'}{server.reachable ? '' : ' · 请检查地址'}</small>
                </span>
                <span className={`mini-switch ${active ? 'on' : ''}`}>{active && <CheckIcon size={13} />}</span>
              </button>
            );
          })}
          {!servers.length && <p className="empty-hint">账户下没有发现可用的 Plex Media Server，请手动填写地址。</p>}
          <label className="field-label">服务器地址（自动发现失败时填写）</label>
          <input className="field-input" placeholder="https://plex.example.com:32400"
            value={manualServerUrl} onChange={(e) => setManualServerUrl(e.target.value)} />
        </div>
        <button className="primary-button wide" disabled={busy || !(manualServerUrl.trim() || selectedServer)}
          onClick={() => void probeSelectedServer()}>
          {busy ? '正在读取资料库…' : '继续 · 读取资料库'}
        </button>
      </>
    );
  }

  if (step === 'credentials') {
    return (
      <>
        <button className="back-button" onClick={() => setStep('choose-type')}><ChevronLeft size={20} /> 选择类型</button>
        <PageHeader title={type === 'plex' ? 'Plex（手动）' : 'Audiobookshelf'} />
        {message && <div className="notice">{message}</div>}
        <div className="settings-section">
          <label className="field-label">服务器地址</label>
          <input className="field-input" placeholder="https://media.example.com:32400" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <label className="field-label">访问令牌</label>
          <input className="field-input" placeholder="X-Plex-Token 或 API Token" value={token} onChange={(e) => setToken(e.target.value)} />
          <label className="field-label">自定义标题（可选）</label>
          <input className="field-input" placeholder={name} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary-button wide" disabled={busy} onClick={() => void probeManual()}>
            {busy ? '正在连接…' : '连接并读取资料库'}
          </button>
        </div>
        {type === 'plex' && (
          <p className="muted">更推荐返回上一步使用 Plex 账户登录，无需手动查找令牌。</p>
        )}
      </>
    );
  }

  return (
    <>
      <button className="back-button" onClick={() => setStep(authOrigin === 'oauth' ? 'servers' : 'credentials')}>
        <ChevronLeft size={20} /> {authOrigin === 'oauth' ? '选择服务器' : '服务器信息'}
      </button>
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
