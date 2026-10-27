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
