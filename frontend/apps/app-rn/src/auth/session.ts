import {
  API_PATHS,
  authHydrated,
  signedOut,
  type ApiEnvelope,
  type TokenResponse,
} from '@cocktail/shared';
import { apiBaseUrl, authService } from '../api';
import type { AppDispatch } from '../store';
import {
  clearPersistedAuth,
  loadPersistedAuth,
  savePersistedAuth,
  type PersistedAuth,
} from './storage';

/** Strict Mode / 快速连刷时共用一次 hydrate，避免 refresh 旋转把第二次请求打成失效 */
let hydrateInFlight: Promise<void> | null = null;

/** 启动换票用裸 fetch，不依赖 Redux 里是否已有 token */
async function refreshTokensRaw(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(`${apiBaseUrl}${API_PATHS.authRefresh}`, {
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
    throw new Error(envelope?.message || '刷新令牌失败');
  }
  return data;
}

async function doHydrate(dispatch: AppDispatch): Promise<void> {
  try {
    const saved = await loadPersistedAuth();
    if (!saved) {
      dispatch(
        authHydrated({
          accessToken: null,
          refreshToken: null,
          username: null,
          nickname: null,
        }),
      );
      return;
    }

    // 页面刷新后 Redux 清空，本地 access 可能已过期：先 refresh 再进主界面
    try {
      const tokens = await refreshTokensRaw(saved.refreshToken);
      const session: PersistedAuth = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        username: saved.username,
        nickname: saved.nickname,
      };
      await savePersistedAuth(session);
      dispatch(authHydrated(session));
      return;
    } catch {
      // refresh 失败：先灌入本地，后续 401 再由 http 拦截器处理
      dispatch(
        authHydrated({
          accessToken: saved.accessToken,
          refreshToken: saved.refreshToken,
          username: saved.username,
          nickname: saved.nickname,
        }),
      );
      return;
    }
  } catch {
    // ignore corrupt storage
  }
  dispatch(
    authHydrated({
      accessToken: null,
      refreshToken: null,
      username: null,
      nickname: null,
    }),
  );
}

export async function hydrateAuth(dispatch: AppDispatch) {
  if (hydrateInFlight) {
    return hydrateInFlight;
  }
  hydrateInFlight = doHydrate(dispatch).finally(() => {
    hydrateInFlight = null;
  });
  return hydrateInFlight;
}

export async function performSignOut(dispatch: AppDispatch) {
  try {
    await authService.logout();
  } catch {
    // 本地退出即可
  }
  await clearPersistedAuth();
  dispatch(signedOut());
}
