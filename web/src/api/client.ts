const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const setAccessToken = (token: string | null) => { accessToken = token; };
export const getAccessToken = () => accessToken;
export const mediaUrl = (path: string) => `${BASE}/api${path}`;

async function refresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      if (!response.ok) return false;
      const data = await response.json() as { accessToken: string };
      setAccessToken(data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
  retry?: number;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, retry = 0, headers, ...init } = options;
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has('Content-Type') && init.body) requestHeaders.set('Content-Type', 'application/json');
  if (auth && accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, { ...init, headers: requestHeaders, credentials: 'include' });
  } catch {
    throw new ApiError('无法连接服务器，请检查网络或群晖地址', 0, 'OFFLINE');
  }

  if (response.status === 401 && auth && retry === 0) {
    if (await refresh()) return api<T>(path, { ...options, retry: 1 });
  }

  if (response.status >= 500 && retry < 2 && (init.method ?? 'GET').toUpperCase() === 'GET') {
    await new Promise((resolve) => setTimeout(resolve, 300 * (retry + 1)));
    return api<T>(path, { ...options, retry: retry + 1 });
  }

  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    let code: string | undefined;
    try {
      const data = await response.json() as { error?: { message?: string; code?: string } };
      message = data.error?.message ?? message;
      code = data.error?.code;
    } catch { /* ignore non-json errors */ }
    throw new ApiError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** 下载二进制/文件响应（如备份 JSON），沿用同一套登录态与刷新逻辑 */
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const attempt = async (): Promise<Response> => {
    const headers = new Headers();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    try {
      return await fetch(`${BASE}/api${path}`, { headers, credentials: 'include' });
    } catch {
      throw new ApiError('无法连接服务器，请检查网络或群晖地址', 0, 'OFFLINE');
    }
  };
  let response = await attempt();
  if (response.status === 401 && await refresh()) response = await attempt();
  if (!response.ok) throw new ApiError(`下载失败 (${response.status})`, response.status);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] ?? null };
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPut = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiDelete = <T>(path: string) => api<T>(path, { method: 'DELETE' });
