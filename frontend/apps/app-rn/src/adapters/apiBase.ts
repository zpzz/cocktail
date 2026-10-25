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

export function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
  if (fromEnv) {
    return fromEnv;
  }
  const host = hostFromExpo();
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:8000`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }
  return 'http://127.0.0.1:8000';
}

const MINIO_BUCKET = 'cocktail-images';

export function resolveMediaUrl(url?: string | null): string {
  if (!url) {
    return '';
  }
  try {
    const parsed = new URL(url);
    const marker = `/${MINIO_BUCKET}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index >= 0) {
      const key = parsed.pathname.slice(index + marker.length);
      return `${resolveApiBaseUrl()}/api/media/${key}`;
    }
  } catch {
    return url;
  }
  return url;
}
