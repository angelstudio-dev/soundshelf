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

## 书源

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/libraries` | 书源列表与书籍数量 |
| POST | `/libraries` | 添加书源（管理员） |
| PATCH | `/libraries/:id` | 启用/禁用、重命名 |
| DELETE | `/libraries/:id` | 删除书源 |
| POST | `/libraries/:id/sync` | 立即同步 |

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

## 转录与任务

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/transcript/:bookId` | 转录状态与分段 |
| POST | `/transcript/:bookId` | 创建转录任务 |
| GET/POST/DELETE | `/queue` / `/queue/:id` | 后台任务队列 |

## 系统

`GET /health`、`GET /ready` 无需认证。响应头携带 `X-Request-Id`，结构化日志包含同一 ID。
