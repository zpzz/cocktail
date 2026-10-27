import { resolveMediaUrl as resolveMediaUrlShared } from '@cocktail/shared';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function hostFromExpo(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.linkingUri ||
    '';
  const ip = hostUri.match(/(\d+\.\d+\.\d+\.\d+)/);
  if (ip) {
    return ip[1];
  }
  const hostname = hostUri.match(/https?:\/\/([^/:]+)/);
  if (hostname && hostname[1] !== 'exp.host') {
    return hostname[1];
  }
  return null;
}

function resolveHostPort(port: number): string {
  const host = hostFromExpo();
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${port}`;
  }
  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${port}`;
  }
  return `http://127.0.0.1:${port}`;
}

/** Java 业务服务默认端口 8080 */
export function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
  if (fromEnv) {
    return fromEnv;
  }
  return resolveHostPort(8080);
}

/**
 * 图片代理在 Python ai-service（/api/media），默认 :8000。
 * 业务 API 已切到 Java 后，媒体基址需单独解析。
 */
export function resolveMediaBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_MEDIA_BASE_URL?.replace(/\/$/, '');
  if (fromEnv) {
    return fromEnv;
  }
  return resolveHostPort(8000);
}

/** RN 适配：注入 Expo 解析出的 mediaBaseUrl */
export function resolveMediaUrl(url?: string | null): string {
  return resolveMediaUrlShared(url, { mediaBaseUrl: resolveMediaBaseUrl() });
}
