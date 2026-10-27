import { hydrateAuth } from '../auth/session';
import { store } from '../store';

/** 确保 auth 已 hydrate；未登录则 reLaunch 登录页。返回 true 表示可继续。 */
export async function requireAuth(): Promise<boolean> {
  if (!store.getState().auth.hydrated) {
    await hydrateAuth(store.dispatch);
  }
  const { accessToken, hydrated } = store.getState().auth;
  if (!hydrated) {
    return false;
  }
  if (!accessToken) {
    wx.reLaunch({ url: '/pages/auth/index' });
    return false;
  }
  return true;
}
