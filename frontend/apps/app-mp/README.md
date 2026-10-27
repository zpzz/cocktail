# 酒方微信小程序 `@cocktail/app-mp`

原生微信小程序，视觉与功能对齐 `app-rn`；业务逻辑复用 `@cocktail/shared`。

## 开发

1. 根目录安装依赖：`pnpm install`（在 `frontend/`）
2. 编译到 `dist/`：`pnpm mp`（watch）或 `pnpm mp:build`
3. 用微信开发者工具打开目录：`frontend/apps/app-mp`（`miniprogramRoot` 为 `dist/`）
4. 详情 → 本地设置 → **不校验合法域名**、**不校验 TLS**
5. 本地默认 API 在构建脚本里（`192.168.5.206`）；可建 `deploy.local.env` 覆盖；真机不能写 `127.0.0.1`
6. 真机与电脑同一 Wi-Fi；Windows 防火墙放行 8080 / 8000；Java / AI 服务保持运行

## 打包连云服务器

```bash
cd frontend
cp apps/app-mp/deploy.env.example apps/app-mp/deploy.env
# 编辑 deploy.env：改成公网 IP
# MP_API_BASE_URL=http://x.x.x.x:8080
# MP_MEDIA_BASE_URL=http://x.x.x.x:8000

pnpm mp:build:prod
```

或直接传参：

```bash
pnpm mp:build:prod -- --api=http://x.x.x.x:8080 --media=http://x.x.x.x:8000
```

构建日志会打印实际注入的 API / MEDIA 地址；用开发者工具打开 `dist/` 即可预览。

## 结构

```text
src/
  adapters/   # wx HttpClient、媒体 URL
  auth/       # storage + hydrate
  pages/      # 首页 / 工作台 / 酒柜 / 我的 / 登录 / 聊天 / 特调 / 酒单 / 详情
  config.ts   # API 基址
dist/         # 微信开发者工具实际加载目录
```

## 说明

- 未使用 Taro，避免与 RN 的 React 19 在 hoisted monorepo 里冲突。
- SSE 使用 `wx.request({ enableChunked: true })` + shared 的 `consumeSseBuffer`。
- AppId 暂为 `touristappid`，上线前在 `project.config.json` 替换。
