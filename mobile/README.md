# SoundShelf App（iOS / Android）

App 外壳使用 Capacitor 直接打包 `web/dist`，因此 Web 与 App 共用同一套界面、API 客户端与播放器逻辑。

## 初始化

```bash
cd mobile
npm install
npx cap add ios
npx cap add android
npm run sync
```

## 原生能力

| 能力 | 实现方式 |
| --- | --- |
| 后台播放 / 锁屏控制 | `src/native-audio.ts` 适配层；安装 `@capacitor-community/background-audio` 后自动启用 |
| 离线下载 | `@capacitor/filesystem` 保存音频，Web 层通过 `Capacitor.convertFileSrc` 读取 |
| 本地偏好 | `@capacitor/preferences` |
| 媒体按键 / 蓝牙 | 由原生音频插件的 Media Session 提供 |

Apple Watch、CarPlay、Siri 快捷指令和小组件属于额外的原生工程，需要在 Xcode 中单独添加 Watch App / App Intents / WidgetKit 目标，并通过共享的 App Group 读取播放进度；这些不包含在 Web 代码库中。

## 构建

```bash
npm run sync
npx cap open ios      # Xcode 中 Archive
npx cap open android  # Android Studio 中 Generate Signed Bundle
```

应用只连接你自己部署的 SoundShelf 服务器，不分发任何书籍内容。
