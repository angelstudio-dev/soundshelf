import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode
} from 'react';
import { api, apiPost, apiPut, getAccessToken, mediaUrl, setAccessToken } from './api/client.js';
import type { Book, Bookmark, User } from './types.js';

// ---------- 认证 ----------
interface AuthValue {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setAccessToken(null))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiPost<{ user: User; accessToken: string }>('/auth/login', { username, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await apiPost('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider 缺失');
  return value;
}

// ---------- 播放器 ----------
export type SleepTimerMode = 'off' | 'time' | 'chapter-end' | 'end-of-next-chapter';
export interface SleepTimer { mode: SleepTimerMode; value: number; endsAt: number; chapterIndex?: number }

interface PlayerValue {
  book: Book | null;
  playing: boolean;
  position: number;
  duration: number;
  speed: number;
  sleepTimer: SleepTimer;
  bookmarks: Bookmark[];
  open: (book: Book, autoplay?: boolean) => Promise<void>;
  close: () => void;
  toggle: () => void;
  seek: (position: number) => void;
  skip: (delta: number) => void;
  setSpeed: (speed: number) => void;
  setSleepTimer: (timer: SleepTimer) => void;
  addBookmark: (title?: string, note?: string) => Promise<void>;
  refreshBookmarks: () => Promise<void>;
  applyAudioSettings: (options: { voiceBoost?: boolean; low?: number; mid?: number; high?: number }) => void;
}

const PlayerContext = createContext<PlayerValue | null>(null);

export function usePlayer(): PlayerValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('PlayerProvider 缺失');
  return value;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioGraphRef = useRef<{
    context: AudioContext; low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode; gain: GainNode;
  } | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [sleepTimer, setSleepTimerState] = useState<SleepTimer>({ mode: 'off', value: 0, endsAt: 0 });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const trackIndexRef = useRef(0);
  const chapterStartRef = useRef(0);
  const lastSyncRef = useRef(0);
  const listeningStartRef = useRef(0);
  const positionRef = useRef(0);
  const bookRef = useRef<Book | null>(null);

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { bookRef.current = book; }, [book]);

  const refreshBookmarks = useCallback(async () => {
    if (!bookRef.current) return;
    try {
      const data = await api<{ bookmarks: Bookmark[] }>(`/bookmarks?bookId=${bookRef.current.id}`);
      setBookmarks(data.bookmarks);
    } catch { /* offline: keep existing bookmarks */ }
  }, []);

  const persistProgress = useCallback(async (sessionSeconds?: number) => {
    const current = bookRef.current;
    if (!current) return;
    try {
      await apiPut(`/progress/${current.id}`, {
        position: Math.round(positionRef.current),
        duration: current.duration,
        finished: current.duration > 0 && positionRef.current >= current.duration - 1,
        sessionSeconds,
        sessionStartedAt: sessionSeconds ? listeningStartRef.current : undefined,
        playbackSpeed: speed
      });
    } catch { /* 离线时下一次再同步 */ }
  }, [speed]);

  const loadTrack = useCallback((targetBook: Book, index: number, startOffset: number, autoplay: boolean) => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.preload = 'metadata';
      audioRef.current = audio;

      audio.addEventListener('timeupdate', () => {
        const global = chapterStartRef.current + (audio?.currentTime ?? 0);
        setPosition(global);
        positionRef.current = global;
      });
      audio.addEventListener('play', () => {
        setPlaying(true);
        if (!listeningStartRef.current) listeningStartRef.current = Math.floor(Date.now() / 1000);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      });
      audio.addEventListener('pause', () => {
        setPlaying(false);
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        const now = Math.floor(Date.now() / 1000);
        if (listeningStartRef.current) {
          void persistProgress(Math.max(0, now - listeningStartRef.current));
          listeningStartRef.current = 0;
        }
      });
      audio.addEventListener('ended', () => {
        const current = bookRef.current;
        if (!current || !audio) return;
        if (trackIndexRef.current < current.tracks.length - 1) {
          trackIndexRef.current += 1;
          const track = current.tracks[trackIndexRef.current];
          const chapter = current.chapters.find((item) => item.trackIndex === trackIndexRef.current);
          chapterStartRef.current = chapter?.start ?? 0;
          audio.src = mediaUrl(`/books/${current.id}/stream?track=${encodeURIComponent(track.id)}`);
          void audio.play().catch(() => undefined);
        } else {
          void persistProgress();
          setPlaying(false);
        }
      });
      audio.addEventListener('error', () => setPlaying(false));
    }

    const track = targetBook.tracks[index];
    if (!track) return;
    trackIndexRef.current = index;
    const chapter = targetBook.chapters.find((item) => item.trackIndex === index);
    chapterStartRef.current = chapter?.start ?? 0;
    const url = mediaUrl(`/books/${targetBook.id}/stream?track=${encodeURIComponent(track.id)}`);
    if (audio.src !== url) audio.src = url;
    audio.playbackRate = speed;
    const applySeek = () => {
      try { audio.currentTime = Math.max(0, startOffset - chapterStartRef.current); } catch { /* ignore */ }
      if (autoplay) void audio.play().catch(() => setPlaying(false));
    };
    if (audio.readyState >= 1) applySeek();
    else audio.addEventListener('loadedmetadata', applySeek, { once: true });
  }, [persistProgress, speed]);

  const open = useCallback(async (next: Book, autoplay = true) => {
    const current = bookRef.current;
    if (current && current.id !== next.id) await persistProgress();
    let detailed: Book | null = null;
    try {
      detailed = await api<Book>(`/books/${next.id}`);
    } catch {
      detailed = null;
    }
    const selected = detailed ?? next;
    setBook(selected);
    bookRef.current = selected;
    const savedSpeed = await api<{ playback?: { speed?: number } }>('/settings')
      .catch((): { playback?: { speed?: number } } => ({}));
    const preferred = savedSpeed?.playback?.speed ?? 1;
    setSpeedState(preferred);
    const startAt = next.progress?.finished ? 0 : next.progress?.position ?? 0;
    setPosition(startAt);
    positionRef.current = startAt;
    listeningStartRef.current = Math.floor(Date.now() / 1000);
    const chapter = selected.chapters.find((item) => startAt >= item.start && startAt < item.start + item.duration)
      ?? selected.chapters[0];
    loadTrack(selected, chapter?.trackIndex ?? 0, startAt, autoplay);

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: next.title,
        artist: next.author,
        album: next.narrator || 'SoundShelf',
        artwork: next.coverUrl ? [{ src: new URL(next.coverUrl, window.location.href).href, sizes: '512x512', type: 'image/jpeg' }] : []
      });
      navigator.mediaSession.setActionHandler('play', () => void audioRef.current?.play());
      navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        audioRef.current && (audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 15));
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        audioRef.current && (audioRef.current.currentTime += 30);
      });
      navigator.mediaSession.setActionHandler('seekto', (event) => {
        const target = (event.seekOffset ?? 0) + positionRef.current;
        seekRef.current(target);
      });
    }
    await refreshBookmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTrack, persistProgress, refreshBookmarks]);

  const seekRef = useRef<(position: number) => void>(() => undefined);

  const seek = useCallback((target: number) => {
    const current = bookRef.current;
    const audio = audioRef.current;
    if (!current || !audio || !current.chapters.length) return;
    const bounded = Math.max(0, Math.min(target, current.duration || target));
    const chapter = current.chapters.find((item) => bounded >= item.start && bounded < item.start + item.duration)
      ?? current.chapters[current.chapters.length - 1];
    const wanted = Math.min(chapter.trackIndex, current.tracks.length - 1);
    const relative = Math.max(0, bounded - (current.chapters.find((item) => item.trackIndex === wanted)?.start ?? 0));
    if (wanted !== trackIndexRef.current) {
      loadTrack(current, wanted, bounded, playing);
    } else {
      try { audio.currentTime = relative; } catch { /* ignore */ }
    }
    setPosition(bounded);
    positionRef.current = bounded;
  }, [loadTrack, playing]);
  useEffect(() => { seekRef.current = seek; }, [seek]);

  const skip = useCallback((delta: number) => seek(positionRef.current + delta), [seek]);
  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) audio.pause();
    else void audio.play().catch(() => undefined);
  }, []);

  const setSpeed = useCallback((value: number) => {
    setSpeedState(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
    if (bookRef.current) void apiPatchSpeed(bookRef.current.id, value);
  }, []);

  const setSleepTimer = useCallback((timer: SleepTimer) => setSleepTimerState(timer), []);

  const addBookmark = useCallback(async (title?: string, note?: string) => {
    const current = bookRef.current;
    if (!current) return;
    const chapter = current.chapters.find((item) =>
      positionRef.current >= item.start && positionRef.current < item.start + item.duration);
    await apiPost('/bookmarks', {
      bookId: current.id,
      chapterId: chapter?.id ?? '',
      position: positionRef.current,
      title: title ?? chapter?.title ?? '书签',
      note: note ?? ''
    });
    await refreshBookmarks();
  }, [refreshBookmarks]);

  const close = useCallback(() => {
    void persistProgress();
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.src = '';
    setBook(null);
    bookRef.current = null;
    setPlaying(false);
    setPosition(0);
  }, [persistProgress]);

  useEffect(() => {
    if (!book) return;
    const timer = setInterval(() => {
      if (Date.now() - lastSyncRef.current > 5000 && audioRef.current && !audioRef.current.paused) {
        lastSyncRef.current = Date.now();
        void persistProgress();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [book, persistProgress]);

  useEffect(() => {
    if (sleepTimer.mode === 'off' || !audioRef.current) return;
    const timer = setInterval(() => {
      const currentBook = bookRef.current;
      if (!currentBook) return;
      if (sleepTimer.mode === 'time' && Date.now() >= sleepTimer.endsAt) {
        audioRef.current?.pause();
        setSleepTimerState({ mode: 'off', value: 0, endsAt: 0 });
      } else if ((sleepTimer.mode === 'chapter-end' || sleepTimer.mode === 'end-of-next-chapter')) {
        const currentIndex = currentBook.chapters.findIndex((item) =>
          positionRef.current >= item.start && positionRef.current < item.start + item.duration);
        const target = sleepTimer.mode === 'chapter-end' ? sleepTimer.chapterIndex : (sleepTimer.chapterIndex ?? 0) + 1;
        if (currentIndex > (target ?? -1) || (currentIndex === target && positionRef.current >= currentBook.duration - 1)) {
          audioRef.current?.pause();
          setSleepTimerState({ mode: 'off', value: 0, endsAt: 0 });
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [sleepTimer]);

  const applyAudioSettings = useCallback((options: { voiceBoost?: boolean; low?: number; mid?: number; high?: number }) => {
    const audio = audioRef.current;
    if (!audio) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      if (!audioGraphRef.current) {
        const context = new Ctor();
        const source = context.createMediaElementSource(audio);
        const low = context.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200;
        const mid = context.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = 0.9;
        const high = context.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4000;
        const gain = context.createGain();
        source.connect(low); low.connect(mid); mid.connect(high); high.connect(gain); gain.connect(context.destination);
        audioGraphRef.current = { context, low, mid, high, gain };
      }
      const graph = audioGraphRef.current;
      const boost = options.voiceBoost ? 4 : 0;
      graph.low.gain.value = options.low ?? 0;
      graph.mid.gain.value = (options.mid ?? 0) + boost;
      graph.high.gain.value = (options.high ?? 0) + boost * 0.5;
      graph.gain.gain.value = options.voiceBoost ? 1.15 : 1;
      if (graph.context.state === 'suspended') void graph.context.resume();
    } catch { /* 浏览器不支持 Web Audio 时保持原始输出 */ }
  }, []);

  const duration = book?.duration ?? 0;
  const value = useMemo<PlayerValue>(() => ({
    book, playing, position, duration, speed, sleepTimer, bookmarks,
    open, close, toggle, seek, skip, setSpeed, setSleepTimer, addBookmark, refreshBookmarks, applyAudioSettings
  }), [book, playing, position, duration, speed, sleepTimer, bookmarks, open, close, toggle, seek, skip, setSpeed, setSleepTimer, addBookmark, refreshBookmarks, applyAudioSettings]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

async function apiPatchSpeed(bookId: string, speed: number): Promise<void> {
  await api('/settings', { method: 'PATCH', body: JSON.stringify({ key: 'playback', value: { speed } }) }).catch(() => undefined);
  void bookId;
}
