# 群晖部署指南

## 1. 准备目录

在 File Station 中创建：

```
/docker/soundshelf          # 项目文件、.env、数据库
/volume1/books              # 有声书文件（可替换为你的共享目录）
```

把项目文件放入 `/docker/soundshelf`，然后执行：

```bash
cp .env.example .env
openssl rand -hex 32   # 生成 JWT_SECRET
```

编辑 `.env`：

```
JWT_SECRET=<上一步生成的随机串>
ADMIN_PASSWORD=<强密码>
CORS_ORIGINS=https://audio.example.com
LOCAL_LIBRARY_PATHS=/media/books
ABS_BASE_URL=https://abs.example.com
ABS_TOKEN=<Audiobookshelf API Token>
# Plex 可选：不填则可在 Web / 小程序中用 Plex 账户登录添加服务器
PLEX_BASE_URL=https://plex.example.com
PLEX_TOKEN=<X-Plex-Token>
```

Plex 推荐在管理界面选择「Plex 媒体服务器 → 使用 Plex 账户登录」：按提示在 `app.plex.tv/auth` 页面确认后，SoundShelf 会自动获取账户下的服务器和资料库，无需手工查找令牌。上面的环境变量仅用于启动预置书源。

## 2. 启动

通过 SSH 进入群晖：

```bash
cd /volume1/docker/soundshelf
sudo docker compose up -d --build
sudo docker compose logs -f soundshelf
```

验证：

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
```

## 3. HTTPS 与反向代理

DSM 控制面板 → 登录门户 → 高级 → 反向代理服务器：

- 来源：`https://audio.example.com:443`
- 目的地：`http://localhost:3000`
- 自定义标头：X-Forwarded-Proto / X-Forwarded-Host

再用「安全性 → 证书」申请 Let's Encrypt 证书并绑定域名。小程序必须使用已备案域名且只允许 HTTPS。

## 4. 微信小程序

1. 用微信开发者工具导入 `miniprogram/` 目录，填写自己的 AppID
2. 在「设置 → 服务器域名」中把 `request` 合法域名配置为上面的 HTTPS 域名
3. 打开小程序 → 设置 → 输入服务器地址 → 登录 → 同步书源
4. 真机预览验证后台音频：锁屏后继续播放、系统控制面板显示书名与封面

注意：微信小程序后台音频只支持单一实例；端侧实时转录、Apple Watch、CarPlay 不具备对应平台能力。

## 5. 手机 App

```bash
cd mobile
npm install
npx cap add ios
npx cap add android
npm run sync
```

后台播放需要安装原生音频插件（见 `mobile/README.md`），并在 iOS 的 Signing & Capabilities 中开启 Background Modes → Audio。

## 6. 数据备份

SQLite 数据库位于 `./data/soundshelf.sqlite`，WAL 模式会同时生成 `-wal` / `-shm` 文件。备份时请停止容器或使用 `sqlite3 .backup`，不要只复制单个 `.sqlite` 文件。
