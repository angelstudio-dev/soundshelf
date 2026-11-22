import { randomUUID } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { db } from '../db.js';
import { notFound, upstreamError } from '../errors.js';
import { logger } from '../logger.js';

const PRODUCT = 'SoundShelf';
const VERSION = '1.0.0';
const PLATFORM = 'Web';
const PLEX_API = 'https://plex.tv/api/v2';
const PIN_TTL = 30 * 60 * 1000;

type PinRow = {
  pin_id: string;
  code: string;
  client_identifier: string;
  user_id: string;
  status: 'pending' | 'complete' | 'expired';
  auth_token: string;
  servers: string;
  created_at: number;
  expires_at: number;
};

export type PlexServer = {
  name: string;
  machineIdentifier: string;
  version: string;
  owned: boolean;
  baseUrl: string;
  reachable: boolean;
  candidates: string[];
};

export type PlexPinSession = {
  pinId: string;
  code: string;
  authUrl: string;
  linkUrl: string;
  expiresAt: number;
  clientIdentifier: string;
};

export type PlexPinStatus =
  | { status: 'pending' | 'expired'; expiresAt: number }
  | { status: 'complete'; token: string; servers: PlexServer[] };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: false });
const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const str = (value: unknown): string => (value === undefined || value === null ? '' : String(value));

function oauthHeaders(clientIdentifier: string, token = ''): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-Plex-Client-Identifier': clientIdentifier,
    'X-Plex-Product': PRODUCT,
    'X-Plex-Version': VERSION,
    'X-Plex-Platform': PLATFORM,
    'X-Plex-Model': 'Plex OAuth',
    ...(token ? { 'X-Plex-Token': token } : {})
  };
}

async function readPayload<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) throw upstreamError('Plex 返回了空响应');
  try {
    return JSON.parse(text) as T;
  } catch {
    // 部分旧版 plex.tv 端点只返回 XML，做一次兼容解析。
    return parser.parse(text) as T;
  }
}

function extractContainer(payload: any): any {
  if (Array.isArray(payload)) return payload;
  const container = payload?.MediaContainer ?? payload;
  if (Array.isArray(container?.Device)) return container.Device;
  if (Array.isArray(container?.Server)) return container.Server;
  return container;
}

function extractPin(payload: any): any {
  const container = extractContainer(payload);
  return container?.Pin ?? container?.pin ?? container;
}

/** 客户端标识在一套 SoundShelf 部署内保持稳定，Plex 会按它识别已授权应用。 */
export function getPlexClientIdentifier(): string {
  const existing = db.prepare("SELECT value FROM app_meta WHERE key = 'plex.clientIdentifier'").get() as
    | { value: string } | undefined;
  if (existing?.value) return existing.value;
  const value = `soundshelf-${randomUUID()}`;
  db.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('plex.clientIdentifier', ?)").run(value);
  const saved = db.prepare("SELECT value FROM app_meta WHERE key = 'plex.clientIdentifier'").get() as
    | { value: string } | undefined;
  return saved?.value ?? value;
}

function buildAuthUrl(clientIdentifier: string, code: string): string {
  const context: Record<string, string> = {
    clientID: clientIdentifier,
    code,
    'context[device][product]': PRODUCT,
    'context[device][version]': VERSION,
    'context[device][model]': 'Plex OAuth'
  };
  return `https://app.plex.tv/auth/#!?${new URLSearchParams(context).toString()}`;
}

