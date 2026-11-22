import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { logger } from './logger.js';
import { internalBookId } from './sources/index.js';

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (char) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
}[char] ?? char));

function coverDataUri(title: string, author: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="400" height="600" fill="url(#g)"/>
<circle cx="310" cy="140" r="90" fill="#ffffff" opacity="0.08"/>
<circle cx="90" cy="470" r="130" fill="#000000" opacity="0.10"/>
<text x="36" y="80" font-family="Georgia,serif" font-size="15" fill="#ffffff" opacity="0.75" letter-spacing="4">SOUNDSHELF</text>
<text x="36" y="300" font-family="Georgia,serif" font-size="42" font-weight="bold" fill="#ffffff">${escapeXml(title.slice(0, 10))}</text>
<text x="36" y="360" font-family="Georgia,serif" font-size="42" font-weight="bold" fill="#ffffff">${escapeXml(title.slice(10, 20))}</text>
<line x1="36" y1="400" x2="130" y2="400" stroke="#ffffff" stroke-width="2" opacity="0.7"/>
<text x="36" y="440" font-family="Georgia,serif" font-size="18" fill="#ffffff" opacity="0.9">${escapeXml(author)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function writeSampleWav(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const sampleRate = 8000;
  const seconds = 20;
  const samples = sampleRate * seconds;
  const buffer = Buffer.alloc(44 + samples);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples, 40);
  for (let i = 0; i < samples; i += 1) {
    const envelope = Math.min(1, i / 800, (samples - i) / 800);
    buffer[44 + i] = 128 + Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 28 * envelope);
  }
  writeFileSync(filePath, buffer);
}

const demoBooks = [
  ['霍比特人', 'J. R. R. Tolkien', '安迪·塞基斯', '#6b7f6a', '#2b3a36'],
  ['魔戒：护戒使者', 'J. R. R. Tolkien', '伊恩·霍姆', '#7a5c3e', '#2c241d'],
  ['沙丘', 'Frank Herbert', '艾伦·拉德', '#b07b3e', '#3f2a18'],
  ['三体', '刘慈欣', '周建龙', '#344b6e', '#141c2b'],
  ['人类简史', 'Yuval Noah Harari', '林俊天', '#8c5a4f', '#39221d'],
  ['小王子', 'Antoine de Saint-Exupery', '宋淼', '#c39a52', '#4b3a20'],
  ['白夜行', '东野圭吾', '刘杰', '#4f5d7a', '#1d2230'],
  ['百年孤独', 'Gabriel Garcia Marquez', '詹福', '#a2533d', '#3d1d16'],
  ['杀死一只知更鸟', 'Harper Lee', '张默', '#6c7f92', '#26313d'],
  ['明朝那些事儿', '当年明月', '王明军', '#8b6b3c', '#372914'],
  ['挪威的森林', '村上春树', '林少华', '#3f6f6b', '#183331'],
  ['时间简史', 'Stephen Hawking', '汪仲', '#5d548c', '#211d38']
] as const;

export function seedDemoData(): void {
  const count = (db.prepare('SELECT COUNT(*) AS count FROM books').get() as { count: number }).count;
  if (count > 0) return;

  let sourceId = (db.prepare("SELECT id FROM sources WHERE type = 'demo' LIMIT 1").get() as { id: string } | undefined)?.id;
  if (!sourceId) {
    sourceId = 'demo-library';
    db.prepare(`INSERT OR IGNORE INTO sources (id, type, name, base_url, token, extra, enabled, created_at)
      VALUES (?, 'demo', '演示书库', '', '', '{}', 1, ?)`).run(sourceId, new Date().toISOString());
  }

  const dataDir = resolve(dirname(config.DATABASE_PATH), 'demo-audio');
  const wavPath = join(dataDir, 'tone.wav');
  writeSampleWav(wavPath);

  const now = Math.floor(Date.now() / 1000);
  const owner = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
  const collectionIds = ['demo-fantasy', 'demo-classics', 'demo-sci-fi'];

  const insertBook = db.prepare(`INSERT INTO books (id, source_id, external_id, title, author, narrator, series,
    description, cover_path, cover_url, duration, language, tags, added_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, 'zh', ?, ?, ?)`);
  const insertTrack = db.prepare(`INSERT INTO tracks (id, book_id, title, file_path, remote_url, mime_type, duration, size, position)
    VALUES (?, ?, ?, ?, '', 'audio/wav', ?, ?, ?)`);
  const insertChapter = db.prepare(`INSERT INTO chapters (id, book_id, title, start_offset, duration, track_index, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);

  db.transaction(() => {
    demoBooks.forEach(([title, author, narrator, colorA, colorB], index) => {
      const externalId = `demo-${index}`;
      const id = internalBookId(sourceId!, externalId);
      const addedAt = now - index * 86400 * 2;
      const duration = 40;
      insertBook.run(id, sourceId, externalId, title, author, narrator,
        index < 2 ? '魔戒系列' : '', `${title} 是一场关于勇气与想象的旅程。由 ${narrator} 演播的演示音频，用于体验播放器功能。`,
        coverDataUri(title, author, colorA, colorB), JSON.stringify(index % 3 === 0 ? ['经典'] : ['精选']),
        duration, addedAt, addedAt);

      for (let track = 0; track < 2; track += 1) {
        insertTrack.run(`${id}-track-${track}`, id, `第 ${track + 1} 部分`, wavPath, 20, 160000, track);
      }
      for (let chapter = 0; chapter < 4; chapter += 1) {
        insertChapter.run(`${id}-chapter-${chapter}`, id, `第 ${chapter + 1} 章 · 旅程开始`, chapter * 10, 10,
          Math.floor(chapter / 2), chapter);
      }

      if (owner && index < 5) {
        const finished = index === 0;
        const position = finished ? duration : Math.round((index + 1) * 3.5);
        db.prepare(`INSERT INTO progress (user_id, book_id, position, duration, finished, started_at, finished_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(owner.id, id, position, duration, finished ? 1 : 0,
          addedAt, finished ? now : null, now - index * 3600);
      }
    });

    collectionIds.forEach((externalId, index) => {
      const demoIndexes = index === 0 ? [0, 1, 2] : index === 1 ? [4, 6, 7, 8] : [3, 9, 11];
      const bookIds = demoIndexes.map((i) => internalBookId(sourceId!, `demo-${i}`));
      db.prepare(`INSERT OR IGNORE INTO collections (id, source_id, external_id, title, description, book_ids, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(`${sourceId}-${externalId}`, sourceId, externalId,
        ['托尼·迪士尼精选', '世界文学经典', '科幻与未来'][index], '按主题整理的演示合集', JSON.stringify(bookIds), now);
    });

    if (owner) {
      for (let day = 1; day <= 12; day += 1) {
        if (day % 4 === 0) continue;
        const seconds = 600 + ((day * 137) % 900);
        const startedAt = now - day * 86400;
        db.prepare(`INSERT INTO sessions (id, user_id, book_id, started_at, ended_at, seconds)
          VALUES (?, ?, ?, ?, ?, ?)`).run(`demo-session-${day}`, owner.id,
          internalBookId(sourceId!, `demo-${day % demoBooks.length}`), startedAt, startedAt + seconds, seconds);
      }
    }
  })();

  logger.info({ books: demoBooks.length }, 'demo library seeded');
}
