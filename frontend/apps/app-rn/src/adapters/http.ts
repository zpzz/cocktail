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
import { API_PATHS, readSseStream } from '@cocktail/shared';
import * as FileSystem from 'expo-file-system/legacy';

function toQuery(params?: QueryParams): string {
  if (!params) {
    return '';
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function authHeaders(options?: HttpClientOptions): Record<string, string> {
  const token = options?.getAccessToken?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 登录/注册/刷新本身不走 401→refresh，避免死循环 */
function shouldSkipRefresh(path: string): boolean {
  return (
    path.startsWith(API_PATHS.authLogin) ||
    path.startsWith(API_PATHS.authRegister) ||
    path.startsWith(API_PATHS.authRefresh)
  );
}

export function createFetchHttpClient(
  baseUrl: string,
  options: HttpClientOptions = {},
): HttpClient {
  /** 并发 401 共用一次 refresh，避免 refresh 旋转作废 */
  let refreshInFlight: Promise<boolean> | null = null;

  async function refreshAccessToken(): Promise<boolean> {
    if (refreshInFlight) {
      return refreshInFlight;
    }
    refreshInFlight = (async () => {
      const refreshToken = options.getRefreshToken?.();
      if (!refreshToken) {
        // 没有 refresh 却 401：本地登录态不可用
        await options.onAuthFailure?.();
        return false;
      }
      try {
        const response = await fetch(`${baseUrl}${API_PATHS.authRefresh}`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });
        let envelope: ApiEnvelope<TokenResponse> | null = null;
        try {
          envelope = (await response.json()) as ApiEnvelope<TokenResponse>;
        } catch {
          // non-JSON
        }
        const data = envelope?.data;
        if (
          !response.ok ||
          !envelope?.success ||
          !data?.accessToken ||
          !data?.refreshToken
        ) {
          // 仅「刷新令牌失效」才清登录；网络抖动不踢下线
          if (response.status === 401 || response.status === 403) {
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
        // 网络错误：保留本地登录态，让调用方看到原请求错误
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function parseJson<T>(response: Response, path: string): Promise<T> {
    let envelope: ApiEnvelope<T> | null = null;
    try {
      envelope = (await response.json()) as ApiEnvelope<T>;
    } catch {
      // non-JSON
    }

    if (!response.ok) {
      throw new Error(envelope?.message || `HTTP ${response.status} ${path}`);
    }

    if (envelope && typeof envelope.success === 'boolean') {
      if (!envelope.success) {
        throw new Error(envelope.message || envelope.code || '请求失败');
      }
      return envelope.data;
    }

    return envelope as unknown as T;
  }

  async function requestJson<T>(
    path: string,
    init?: RequestInit,
    retried = false,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...authHeaders(options),
        ...init?.headers,
      },
    });

    if (response.status === 401 && !retried && !shouldSkipRefresh(path)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return requestJson<T>(path, init, true);
      }
    }

    return parseJson<T>(response, path);
  }

  async function uploadMultipart<T>(
    path: string,
    fieldName: string,
    file: MultipartFilePart,
    retried = false,
  ): Promise<T> {
    // 用 expo-file-system 原生上传，避开 Expo FormData/File 的坑
    const result = await FileSystem.uploadAsync(`${baseUrl}${path}`, file.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName,
      mimeType: file.type || 'image/jpeg',
      headers: {
        Accept: 'application/json',
        ...authHeaders(options),
      },
    });

    if (result.status === 401 && !retried && !shouldSkipRefresh(path)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return uploadMultipart<T>(path, fieldName, file, true);
      }
    }

    let envelope: ApiEnvelope<T> | null = null;
    try {
      envelope = JSON.parse(result.body) as ApiEnvelope<T>;
    } catch {
      // non-JSON
    }

    if (result.status < 200 || result.status >= 300) {
      throw new Error(envelope?.message || `HTTP ${result.status} ${path}`);
    }
    if (envelope && typeof envelope.success === 'boolean') {
      if (!envelope.success) {
        throw new Error(envelope.message || envelope.code || '请求失败');
      }
      return envelope.data;
    }
    return envelope as unknown as T;
  }

  async function streamSse(
    path: string,
    body: unknown,
    onEvent: SseEventHandler,
    streamOptions?: StreamOptions,
    retried = false,
  ): Promise<void> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...authHeaders(options),
      },
      body: JSON.stringify(body),
      signal: streamOptions?.signal,
    });

    if (response.status === 401 && !retried && !shouldSkipRefresh(path)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return streamSse(path, body, onEvent, streamOptions, true);
      }
    }

    if (!response.ok) {
      throw new Error(await sseErrorMessage(response, path));
    }
    if (!response.body) {
      throw new Error('当前环境不支持流式响应');
    }
    await readSseStream(response.body, onEvent);
  }

  return {
    get<T>(path: string, params?: QueryParams) {
      return requestJson<T>(`${path}${toQuery(params)}`);
    },
    post<T>(path: string, body?: unknown) {
      return requestJson<T>(path, {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
    put<T>(path: string, body?: unknown) {
      return requestJson<T>(path, {
        method: 'PUT',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
    patch<T>(path: string, body?: unknown) {
      return requestJson<T>(path, {
        method: 'PATCH',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
    delete<T>(path: string) {
      return requestJson<T>(path, { method: 'DELETE' });
    },
    postMultipart<T>(path: string, fieldName: string, file: MultipartFilePart) {
      return uploadMultipart<T>(path, fieldName, file);
    },
    postSse(
      path: string,
      body: unknown,
      onEvent: SseEventHandler,
      streamOptions?: StreamOptions,
    ) {
      return streamSse(path, body, onEvent, streamOptions);
    },
  };
}

async function sseErrorMessage(response: Response, path: string): Promise<string> {
  try {
    const data = (await response.json()) as Partial<ApiEnvelope<unknown>>;
    if (data.message) {
      return data.message;
    }
  } catch {
    // ignore
  }
  return `HTTP ${response.status} ${path}`;
}