export async function createPlexPin(userId: string): Promise<PlexPinSession> {
  const clientIdentifier = getPlexClientIdentifier();
  const params = new URLSearchParams({
    strong: 'true',
    'X-Plex-Product': PRODUCT,
    'X-Plex-Client-Identifier': clientIdentifier,
    'X-Plex-Version': VERSION,
    'X-Plex-Platform': PLATFORM
  });
  const search = params.toString();
  let response: Response;
  try {
    response = await fetch(`${PLEX_API}/pins?${search}`, {
      method: 'POST',
      headers: { ...oauthHeaders(clientIdentifier), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: search,
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    throw upstreamError('无法连接 Plex 授权服务', String(error));
  }
  if (!response.ok) throw upstreamError(`Plex 授权服务返回 ${response.status}`, await response.text());

  const payload = await readPayload<any>(response);
  const pin = extractPin(payload);
  const pinId = str(pin?.['@_id'] ?? pin?.id);
  const code = str(pin?.['@_code'] ?? pin?.code);
  if (!pinId || !code) throw upstreamError('Plex 未返回有效的登录 PIN', payload);

  const rawExpiry = pin?.expiresAt ?? pin?.['@_expiresAt'];
  const parsedExpiry = rawExpiry ? Date.parse(str(rawExpiry)) : NaN;
  const expiresAt = Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + PIN_TTL;
  const now = Date.now();
  db.prepare(`INSERT INTO plex_oauth_pins
    (pin_id, code, client_identifier, user_id, status, auth_token, servers, created_at, expires_at)
    VALUES (?, ?, ?, ?, 'pending', '', '[]', ?, ?)
    ON CONFLICT(pin_id) DO UPDATE SET
      code=excluded.code, client_identifier=excluded.client_identifier, user_id=excluded.user_id,
      status='pending', auth_token='', servers='[]', created_at=excluded.created_at, expires_at=excluded.expires_at`)
    .run(pinId, code, clientIdentifier, userId, now, expiresAt);

  return {
    pinId,
    code,
    authUrl: buildAuthUrl(clientIdentifier, code),
    linkUrl: 'https://plex.tv/link',
    expiresAt,
    clientIdentifier
  };
}

function normalizeUrl(value: unknown): string {
  const text = str(value).trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.pathname = url.pathname.replace(/\/$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function serverCandidates(resource: any): string[] {
  const candidates: string[] = [];
  const connections = asArray<any>(resource?.connections).sort((a, b) => {
    const score = (item: any) => (item?.relay ? 2 : item?.local ? 0 : 1);
    return score(a) - score(b);
  });
  for (const connection of connections) {
    const direct = normalizeUrl(connection?.uri);
    if (direct) candidates.push(direct);
    const address = str(connection?.address);
    const port = str(connection?.port);
    if (address && port) {
      candidates.push(normalizeUrl(`${str(connection?.protocol) || 'http'}://${address}:${port}`));
    }
  }
  candidates.push(
    normalizeUrl(resource?.accessUri),
    normalizeUrl(resource?.publicUri),
    normalizeUrl(`${str(resource?.scheme) || 'http'}://${str(resource?.host)}:${str(resource?.port)}`)
  );
  return [...new Set(candidates.filter(Boolean))].slice(0, 10);
}

async function findReachableServer(candidates: string[], token: string, clientIdentifier: string): Promise<string> {
  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/library/sections`, {
        headers: oauthHeaders(clientIdentifier, token),
        signal: AbortSignal.timeout(6000)
      });
      if (!response.ok) continue;
      const text = await response.text();
      if (text.includes('MediaContainer')) return candidate;
    } catch {
      // 尝试下一个候选地址（本地 / 公网 / relay）。
    }
  }
  return '';
}

async function listPlexServers(token: string, clientIdentifier: string): Promise<PlexServer[]> {
  let response: Response;
  try {
    response = await fetch(`${PLEX_API}/resources?includeHttps=1&includeRelay=1`, {
      headers: oauthHeaders(clientIdentifier, token),
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    throw upstreamError('无法读取 Plex 服务器列表', String(error));
  }
  if (!response.ok) throw upstreamError(`Plex 服务器列表返回 ${response.status}`, await response.text());

  const payload = await readPayload<any>(response);
  const resources = asArray<any>(extractContainer(payload)).filter((item) => item && item.name);
  const result: PlexServer[] = [];
  for (const resource of resources) {
    if (str(resource?.provides) && !str(resource?.provides).includes('server')) continue;
    const candidates = serverCandidates(resource);
    const reachable = await findReachableServer(candidates, token, clientIdentifier);
    result.push({
      name: str(resource.name),
      machineIdentifier: str(resource.clientIdentifier ?? resource.machineIdentifier),
      version: str(resource.version ?? resource.productVersion),
      owned: resource.owned === true || resource.owned === '1',
      baseUrl: reachable || candidates[0] || '',
      reachable: Boolean(reachable),
      candidates
    });
  }
  return result;
}

function toStatus(row: PinRow): PlexPinStatus {
  if (row.status === 'complete') {
    return {
      status: 'complete',
      token: row.auth_token,
      servers: JSON.parse(row.servers || '[]') as PlexServer[]
    };
  }
  if (Date.now() > row.expires_at || row.status === 'expired') return { status: 'expired', expiresAt: row.expires_at };
  return { status: 'pending', expiresAt: row.expires_at };
}

export async function checkPlexPin(pinId: string, userId: string): Promise<PlexPinStatus> {
  const row = db.prepare('SELECT * FROM plex_oauth_pins WHERE pin_id = ? AND user_id = ?')
    .get(pinId, userId) as PinRow | undefined;
  if (!row) throw notFound('授权会话不存在，请重新发起登录');
  if (row.status === 'complete' || row.status === 'expired' || Date.now() > row.expires_at) return toStatus(row);

  const params = new URLSearchParams({ code: row.code });
  let response: Response;
  try {
    response = await fetch(`${PLEX_API}/pins/${encodeURIComponent(row.pin_id)}?${params.toString()}`, {
      headers: oauthHeaders(row.client_identifier),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    throw upstreamError('无法查询 Plex 授权状态', String(error));
  }
  if (!response.ok) throw upstreamError(`Plex 授权查询返回 ${response.status}`, await response.text());

  const payload = await readPayload<any>(response);
  const pin = extractPin(payload);
  const token = str(pin?.authToken ?? pin?.['@_authToken']);
  if (!token) return { status: 'pending', expiresAt: row.expires_at };

  let servers: PlexServer[] = [];
  try {
    servers = await listPlexServers(token, row.client_identifier);
  } catch (error) {
    logger.warn({ error: String(error) }, 'failed to list Plex servers after OAuth');
  }
  db.prepare("UPDATE plex_oauth_pins SET status = 'complete', auth_token = ?, servers = ? WHERE pin_id = ?")
    .run(token, JSON.stringify(servers), row.pin_id);
  return { status: 'complete', token, servers };
}
