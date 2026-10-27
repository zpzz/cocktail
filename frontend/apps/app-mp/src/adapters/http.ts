import type {
  ApiEnvelope,
  HttpClient,
  HttpClientOptions,
  MultipartFilePart,
  QueryParams,
  SseEventHandler,
  StreamOptions,
  TokenResponse,
} from '@cocktail/shared';
import { API_PATHS, consumeSseBuffer } from '@cocktail/shared';

function toQuery(params?: QueryParams): string {
  if (!params) {
    return '';
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function authHeaders(options?: HttpClientOptions): Record<string, string> {
  const token = options?.getAccessToken?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function shouldSkipAuthRetry(path: string): boolean {
  return (
    path.startsWith(API_PATHS.authLogin) ||
    path.startsWith(API_PATHS.authRegister) ||
    path.startsWith(API_PATHS.authWechat) ||
    path.startsWith(API_PATHS.authRefresh) ||
    path.startsWith(API_PATHS.authLogout) ||
    path.startsWith(API_PATHS.authProfile) ||
    path.startsWith(API_PATHS.authAvatar)
  );
}

function unwrapEnvelope<T>(envelope: ApiEnvelope<T> | null, statusCode: number, path: string): T {
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(envelope?.message || `HTTP ${statusCode} ${path}`);
  }
  if (envelope && typeof envelope.success === 'boolean') {
    if (!envelope.success) {
      throw new Error(envelope.message || envelope.code || '请求失败');
    }
    return envelope.data;
  }
  return envelope as unknown as T;
}

function arrayBufferToText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(buf));
  } catch {
    const bytes = new Uint8Array(buf);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
      out += String.fromCharCode(bytes[i]);
    }
    try {
      return decodeURIComponent(escape(out));
    } catch {
      return out;
    }
  }
}

