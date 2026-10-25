import type { HttpClient, QueryParams, SseEventHandler, StreamOptions } from '@cocktail/shared';
import { readSseStream } from '@cocktail/shared';

function toQuery(params?: QueryParams): string {
  if (!params) {
    return '';
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export function createFetchHttpClient(baseUrl: string): HttpClient {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, path));
    }
    return (await response.json()) as T;
  }

  return {
    get<T>(path: string, params?: QueryParams) {
      return request<T>(`${path}${toQuery(params)}`);
    },
    post<T>(path: string, body?: unknown) {
      return request<T>(path, {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
    async postSse(
      path: string,
      body: unknown,
      onEvent: SseEventHandler,
      options?: StreamOptions,
    ) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response, path));
      }
      if (!response.body) {
        throw new Error('当前环境不支持流式响应');
      }
      await readSseStream(response.body, onEvent);
    },
  };
}

async function errorMessage(response: Response, path: string): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string };
    if (data.detail) {
      return data.detail;
    }
  } catch {
    // ignore non-JSON error bodies
  }
  return `HTTP ${response.status} ${path}`;
}
