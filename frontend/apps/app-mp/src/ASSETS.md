# Mini-program assets

## Tab bar icons (required by `app.json` — must stay local)

Place 81×81 PNG icons under `src/assets/images/`:

| File | Usage |
|------|--------|
| `tab-home.png` / `tab-home-active.png` | 首页 |
| `tab-workbench.png` / `tab-workbench-active.png` | 工作台 |
| `tab-cabinet.png` / `tab-cabinet-active.png` | 酒柜 |
| `tab-profile.png` / `tab-profile-active.png` | 我的 |

Until icons exist, you may temporarily remove `iconPath` / `selectedIconPath` from `app.json` for a text-only tabBar.

## Local brand logo

- `src/assets/images/jiufang-logo.png` — 首页 / 对话页品牌图（本地路径，不依赖登录）

## Remote assets (java-service)

Glass illustrations are served by the backend:

- `GET /api/cocktail/assets/images/glasses/{rocks,coupe,wine_goblet,highball,martini,hurricane,flute,margarita,nick_nora}.jpg`

Files live in `java-service/src/main/resources/static-assets/images/`.
The mini program resolves them via `resolveAssetUrl` against `API_BASE_URL`.
Backend whitelist: `GET /api/cocktail/assets/**` is `permitAll`.
