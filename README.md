# SoundShelf

自托管有声书播放器：群晖 NAS 上跑一套 API，Web / 手机 App / 微信小程序共用同一套书库和播放进度。

> 本项目是独立实现，参考 Prologue 的功能形态与界面布局，不使用其品牌、图标、代码或任何专有素材，也不分发任何书籍内容。声音来自你自己的 Audiobookshelf、Plex 或本地目录。

## 功能

- **书库**：Audiobookshelf、Plex、本地目录三类书源聚合；按作者、系列、合集浏览；搜索、筛选、排序
- **播放**：倍速（每本书独立保存）、章节跳转、±15/30 秒、睡眠定时（时长 / 本章结束 / 下一章结束）、暂停后智能回退、Voice Boost 与三段均衡器、媒体锁屏控制
- **阅读**：EPUB/PDF 附件入口、随音频高亮的转录阅读器、点击文本跳转（转录由服务端任务生成）
- **数据**：书签与笔记、播放历史、收听统计、连续收听天数、阅读列表
- **离线**：Web/PWA 缓存、App 文件系统下载、小程序后台音频
- **工程化**：环境变量启动校验、类型化错误、结构化 JSON 日志、JWT + 服务端刷新令牌、SQLite 迁移、请求 ID、Range 音频代理、后台任务重试与死信

## 三端能力对照

| 能力 | Web / PWA | 手机 App | 微信小程序 |
| --- | --- | --- | --- |
| 书库、合集、搜索、统计 | ✅ | ✅ | ✅ |
| 播放器、章节、书签、进度同步 | ✅ | ✅ | ✅ |
| 后台播放 / 锁屏控制 | MediaSession | 原生插件 | 后台音频管理器 |
| 离线下载 | PWA 缓存 | 文件系统 | 受微信存储配额限制 |
| EPUB / PDF 阅读 | 附件入口 | 附件入口 | 外部打开 |
| 服务端转录与点读 | ✅ | ✅ | ✅（降级为文本列表） |
| Apple Watch / CarPlay / Siri / 小组件 | ❌ | 需原生工程扩展 | ❌ |

微信平台没有开放 Watch、CarPlay、Siri、端侧语音转录对应接口，无法在小程序内复刻；这些能力属于额外的原生工程，见 `mobile/README.md`。

## 本地开发

```bash
cp .env.example .env
# 修改 JWT_SECRET（至少 32 字符）与 ADMIN_PASSWORD
npm run setup
DEMO_MODE=true npm run dev:server   # http://localhost:3000
npm run dev:web                     # http://localhost:5173
```

演示模式会生成 12 本样书、3 个合集、示例进度与统计，打开浏览器即可体验完整 UI。默认账号密码来自 `.env` 中的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。

## 群晖部署

1. 在 DSM 中安装 Docker，创建 `/docker/soundshelf` 与书籍共享目录（例如 `/volume1/books`）
2. 把本目录上传到 `/docker/soundshelf`，复制 `.env.example` 为 `.env` 并填写密钥与书源
3. `docker compose up -d --build`
4. 通过 `http://<群晖IP>:3000` 访问，建议再用 DSM 反向代理 + Let's Encrypt 证书套一层 HTTPS
5. 微信小程序要求 HTTPS 且域名备案，详见 `docs/DEPLOY.md`

## 仓库结构

```
server/        Node.js/TypeScript API（配置、认证、书源适配器、服务、路由、后台任务）
web/           React + Vite 客户端（含 PWA manifest）
mobile/        Capacitor 配置与原生音频适配层
miniprogram/   原生微信小程序工程，可直接用微信开发者工具导入
docs/          部署、API、能力对照
```

## API

主要端点见 `docs/API.md`。所有 `/api/*`（除登录与健康检查）需要 Bearer 令牌；音频与封面额外允许 15 分钟有效的查询参数令牌供 `<audio>` 和小程序使用。

## 许可

MIT。详见 `LICENSE`。
