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

const MINIO_BUCKET = 'cocktail-images';

export function resolveMediaUrl(url?: string | null): string {
  if (!url) {
    return '';
  }
  if (url.startsWith('/api/media/')) {
    return `${resolveMediaBaseUrl()}${url}`;
  }
  try {
    const parsed = new URL(url);
    const marker = `/${MINIO_BUCKET}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) {
      return url;
    }
    const key = parsed.pathname.slice(index + marker.length);
    const host = parsed.hostname;
    // 本机 MinIO：走 Python 同源代理，真机/模拟器才能加载
    if (host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2') {
      return `${resolveMediaBaseUrl()}/api/media/${key}`;
    }
    // 公网 MinIO：直接用原地址
    return url;
  } catch {
    return url;
  }
}
