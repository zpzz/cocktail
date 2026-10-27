import type { SseEventHandler } from '../utils/sse';

export type QueryParams = Record<string, string | number | boolean | undefined>;

export type StreamOptions = {
  signal?: AbortSignal;
};

export type HttpClientOptions = {
  /** 返回当前 accessToken；无则不带 Authorization */
  getAccessToken?: () => string | null | undefined;
  /** 返回 refreshToken，供 401 时自动刷新 */
  getRefreshToken?: () => string | null | undefined;
  /** Access / Refresh 刷新成功后写回本地态 */
  onTokensRefreshed?: (tokens: {
    accessToken: string;
    refreshToken: string;
  }) => void | Promise<void>;
  /** Refresh 失败：清登录态（小程序可再走微信静默登录） */
  onAuthFailure?: () => void | Promise<void>;
  /**
   * Access/Refresh 都无效时尝试重新登录（如小程序 wx.login）。
   * 返回 true 表示已拿到新令牌，调用方应重试原请求。
   */
  tryReauthenticate?: () => Promise<boolean>;
};

export type MultipartFilePart = {
  uri: string;
  name: string;
  type: string;
};

export interface HttpClient {
  get<T>(path: string, params?: QueryParams): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
  postMultipart<T>(
    path: string,
    fieldName: string,
    file: MultipartFilePart,
  ): Promise<T>;
  postSse(
    path: string,
    body: unknown,
    onEvent: SseEventHandler,
    options?: StreamOptions,
  ): Promise<void>;
}
