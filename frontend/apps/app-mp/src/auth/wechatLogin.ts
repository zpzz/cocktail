import {
  API_PATHS,
  signedIn,
  type ApiEnvelope,
  type TokenResponse,
  type UserResponse,
} from '@cocktail/shared';
import { resolveApiBaseUrl } from '../adapters/apiBase';
import { store } from '../store';
import { bumpAuthEpoch } from './epoch';
import { savePersistedAuth, type PersistedAuth } from './storage';

let loginInFlight: Promise<boolean> | null = null;

export type WxProfileInput = {
  nickName?: string;
  /** 本地临时路径（chooseAvatar）或已是 http(s) /api 路径 */
  avatarUrl?: string;
};

const REQUEST_TIMEOUT_MS = 20000;

function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) {
          resolve(res.code);
          return;
        }
        reject(new Error('wx.login 未返回 code'));
      },
      fail: (err) => reject(new Error(err.errMsg || 'wx.login 失败')),
    });
  });
}

function isRemoteUrl(url?: string | null): boolean {
  return !!url && (/^https?:\/\//i.test(url) || url.startsWith('/api/'));
}

function isLocalAvatarPath(url?: string | null): boolean {
  return !!url && !isRemoteUrl(url);
}

async function wechatLoginRaw(payload: {
  code: string;
  nickname?: string;
  avatarUrl?: string;
}): Promise<TokenResponse> {
  const data = await new Promise<ApiEnvelope<TokenResponse>>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const task = wx.request({
      url: `${resolveApiBaseUrl()}${API_PATHS.authWechat}`,
      method: 'POST',
      timeout: REQUEST_TIMEOUT_MS,
      header: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      data: payload,
      success: (res) => {
        finish(() => {
          const envelope = res.data as ApiEnvelope<TokenResponse>;
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(envelope?.message || `登录失败(${res.statusCode})`));
            return;
          }
          resolve(envelope);
        });
      },
      fail: (err) => {
        finish(() => reject(new Error(err.errMsg || '微信登录失败')));
      },
    });
    const timer = setTimeout(() => {
      finish(() => {
        try {
          task.abort();
        } catch {
          // ignore
        }
        reject(new Error('登录超时，请检查后端或网络'));
      });
    }, REQUEST_TIMEOUT_MS + 1000);
  });
  if (!data?.success || !data.data?.accessToken || !data.data?.refreshToken) {
    throw new Error(data?.message || '微信登录失败');
  }
  return data.data;
}

async function uploadLocalAvatar(localPath: string): Promise<string | null> {
  const token = store.getState().auth.accessToken;
  if (!token) {
    return null;
  }
  try {
    const res = await new Promise<WechatMiniprogram.UploadFileSuccessCallbackResult>(
      (resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          fn();
        };
        const task = wx.uploadFile({
          url: `${resolveApiBaseUrl()}${API_PATHS.authAvatar}`,
          filePath: localPath,
          name: 'file',
          timeout: REQUEST_TIMEOUT_MS,
          header: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          success: (r) => finish(() => resolve(r)),
          fail: (err) => finish(() => reject(new Error(err.errMsg || '头像上传失败'))),
        });
        const timer = setTimeout(() => {
          finish(() => {
            try {
              task.abort();
            } catch {
              // ignore
            }
            reject(new Error('头像上传超时'));
          });
        }, REQUEST_TIMEOUT_MS + 1000);
      },
    );
    const envelope = JSON.parse(res.data as string) as ApiEnvelope<UserResponse>;
    if (res.statusCode < 200 || res.statusCode >= 300 || !envelope?.success) {
      return null;
    }
    return envelope.data?.avatarUrl || null;
  } catch {
    return null;
  }
}

/**
 * 微信登录（仅 code → openid；头像/昵称可选，通常在「我的」页再完善）。
 * 若传入本地临时头像路径，上传不阻塞登录结束。
 */
export async function loginWithWechat(options?: {
  showLoading?: boolean;
  force?: boolean;
  interactive?: boolean;
  profile?: WxProfileInput;
}): Promise<boolean> {
  if (!options?.force && store.getState().auth.accessToken) {
    return true;
  }
  if (loginInFlight) {
    return loginInFlight;
  }

  const showLoading = options?.showLoading !== false;
  const profile = options?.profile || {};
  let loadingShown = false;

  loginInFlight = (async () => {
    try {
      if (showLoading) {
        wx.showLoading({ title: '登录中…', mask: true });
        loadingShown = true;
      }

      const code = await wxLoginCode();
      const remoteAvatar = isRemoteUrl(profile.avatarUrl) ? profile.avatarUrl : undefined;
      const tokens = await wechatLoginRaw({
        code,
        nickname: profile.nickName,
        avatarUrl: remoteAvatar,
      });

      const sessionBase: PersistedAuth = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        username: tokens.username || 'wx_user',
        nickname: tokens.nickname || profile.nickName || '微信用户',
        avatarUrl: tokens.avatarUrl || remoteAvatar || null,
      };
      await savePersistedAuth(sessionBase);
      bumpAuthEpoch();
      store.dispatch(signedIn(sessionBase));

      // 先结束 loading，再异步传头像，避免上传卡住导致一直转圈
      if (loadingShown) {
        wx.hideLoading();
        loadingShown = false;
      }

      if (isLocalAvatarPath(profile.avatarUrl)) {
        void uploadLocalAvatar(profile.avatarUrl!).then(async (uploaded) => {
          if (!uploaded) {
            return;
          }
          const auth = store.getState().auth;
          if (!auth.accessToken) {
            return;
          }
          const next: PersistedAuth = {
            accessToken: auth.accessToken,
            refreshToken: auth.refreshToken || sessionBase.refreshToken,
            username: auth.username || sessionBase.username,
            nickname: auth.nickname || sessionBase.nickname,
            avatarUrl: uploaded,
          };
          await savePersistedAuth(next);
          store.dispatch(signedIn(next));
        });
      }

      return true;
    } catch (err) {
      if (loadingShown) {
        wx.hideLoading();
        loadingShown = false;
      }
      const message = err instanceof Error ? err.message : '登录失败，请稍后重试';
      if (message !== '已取消授权') {
        wx.showToast({ title: message.slice(0, 40), icon: 'none', duration: 2500 });
      }
      return false;
    } finally {
      if (loadingShown) {
        wx.hideLoading();
      }
    }
  })().finally(() => {
    loginInFlight = null;
  });

  return loginInFlight;
}
