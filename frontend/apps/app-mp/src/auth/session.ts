import {
  API_PATHS,
  authHydrated,
  signedOut,
  type ApiEnvelope,
  type TokenResponse,
} from '@cocktail/shared';
import { apiBaseUrl, authService } from '../api';
import { store, type AppDispatch } from '../store';
import {
  clearPersistedAuth,
  loadPersistedAuth,
  savePersistedAuth,
  type PersistedAuth,
} from './storage';

let hydrateInFlight: Promise<void> | null = null;
let hydrateEpoch = 0;

/** 避免慢请求结束后的空结果覆盖刚登录的态 */
function safeHydrate(
  dispatch: AppDispatch,
  payload: {
    accessToken: string | null;
    refreshToken: string | null;
    username: string | null;
    nickname: string | null;
  },
  epoch: number,
) {
  if (epoch !== hydrateEpoch) {
    return;
  }
  const current = store.getState().auth;
  if (current.accessToken && !payload.accessToken) {
    return;
  }
  dispatch(authHydrated(payload));
}

async function refreshTokensRaw(refreshToken: string): Promise<TokenResponse> {
  const data = await new Promise<ApiEnvelope<TokenResponse>>((resolve, reject) => {
    wx.request({
      url: `${apiBaseUrl}${API_PATHS.authRefresh}`,
      method: 'POST',
      header: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      data: { refreshToken },
      success: (res) => resolve(res.data as ApiEnvelope<TokenResponse>),
      fail: (err) => reject(new Error(err.errMsg || '刷新失败')),
    });
  });
  if (!data?.success || !data.data?.accessToken || !data.data?.refreshToken) {
    throw new Error(data?.message || '刷新令牌失败');
  }
  return data.data;
}

async function doHydrate(dispatch: AppDispatch, epoch: number): Promise<void> {
  try {
    const saved = await loadPersistedAuth();
    if (!saved) {
      safeHydrate(
        dispatch,
        {
          accessToken: null,
          refreshToken: null,
          username: null,
          nickname: null,
        },
        epoch,
      );
      return;
    }
    try {
      const tokens = await refreshTokensRaw(saved.refreshToken);
      const session: PersistedAuth = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        username: saved.username,
        nickname: saved.nickname,
      };
      await savePersistedAuth(session);
      safeHydrate(dispatch, session, epoch);
      return;
    } catch {
      safeHydrate(dispatch, saved, epoch);
      return;
    }
  } catch {
    // ignore
  }
  safeHydrate(
    dispatch,
    {
      accessToken: null,
      refreshToken: null,
      username: null,
      nickname: null,
    },
    epoch,
  );
}

export async function hydrateAuth(dispatch: AppDispatch) {
  if (hydrateInFlight) {
    return hydrateInFlight;
  }
  const epoch = ++hydrateEpoch;
  hydrateInFlight = doHydrate(dispatch, epoch).finally(() => {
    hydrateInFlight = null;
  });
  return hydrateInFlight;
}

/** 登录成功后作废进行中的 hydrate，防止空结果冲掉登录 */
export function bumpAuthEpoch() {
  hydrateEpoch += 1;
}

export async function performSignOut(dispatch: AppDispatch) {
  try {
    await authService.logout();
  } catch {
    // local logout
  }
  await clearPersistedAuth();
  dispatch(signedOut());
}
