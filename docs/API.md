# API 约定

Base URL：`/api`。除标注外均需 `Authorization: Bearer <accessToken>`。

错误结构：

```json
{ "error": { "code": "NOT_FOUND", "message": "书籍不存在", "requestId": "..." } }
```

## 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/login` | 用户名密码，返回 accessToken/refreshToken |
| POST | `/auth/refresh` | 轮换刷新令牌（支持 HttpOnly Cookie） |
| POST | `/auth/logout` | 撤销刷新令牌并清除 Cookie |
| GET | `/auth/me` | 当前用户 |
| POST | `/auth/register` | 管理员创建用户 |

## Plex 账户登录（PIN 授权）

仅管理员可用。添加 Plex 服务器时无需手工复制 `X-Plex-Token`：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/plex/oauth/start` | 向 plex.tv 申请 PIN，返回 `pinId`、`code`、`authUrl`、`linkUrl`、`expiresAt` |
| GET | `/plex/oauth/check?pinId=` | 轮询授权状态；`pending` / `expired` 或 `complete` + `token` + `servers` |

流程：前端展示验证码并打开 `authUrl`（或让用户访问 `plex.tv/link` 输入验证码），每 3 秒轮询 `check`；授权成功后从 Plex 账户读取可访问的服务器列表，并自动探测本地/公网/relay 可用地址。返回的 `token`、`baseUrl` 可直接传给 `/libraries/probe` 与 `/libraries`。客户端标识保存在数据库 `app_meta` 中，同一部署保持稳定。

## 书库

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/home` | 继续收听、最近添加、已听完、统计 |
| GET | `/books?search=&filter=&sort=&page=&limit=` | 书籍列表 |
| GET | `/books/:id` | 书籍详情（含章节、音轨、进度） |
| GET | `/books/:id/chapters` | 章节列表 |
| GET | `/collections` / `/collections/:id` | 合集 |
| GET | `/search?q=` | 搜索 |
| GET | `/books/:id/stream?track=` | 音频流，支持 Range 请求 |
| GET | `/assets/cover/:bookId` | 封面代理（自动附加书源凭据） |
| GET | `/authors` | 作者聚合列表（首字母、书籍数、封面） |
| GET | `/authors/:name/books` | 指定作者的书籍 |
| GET | `/books/:id/history` | 单本收听历史 |
| GET | `/history?limit=` | 全部收听历史 |
| GET | `/books/:id/media` | 文件大小、码率、编码与容器格式（`size` / `bitrate` / `codec` / `format`，由音轨 MIME 推断） |
| GET | `/books?genre=&bookIds=` | 按流派（匹配 tags）与指定书籍 ID 列表（逗号分隔）过滤 |

## 书源

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/libraries` | 书源列表与书籍数量 |
| POST | `/libraries` | 添加书源（管理员） |
| PATCH | `/libraries/:id` | 启用/禁用、重命名 |
| DELETE | `/libraries/:id` | 删除书源 |
| POST | `/libraries/:id/sync` | 立即同步 |
| POST | `/libraries/probe` | 探测资料库列表（添加向导用），body: `{type, baseUrl, token}` |

`POST /libraries` 支持可选 `libraryIds: string[]`，只同步勾选的资料库；`SKIP_STARTUP_SYNC=true` 可跳过启动时的自动同步。

## 个人数据

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/PUT | `/progress` / `/progress/:bookId` | 进度、播放会话 |
| POST | `/progress/:bookId/finish` | 标记完成状态 |
| DELETE | `/progress/:bookId` | 重置进度 |
| GET/POST | `/bookmarks` | 书签列表 / 新建 |
| PATCH/DELETE | `/bookmarks/:id` | 更新 / 删除 |
| GET | `/stats` | 收听统计、连续天数、最近 30 天 |
| GET/PATCH/DELETE | `/settings` / `/settings/:key` | 用户设置 |
| GET/POST | `/playlists` | 读取播放清单 / 添加书籍（POST body `{name, bookId}`） |
| DELETE | `/playlists/:name/books/:bookId` | 从播放清单移除书籍 |

## 转录与任务

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/transcript/:bookId` | 转录状态与分段 |
| POST | `/transcript/:bookId` | 创建转录任务 |
| GET/POST/DELETE | `/queue` / `/queue/:id` | 后台任务队列 |

## 系统

`GET /health`、`GET /ready` 无需认证。响应头携带 `X-Request-Id`，结构化日志包含同一 ID。
