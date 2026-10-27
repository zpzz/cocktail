/**
 * 接口基址由构建脚本注入（见 scripts/build.mjs）。
 * 本地：pnpm mp / pnpm mp:build → 默认局域网 IP
 * 云服务器：填写 deploy.env 后 pnpm mp:build:prod
 *
 * 真机调试不能写 127.0.0.1 / localhost。
 * 微信开发者工具：详情 → 本地设置 → 不校验合法域名 / 不校验 TLS。
 */

declare const __MP_API_BASE_URL__: string;
declare const __MP_MEDIA_BASE_URL__: string;

/** Java 业务 API */
export const API_BASE_URL = __MP_API_BASE_URL__;

/** AI 媒体代理（配方图 /api/media） */
export const MEDIA_BASE_URL = __MP_MEDIA_BASE_URL__;
