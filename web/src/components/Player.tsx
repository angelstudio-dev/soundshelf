import { useEffect, useState, type ReactNode } from 'react';
import { api, apiDelete, apiPost } from '../api/client.js';
import { usePlayer, type SleepTimerMode } from '../store.js';
import type { Chapter, Transcript } from '../types.js';
import { formatTime, relativeDate } from '../utils.js';
import {
  BookmarkIcon, BookOpenIcon, CheckIcon, ChevronDown, ClockIcon, EqualizerIcon, ForwardIcon,
  ListIcon, MoreIcon, PauseIcon, PlayIcon, RewindIcon, SkipBackIcon, SkipForwardIcon, SpeedIcon,
  TrashIcon, VolumeIcon, XIcon
} from './Icons.js';

type Tab = 'now' | 'chapters' | 'bookmarks' | 'transcript';

export function Player({ onClose }: { onClose: () => void }) {
  const player = usePlayer();
  const [tab, setTab] = useState<Tab>('now');
  const [speedOpen, setSpeedOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [introDraft, setIntroDraft] = useState(0);
  const [outroDraft, setOutroDraft] = useState(0);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [voiceBoost, setVoiceBoost] = useState(false);
  const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 });

  const book = player.book;
  const chapterIndex = book?.chapters.findIndex((item: Chapter) =>
    player.position >= item.start && player.position < item.start + item.duration) ?? -1;
  const chapter = chapterIndex >= 0 ? book!.chapters[chapterIndex] : null;

  useEffect(() => {
    if (tab !== 'transcript' || !book) return;
    api<Transcript>(`/transcript/${book.id}`).then(setTranscript).catch(() => setTranscript(null));
  }, [tab, book?.id]);

  useEffect(() => {
    player.applyAudioSettings({ voiceBoost, ...eq });
  }, [voiceBoost, eq, player.applyAudioSettings]);

  useEffect(() => {
    if (skipOpen) {
      setIntroDraft(player.skipSettings.introSkipSeconds);
      setOutroDraft(player.skipSettings.outroSkipSeconds);
    }
  }, [skipOpen, player.skipSettings]);

  if (!book) return null;

  const currentChapterStart = chapter?.start ?? 0;
  const inChapter = Math.max(0, player.position - currentChapterStart);

  return (
    <div className="player-overlay">
      <div className="player-header">
        <button className="icon-button" onClick={onClose} aria-label="收起播放器"><ChevronDown size={24} /></button>
        <div className="player-header-title">
          <strong>{book.title}</strong>
          <small>{book.sourceType === 'audiobookshelf' ? 'Audiobookshelf' : book.sourceType === 'plex' ? 'Plex' : book.sourceType === 'local' ? '本地书库' : '演示书库'}</small>
        </div>
        <button className="icon-button" onClick={() => setEffectsOpen(true)} aria-label="更多"><MoreIcon size={22} /></button>
      </div>

      <div className="player-body">
        <div className="player-art">
          <img src={book.coverUrl} alt={book.title} />
        </div>

        <div className="player-meta">
          <h2>{book.title}</h2>
          <p>{book.author || '未知作者'}</p>
          <span>由 {book.narrator || '未知演播者'} 演播</span>
        </div>

        <div className="player-progress">
          <input className="seek-slider" type="range" min={0} max={Math.max(1, book.duration)}
            value={Math.min(player.position, book.duration)} onChange={(event) => player.seek(Number(event.target.value))} />
          <div className="seek-labels">
            <span>{formatTime(player.position)}</span>
            <span>{chapter ? `${chapter.title} · ${formatTime(inChapter)} / ${formatTime(chapter.duration)}` : formatTime(book.duration)}</span>
            <span>-{formatTime(Math.max(0, book.duration - player.position))}</span>
          </div>
        </div>

        <div className="player-controls">
          <button className="control-icon" onClick={() => setSleepOpen(true)} title="睡眠定时"><ClockIcon size={22} /></button>
          <button className="control-icon" onClick={() => player.skip(-15)} title="后退 15 秒"><RewindIcon size={26} /></button>
          <button className="control-icon" onClick={() => player.skip(-30)} title="后退 30 秒"><SkipBackIcon size={26} /></button>
          <button className="play-button" onClick={player.toggle} aria-label={player.playing ? '暂停' : '播放'}>
            {player.playing ? <PauseIcon size={34} /> : <PlayIcon size={34} />}
          </button>
          <button className="control-icon" onClick={() => player.skip(30)} title="前进 30 秒"><SkipForwardIcon size={26} /></button>
          <button className="control-icon" onClick={() => setSpeedOpen(true)} title="播放速度"><span className="speed-label">{player.speed}×</span></button>
          <button className="control-icon" onClick={() => void player.addBookmark()} title="添加书签"><BookmarkIcon size={22} /></button>
        </div>

        <div className="player-tabs">
          {([
            ['now', '正在播放', Headphones],
            ['chapters', '章节', ListIcon],
            ['bookmarks', '书签', BookmarkIcon],
            ['transcript', '转录', BookOpenIcon]
          ] as const).map(([key, label, Icon]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              <Icon size={17} /><span>{label}</span>
            </button>
          ))}
        </div>

        <div className="player-tab-content">
          {tab === 'now' && (
            <div className="now-panel">
              <div className="now-row"><span>已收听</span><strong>{formatTime(player.position)}</strong></div>
              <div className="now-row"><span>总时长</span><strong>{formatTime(book.duration)}</strong></div>
              <div className="now-row"><span>睡眠定时</span><strong>{sleepLabel(player.sleepTimer)}</strong></div>
              <div className="now-row"><span>声音增强</span><strong>{voiceBoost ? '已开启' : '关闭'}</strong></div>
              <div className="now-row"><span>片头跳过</span><strong>{player.skipSettings.introSkipSeconds > 0 ? `${player.skipSettings.introSkipSeconds} 秒` : '关闭'}</strong></div>
              <div className="now-row"><span>片尾跳过</span><strong>{player.skipSettings.outroSkipSeconds > 0 ? `${player.skipSettings.outroSkipSeconds} 秒` : '关闭'}</strong></div>
              <button className="secondary-button wide" onClick={() => setSkipOpen(true)}>设置片头 / 片尾跳过</button>
            </div>
          )}

          {tab === 'chapters' && (
            <div className="chapter-list">
              {book.chapters.map((item: Chapter, index: number) => (
                <button key={item.id} className={`chapter-item ${index === chapterIndex ? 'active' : ''}`}
                  onClick={() => player.seek(item.start)}>
                  <span className="chapter-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="chapter-title">{item.title}</span>
                  <span className="chapter-duration">{formatTime(item.duration)}</span>
                </button>
              ))}
            </div>
          )}

          {tab === 'bookmarks' && (
            <div className="bookmark-list">
              <button className="add-bookmark" onClick={() => void player.addBookmark('手动书签', '')}>
                <BookmarkIcon size={16} /> 在当前位置添加书签
              </button>
              {player.bookmarks.map((item) => (
                <div className="bookmark-item" key={item.id}>
                  <button onClick={() => player.seek(item.position)}>
                    <strong>{item.title || '书签'}</strong>
                    <small>{formatTime(item.position)} · {relativeDate(item.createdAt)}</small>
                    {item.note && <p>{item.note}</p>}
                  </button>
                  <button className="icon-button" onClick={() => void apiDelete(`/bookmarks/${item.id}`).then(player.refreshBookmarks)}>
                    <TrashIcon size={16} />
                  </button>
                </div>
              ))}
              {!player.bookmarks.length && <p className="empty-hint">还没有书签</p>}
            </div>
          )}

          {tab === 'transcript' && (
            <div className="transcript-panel">
              {transcript?.status === 'ready' && transcript.segments.map((segment, index) => (
                <button key={index} className={`transcript-segment ${player.position >= segment.start && player.position <= segment.end ? 'active' : ''}`}
                  onClick={() => player.seek(segment.start)}>
                  <span>{formatTime(segment.start)}</span><p>{segment.text}</p>
                </button>
              ))}
              {transcript?.status === 'pending' && <p className="empty-hint">转录任务正在后台运行…</p>}
              {(!transcript || transcript.status === 'unavailable') && (
                <div className="empty-hint">
                  <p>{transcript?.note ?? '暂无转录文本'}</p>
                  <button className="secondary-button" onClick={() => void apiPost(`/transcript/${book.id}`).then(() => setTab('now'))}>
                    开始转录
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {speedOpen && (
        <Sheet title="播放速度" onClose={() => setSpeedOpen(false)}>
          <div className="option-grid">
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3].map((value) => (
              <button key={value} className={player.speed === value ? 'selected' : ''}
                onClick={() => { player.setSpeed(value); setSpeedOpen(false); }}>
                {value}× {player.speed === value && <CheckIcon size={14} />}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {skipOpen && (
        <Sheet title="片头 / 片尾跳过" onClose={() => setSkipOpen(false)}>
          <p className="muted">按本书单独保存：每轨开始时自动跳过片头，播放到片尾前自动切到下一轨。填 0 表示关闭。</p>
          {([['片头跳过', introDraft, setIntroDraft], ['片尾跳过', outroDraft, setOutroDraft]] as const).map(([label, value, setValue]) => (
            <div key={label}>
              <label className="skip-row">
                <span>{label}</span>
                <input type="number" min={0} max={600} step={1} value={value}
                  onChange={(event) => setValue(Math.max(0, Math.min(600, Number(event.target.value) || 0)))} />
                <strong>秒</strong>
              </label>
              <div className="option-grid">
                {[0, 15, 30, 60, 90].map((preset) => (
                  <button key={preset} className={value === preset ? 'selected' : ''}
                    onClick={() => setValue(preset)}>
                    {preset === 0 ? '关闭' : `${preset} 秒`} {value === preset && <CheckIcon size={14} />}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button className="primary-button wide skip-save" onClick={() => {
            player.setSkipSettings({ introSkipSeconds: introDraft, outroSkipSeconds: outroDraft });
            setSkipOpen(false);
          }}>保存</button>
        </Sheet>
      )}

      {sleepOpen && (
        <Sheet title="睡眠定时" onClose={() => setSleepOpen(false)}>
          <div className="option-list">
            <button onClick={() => { player.setSleepTimer({ mode: 'off', value: 0, endsAt: 0 }); setSleepOpen(false); }}>关闭定时器</button>
            {[5, 10, 15, 30, 60].map((minutes) => (
              <button key={minutes} onClick={() => {
                player.setSleepTimer({ mode: 'time', value: minutes, endsAt: Date.now() + minutes * 60000 });
                setSleepOpen(false);
              }}>{minutes} 分钟后</button>
            ))}
            <button onClick={() => {
              player.setSleepTimer({ mode: 'chapter-end', value: 0, endsAt: 0, chapterIndex });
              setSleepOpen(false);
            }}>本章结束时</button>
            <button onClick={() => {
              player.setSleepTimer({ mode: 'end-of-next-chapter', value: 0, endsAt: 0, chapterIndex });
              setSleepOpen(false);
            }}>下一章结束时</button>
          </div>
        </Sheet>
      )}

      {effectsOpen && (
        <Sheet title="声音与均衡器" onClose={() => setEffectsOpen(false)}>
          <label className="toggle-row"><span><VolumeIcon size={17} /> Voice Boost</span>
            <input type="checkbox" checked={voiceBoost} onChange={(event) => setVoiceBoost(event.target.checked)} /></label>
          {([['low', '低频'], ['mid', '中频'], ['high', '高频']] as const).map(([key, label]) => (
            <label className="eq-row" key={key}>
              <span>{label}</span>
              <input type="range" min={-12} max={12} value={eq[key]}
                onChange={(event) => setEq({ ...eq, [key]: Number(event.target.value) })} />
              <strong>{eq[key] > 0 ? '+' : ''}{eq[key]} dB</strong>
            </label>
          ))}
          <p className="muted">设置会立即应用于当前播放。</p>
        </Sheet>
      )}
    </div>
  );
}

function Headphones(props: { size: number }) {
  return <VolumeIcon {...props} />;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-header"><strong>{title}</strong><button className="icon-button" onClick={onClose}><XIcon size={20} /></button></div>
        {children}
      </div>
    </div>
  );
}

function sleepLabel(timer: { mode: SleepTimerMode; value: number; endsAt: number }): string {
  if (timer.mode === 'off') return '关闭';
  if (timer.mode === 'time') return `${Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 60000))} 分钟`;
  if (timer.mode === 'chapter-end') return '本章结束';
  return '下一章结束';
}