export function createWxHttpClient(
  baseUrl: string,
  options: HttpClientOptions = {},
): HttpClient {
  let refreshInFlight: Promise<boolean> | null = null;

  async function refreshAccessToken(): Promise<boolean> {
    if (refreshInFlight) {
      return refreshInFlight;
    }
    refreshInFlight = (async () => {
      const refreshToken = options.getRefreshToken?.();
      if (!refreshToken) {
        await options.onAuthFailure?.();
        return false;
      }
      try {
        const res = await wxRequest<ApiEnvelope<TokenResponse>>({
          url: `${baseUrl}${API_PATHS.authRefresh}`,
          method: 'POST',
          header: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          data: { refreshToken },
        });
        const envelope = res.data;
        const data = envelope?.data;
        if (
          res.statusCode < 200 ||
          res.statusCode >= 300 ||
          !envelope?.success ||
          !data?.accessToken ||
          !data?.refreshToken
        ) {
          if (res.statusCode === 401 || res.statusCode === 403) {
            await options.onAuthFailure?.();
          }
          return false;
        }
        await options.onTokensRefreshed?.({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        });
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function requestJson<T>(
    path: string,
    init?: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      data?: unknown;
    },
    retried = false,
  ): Promise<T> {
    const res = await wxRequest<ApiEnvelope<T>>({
      url: `${baseUrl}${path}`,
      method: init?.method || 'GET',
      header: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...authHeaders(options),
      },
      data: init?.data,
    });

    if (
      (res.statusCode === 401 || res.statusCode === 403) &&
      !retried &&
      !shouldSkipAuthRetry(path)
    ) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return requestJson<T>(path, init, true);
      }
      const reauthed = await options.tryReauthenticate?.();
      if (reauthed) {
        return requestJson<T>(path, init, true);
      }
    }

    return unwrapEnvelope(res.data ?? null, res.statusCode, path);
  }

  async function uploadMultipart<T>(
    path: string,
    fieldName: string,
    file: MultipartFilePart,
    retried = false,
  ): Promise<T> {
    const res = await new Promise<WechatMiniprogram.UploadFileSuccessCallbackResult>(
      (resolve, reject) => {
        wx.uploadFile({
          url: `${baseUrl}${path}`,
          filePath: file.uri,
          name: fieldName,
          header: {
            Accept: 'application/json',
            ...authHeaders(options),
          },
          success: resolve,
          fail: reject,
        });
      },
    );

    if (
      (res.statusCode === 401 || res.statusCode === 403) &&
      !retried &&
      !shouldSkipAuthRetry(path)
    ) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return uploadMultipart<T>(path, fieldName, file, true);
      }
      const reauthed = await options.tryReauthenticate?.();
      if (reauthed) {
        return uploadMultipart<T>(path, fieldName, file, true);
      }
    }

    let envelope: ApiEnvelope<T> | null = null;
    try {
      envelope = JSON.parse(res.data as string) as ApiEnvelope<T>;
    } catch {
      // non-JSON
    }
    return unwrapEnvelope(envelope, res.statusCode, path);
  }

  async function streamSse(
    path: string,
    body: unknown,
    onEvent: SseEventHandler,
    _streamOptions?: StreamOptions,
    retried = false,
  ): Promise<void> {
    // 小程序：enableChunked + onChunkReceived，复用 shared 的 consumeSseBuffer
    let buffer = '';
    let statusCode = 0;
    let settled = false;

    await new Promise<void>((resolve, reject) => {
      const task = wx.request({
        url: `${baseUrl}${path}`,
        method: 'POST',
        enableChunked: true,
        responseType: 'arraybuffer',
        header: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          ...authHeaders(options),
        },
        data: body,
        success: async (res) => {
          statusCode = res.statusCode;
          if (settled) {
            return;
          }
          if (
            (statusCode === 401 || statusCode === 403) &&
            !retried &&
            !shouldSkipAuthRetry(path)
          ) {
            settled = true;
            try {
              const refreshed = await refreshAccessToken();
              if (refreshed) {
                await streamSse(path, body, onEvent, _streamOptions, true);
                resolve();
                return;
              }
              const reauthed = await options.tryReauthenticate?.();
              if (reauthed) {
                await streamSse(path, body, onEvent, _streamOptions, true);
                resolve();
                return;
              }
            } catch (err) {
              reject(err);
              return;
            }
            reject(new Error('未授权'));
            return;
          }
          if (statusCode < 200 || statusCode >= 300) {
            settled = true;
            reject(new Error(`HTTP ${statusCode} ${path}`));
            return;
          }
          // 有的基础库会在 success 再给整包
          if (res.data) {
            buffer += arrayBufferToText(res.data as ArrayBuffer);
            buffer = consumeSseBuffer(buffer, onEvent);
          }
          if (buffer.trim()) {
            consumeSseBuffer(`${buffer}\n\n`, onEvent);
          }
          settled = true;
          resolve();
        },
        fail: (err) => {
          if (!settled) {
            settled = true;
            reject(new Error(err.errMsg || '网络错误'));
          }
        },
      });

      const maybeTask = task as WechatMiniprogram.RequestTask & {
        onChunkReceived?: (cb: (res: { data: ArrayBuffer }) => void) => void;
      };
      maybeTask.onChunkReceived?.((chunk) => {
        buffer += arrayBufferToText(chunk.data);
        buffer = consumeSseBuffer(buffer, onEvent);
      });
    });
  }

  return {
    get<T>(path: string, params?: QueryParams) {
      return requestJson<T>(`${path}${toQuery(params)}`);
    },
    post<T>(path: string, body?: unknown) {
      return requestJson<T>(path, { method: 'POST', data: body });
    },
    put<T>(path: string, body?: unknown) {
      return requestJson<T>(path, { method: 'PUT', data: body });
    },
    patch<T>(path: string, body?: unknown) {
      return requestJson<T>(path, { method: 'PATCH', data: body });
    },
    delete<T>(path: string) {
      return requestJson<T>(path, { method: 'DELETE' });
    },
    postMultipart<T>(path: string, fieldName: string, file: MultipartFilePart) {
      return uploadMultipart<T>(path, fieldName, file);
    },
    postSse(path, body, onEvent, streamOptions) {
      return streamSse(path, body, onEvent, streamOptions);
    },
  };
}

function wxRequest<T>(option: WechatMiniprogram.RequestOption): Promise<{
  statusCode: number;
  data: T;
}> {
  return new Promise((resolve, reject) => {
    wx.request({
      ...option,
      success: (res) =>
        resolve({
          statusCode: res.statusCode,
          data: res.data as T,
        }),
      fail: (err) => reject(new Error(err.errMsg || '网络错误')),
    });
  });
}
