const DEFAULT_MINIO_BUCKET = 'cocktail-images';

export type ResolveMediaUrlOptions = {
  /** AI 媒体代理基址，如 http://host:8000（无尾斜杠） */
  mediaBaseUrl: string;
  minioBucket?: string;
};

/**
 * 将配方/材料图片地址解析为客户端可加载的 URL。
 * - 已是 `/api/media/...`：拼到 mediaBaseUrl
 * - 本机 MinIO：改走同源 `/api/media/{key}`
 * - 公网 MinIO：原样返回
 */
export function resolveMediaUrl(
  url: string | null | undefined,
  options: ResolveMediaUrlOptions,
): string {
  if (!url) {
    return '';
  }
  const mediaBase = options.mediaBaseUrl.replace(/\/$/, '');
  const bucket = options.minioBucket || DEFAULT_MINIO_BUCKET;

  if (url.startsWith('/api/media/')) {
    return `${mediaBase}${url}`;
  }
  try {
    const parsed = new URL(url);
    const marker = `/${bucket}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) {
      return url;
    }
    const key = parsed.pathname.slice(index + marker.length);
    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2') {
      return `${mediaBase}/api/media/${key}`;
    }
    return url;
  } catch {
    return url;
  }
}
