import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { config } from './config.js';
import { db } from './db.js';
import { unauthorized } from './errors.js';
import type { AuthRequest, AuthUser } from './types.js';

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const hashPassword = (password: string) => bcrypt.hashSync(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compareSync(password, hash);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function issueTokenPair(user: AuthUser) {
  const accessToken = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    config.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
  const refreshToken = randomUUID() + '.' + randomUUID();
  db.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), user.id, sha256(refreshToken), Date.now() + REFRESH_TTL_MS);
  return { accessToken, refreshToken, expiresIn: 15 * 60 };
}

export function rotateRefreshToken(refreshToken: string) {
  const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(sha256(refreshToken)) as
    | { id: string; user_id: string; expires_at: number; revoked_at: number | null }
    | undefined;
  if (!row || row.revoked_at || row.expires_at < Date.now()) throw unauthorized('登录已过期，请重新登录');
  const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(row.user_id) as AuthUser | undefined;
  if (!user) throw unauthorized('用户不存在');

  db.transaction(() => {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(Date.now(), row.id);
  })();
  return issueTokenPair(user);
}

export function revokeRefreshToken(refreshToken: string): void {
  db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?').run(Date.now(), sha256(refreshToken));
}

export function tokenFromRequest(req: AuthRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookies = (req.headers.cookie ?? '').split(';').map((part) => part.trim());
  const access = cookies.find((cookie) => cookie.startsWith('ss_access='));
  if (access) return decodeURIComponent(access.slice('ss_access='.length));
  // 音频元素与小程序无法附加请求头，仅对媒体端点允许短时效令牌走查询参数。
  const queryToken = (req as AuthRequest).query?.access_token;
  return typeof queryToken === 'string' ? queryToken : null;
}

export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const token = tokenFromRequest(req);
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    req.userId = payload.sub;
    req.user = { id: String(payload.sub), username: String(payload.username), role: String(payload.role) };
    next();
  } catch {
    next(unauthorized('访问令牌无效或已过期'));
  }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const token = tokenFromRequest(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    req.userId = payload.sub;
    req.user = { id: String(payload.sub), username: String(payload.username), role: String(payload.role) };
  } catch {
    // 可选认证下无效令牌按匿名处理
  }
  next();
}
