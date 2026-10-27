# App 运行时素材

会被 Metro / Expo 打包进应用，在代码里 `require()` 或 `import` 引用。

## 目录

| 目录 | 用途 |
|------|------|
| `./` | App 图标、启动图等（见 `app.json`） |
| `images/` | 页面用静态图（Logo、插画、占位图等） |
| `animations/` | 动效资源（Lottie `.json`、GIF 等） |

## 设计稿存放位置

完整设计稿、源文件、参考图请放在 **`frontend/design/`**，不要和这里混放。

## 引用示例

```tsx
import logo from '../../assets/images/home-logo.png';

<Image source={logo} />
```
