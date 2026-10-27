/**
 * 真机调试必须用电脑局域网 IP，不能写 127.0.0.1 / localhost（那是手机自己）。
 * 模拟器可继续用本机；改 IP 后重新 `pnpm mp:build`。
 * 微信开发者工具：详情 → 本地设置 → 不校验合法域名 / 不校验 TLS。
 */
export const API_BASE_URL = 'http://192.168.5.206:8080';

/** AI 媒体代理（配方图 /api/media） */
export const MEDIA_BASE_URL = 'http://192.168.5.206:8000';
