import type { SseEventHandler } from '../utils/sse';

export type QueryParams = Record<string, string | number | boolean | undefined>;

export type StreamOptions = {
  signal?: AbortSignal;
};

export interface HttpClient {
  get<T>(path: string, params?: QueryParams): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  postSse(
    path: string,
    body: unknown,
    onEvent: SseEventHandler,
    options?: StreamOptions,
  ): Promise<void>;
}
