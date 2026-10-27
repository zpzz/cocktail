import { resolveMediaUrl as resolveMediaUrlShared } from '@cocktail/shared';
import { API_BASE_URL, MEDIA_BASE_URL } from '../config';

export function resolveApiBaseUrl(): string {
  return API_BASE_URL.replace(/\/$/, '');
}

export function resolveMediaBaseUrl(): string {
  return MEDIA_BASE_URL.replace(/\/$/, '');
}

export function resolveMediaUrl(url?: string | null): string {
  return resolveMediaUrlShared(url, { mediaBaseUrl: resolveMediaBaseUrl() });
}

/** 将 `/api/cocktail/assets/...` 拼到 API 基址；已是 http(s) 则原样返回。 */
export function resolveAssetUrl(url?: string | null): string {
  if (!url) {
    return '';
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const base = resolveApiBaseUrl();
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}
